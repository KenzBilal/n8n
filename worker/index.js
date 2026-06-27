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

supabase
  .channel('engine-control-channel')
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'engine_control' }, (payload) => {
    engineRunning = payload.new.is_running;
    console.log(`Engine status changed: ${engineRunning ? 'RUNNING' : 'IDLE'}`);
  })
  .subscribe();

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
    // 1. Scrape site + extract contacts
    const { auditData, contacts } = await runAudit(job.payload.target);

    // 2. AI analysis
    const aiAnalysis = await analyzeWithGemini(auditData);

    // 3. Save company
    const { data: company } = await supabase.from('companies').insert({
      name: aiAnalysis.companyName || job.payload.target,
      website_url: job.payload.target,
      industry: aiAnalysis.industry || 'Unknown',
      lead_score: aiAnalysis.leadScore || 50
    }).select().single();

    // 4. Save contacts
    if (contacts.length > 0) {
      const contactRows = contacts.map((c, i) => ({
        company_id: company.id,
        email: c.email || null,
        linkedin_url: c.linkedin || null,
        first_name: c.name?.split(' ')[0] || null,
        last_name: c.name?.split(' ').slice(1).join(' ') || null,
        is_primary: i === 0,
      }));
      await supabase.from('contacts').insert(contactRows);
      console.log(`✓ Saved ${contacts.length} contact(s)`);
    }

    // 5. Save audit
    const { data: audit } = await supabase.from('audits').insert({
      company_id: company.id,
      status: 'COMPLETED',
      total_score: auditData.performanceScore
    }).select().single();

    // 6. Save AI pitch
    await supabase.from('audit_results').insert({
      audit_id: audit.id,
      category: 'AI_PITCH',
      raw_data: { ...auditData, contacts },
      issues_found: { pitch: aiAnalysis.pitch }
    });

    await supabase.from('jobs').update({ status: 'COMPLETED', updated_at: new Date().toISOString() }).eq('id', job.id);
    console.log(`✓ Job ${job.id} completed for ${company.name} | Contacts: ${contacts.length}`);
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

  let performanceScore = 100;
  let missingH1 = false;
  let missingMeta = false;
  let title = '';
  let contacts = [];

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // Basic audit checks
    const h1 = await page.$('h1');
    const meta = await page.$('meta[name="description"]');
    title = await page.title();
    if (!h1) { missingH1 = true; performanceScore -= 20; }
    if (!meta) { missingMeta = true; performanceScore -= 10; }

    // Extract contacts from main page
    const mainContacts = await extractContacts(page);
    contacts.push(...mainContacts);

    // Try contact page
    const contactLinks = await page.$$eval('a', links =>
      links
        .map(a => ({ href: a.href, text: a.textContent?.toLowerCase().trim() }))
        .filter(a => a.href && (a.text?.includes('contact') || a.text?.includes('about') || a.text?.includes('team')))
        .slice(0, 2)
        .map(a => a.href)
    );

    for (const contactUrl of contactLinks) {
      try {
        const contactPage = await browser.newPage();
        await contactPage.goto(contactUrl, { waitUntil: 'networkidle2', timeout: 15000 });
        const pageContacts = await extractContacts(contactPage);
        contacts.push(...pageContacts);
        await contactPage.close();
      } catch (e) {
        // silently skip failed contact pages
      }
    }

    await page.close();
  } catch (e) {
    console.error('Puppeteer error:', e.message);
    performanceScore = 10;
  }

  await browser.close();

  // Deduplicate contacts by email
  const seen = new Set();
  contacts = contacts.filter(c => {
    const key = c.email || c.linkedin;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`Found ${contacts.length} unique contacts`);

  return {
    auditData: {
      url,
      title,
      performanceScore: Math.max(performanceScore, 0),
      missingH1,
      missingMeta,
      ssl: url.includes('https'),
    },
    contacts,
  };
}

async function extractContacts(page) {
  return page.evaluate(() => {
    const contacts = [];
    const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
    const phoneRegex = /(\+?\d[\d\s\-().]{7,}\d)/g;

    const bodyText = document.body.innerText || '';

    // Extract emails from text
    const emails = [...new Set(bodyText.match(emailRegex) || [])].filter(e =>
      !e.includes('example') && !e.includes('test@') && !e.endsWith('.png') && !e.endsWith('.jpg')
    );

    // Extract emails from mailto links
    document.querySelectorAll('a[href^="mailto:"]').forEach(a => {
      const email = a.href.replace('mailto:', '').split('?')[0].trim();
      if (email && !emails.includes(email)) emails.push(email);
    });

    // Extract LinkedIn URLs
    const linkedinLinks = [...new Set(
      [...document.querySelectorAll('a[href*="linkedin.com/in/"]')]
        .map(a => a.href)
    )];

    // Extract phone numbers
    const phones = [...new Set(bodyText.match(phoneRegex) || [])].slice(0, 2);

    // Build contact objects
    emails.slice(0, 3).forEach((email, i) => {
      contacts.push({ email, linkedin: linkedinLinks[i] || null, phone: phones[i] || null });
    });

    // LinkedIn only (no email)
    linkedinLinks.slice(emails.length, emails.length + 2).forEach(linkedin => {
      contacts.push({ email: null, linkedin, phone: null });
    });

    return contacts.slice(0, 5); // max 5 contacts per site
  });
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

  const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];

  for (const modelName of models) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`Trying ${modelName} (attempt ${attempt})...`);
        const model = ai.getGenerativeModel({ model: modelName });
        const response = await model.generateContent(prompt);
        const text = response.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(text);
      } catch (e) {
        const is503 = e.message?.includes('503') || e.message?.includes('overloaded') || e.message?.includes('high demand');
        if (is503 && attempt < 3) {
          const wait = attempt * 4000;
          console.log(`${modelName} overloaded. Waiting ${wait / 1000}s...`);
          await new Promise(r => setTimeout(r, wait));
        } else if (is503) {
          console.log(`${modelName} exhausted retries. Trying next model...`);
          break;
        } else {
          console.error(`Gemini error (${modelName}):`, e.message);
          return { companyName: auditData.url, pitch: 'AI analysis failed.', leadScore: 50 };
        }
      }
    }
  }

  return { companyName: auditData.url, pitch: 'All models unavailable. Try again later.', leadScore: 50 };
}
