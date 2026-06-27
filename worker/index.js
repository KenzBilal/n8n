import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import puppeteer from 'puppeteer';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

console.log('Engine started. Listening for jobs...');

supabase
  .channel('custom-all-channel')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'jobs' }, (payload) => {
      console.log('Engine triggered! New job:', payload.new);
      handleJob(payload.new);
  })
  .subscribe();

async function handleJob(job) {
  if (job.status !== 'PENDING') return;

  await supabase.from('jobs').update({ status: 'RUNNING' }).eq('id', job.id);
  console.log(`Processing job ${job.id} | Target: ${job.payload.target}`);

  try {
    // 1. Scrape with Puppeteer
    const auditData = await runAudit(job.payload.target);
    
    // 2. AI Analysis & Pitch Generation
    const aiAnalysis = await analyzeWithGemini(auditData);

    // 3. Save to DB
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

    await supabase.from('jobs').update({ status: 'COMPLETED' }).eq('id', job.id);
    console.log(`Job ${job.id} finished successfully.`);
  } catch (error) {
    console.error('Job failed:', error);
    await supabase.from('jobs').update({ status: 'FAILED' }).eq('id', job.id);
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
  
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    const h1 = await page.$('h1');
    if (!h1) missingH1 = true;
  } catch(e) {
    performanceScore = 10;
  }
  
  await browser.close();
  
  return {
    url,
    performanceScore,
    missingH1,
    ssl: url.includes('https'),
  };
}

async function analyzeWithGemini(auditData) {
  console.log('Sending raw data to Gemini...');
  const prompt = `
  You are an expert agency consultant. Analyze this raw website audit data:
  ${JSON.stringify(auditData)}
  
  Return a JSON object with:
  1. "companyName": Guessed name of the company.
  2. "industry": Guessed industry.
  3. "leadScore": 1-100 (lower score if performance is bad or missing H1).
  4. "pitch": A brutally honest, highly converting email pitch explaining their exact failures (e.g. "You are missing an H1") and offering our agency's help.
  
  Respond ONLY with valid JSON.
  `;

  const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const response = await model.generateContent(prompt);

  try {
    const text = response.response.text().replace(/```json/g, '').replace(/```/g, '');
    return JSON.parse(text);
  } catch (e) {
    console.error('Failed to parse Gemini response');
    return { pitch: response.text() };
  }
}
