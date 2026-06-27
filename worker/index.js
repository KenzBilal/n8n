import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import puppeteer from 'puppeteer';
import dotenv from 'dotenv';
import ws from 'ws';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  realtime: { transport: ws }
});
const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

let engineRunning = false;

console.log('Worker process started. Connecting to Supabase...');

// Listen to engine_control table for start/stop from dashboard
supabase
  .channel('engine-control-channel')
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'engine_control' }, (payload) => {
    engineRunning = payload.new.is_running;
    console.log(`Engine status changed: ${engineRunning ? 'RUNNING' : 'IDLE'}`);
  })
  .subscribe();

// Listen to jobs table for new work
supabase
  .channel('jobs-channel')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'jobs' }, (payload) => {
    if (!engineRunning) {
      console.log('Job received but engine is IDLE. Ignoring.');
      return;
    }
    console.log('New job received:', payload.new.id);
    handleJob(payload.new);
  })
  .subscribe(async () => {
    // On connect, sync engine state from DB
    const { data } = await supabase.from('engine_control').select('is_running').eq('id', 1).single();
    if (data) {
      engineRunning = data.is_running;
      console.log(`Connected. Engine is ${engineRunning ? 'RUNNING' : 'IDLE'}.`);
    }
  });

async function handleJob(job) {
  if (job.status !== 'PENDING') return;

  await supabase.from('jobs').update({ status: 'RUNNING', updated_at: new Date().toISOString() }).eq('id', job.id);
  console.log(`Processing job ${job.id} | Target: ${job.payload?.target}`);

  try {
    const auditData = await runAudit(job.payload.target);
    const aiAnalysis = await analyzeWithGemini(auditData);

    const { data: company } = await supabase.from('companies').insert({
      name: aiAnalysis.companyName || job.payload.target,
      website_url: job.payload.target,
      industry: aiAnalysis.industry || 'Unknown',
      lead_score: aiAnalysis.leadScore || 50
    }).select().single();

    await supabase.from('audits').insert({
      company_id: company.id,
      status: 'COMPLETED',
      total_score: auditData.performanceScore
    });

    // Store the AI pitch in audit_results
    await supabase.from('audit_results').insert({
      audit_id: (await supabase.from('audits').select('id').eq('company_id', company.id).single()).data?.id,
      category: 'AI_PITCH',
      raw_data: auditData,
      issues_found: { pitch: aiAnalysis.pitch }
    });

    await supabase.from('jobs').update({ status: 'COMPLETED', updated_at: new Date().toISOString() }).eq('id', job.id);
    console.log(`✓ Job ${job.id} completed for ${company.name}`);
  } catch (error) {
    console.error('Job failed:', error.message);
    await supabase.from('jobs').update({ status: 'FAILED', updated_at: new Date().toISOString() }).eq('id', job.id);
  }
}

async function runAudit(url) {
  console.log(`Auditing ${url}...`);
  if (!url.startsWith('http')) url = 'https://' + url;

  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  let performanceScore = 100;
  let missingH1 = false;
  let missingMeta = false;
  let title = '';

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    const h1 = await page.$('h1');
    const meta = await page.$('meta[name="description"]');
    title = await page.title();
    if (!h1) { missingH1 = true; performanceScore -= 20; }
    if (!meta) { missingMeta = true; performanceScore -= 10; }
  } catch (e) {
    console.error('Puppeteer error:', e.message);
    performanceScore = 10;
  }

  await browser.close();

  return {
    url,
    title,
    performanceScore: Math.max(performanceScore, 0),
    missingH1,
    missingMeta,
    ssl: url.includes('https'),
  };
}

async function analyzeWithGemini(auditData) {
  console.log('Analyzing with Gemini...');
  const prompt = `
  You are an expert web agency consultant. Analyze this website audit data:
  ${JSON.stringify(auditData)}

  Return a JSON object with:
  1. "companyName": Inferred company name from URL or title.
  2. "industry": Inferred industry.
  3. "leadScore": 1-100 score (lower = more problems = higher priority lead).
  4. "pitch": A sharp, professional outreach email (max 150 words) identifying specific problems and offering help. No fluff.

  Respond ONLY with valid JSON. No markdown.
  `;

  const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const response = await model.generateContent(prompt);

  try {
    const text = response.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(text);
  } catch (e) {
    console.error('Failed to parse Gemini response');
    return { companyName: auditData.url, pitch: response.response.text(), leadScore: 50 };
  }
}
