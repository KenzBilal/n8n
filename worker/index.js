import { createClient } from '@supabase/supabase-js';
import { CohereClient } from 'cohere-ai';
import { Resend } from 'resend';
import { GoogleGenerativeAI } from '@google/generative-ai';
import puppeteer from 'puppeteer';
import dotenv from 'dotenv';
import ws from 'ws';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  realtime: { transport: ws }
});
const cohere = new CohereClient({ token: process.env.COHERE_API_KEY });
const resend = new Resend(process.env.RESEND_API_KEY || 're_YBdNY2TB_Asd3bf4ZAwhYuoUKqaNg3TSH');
const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

let engineRunning = false;
let jobProcessing = false;
const jobQueue = [];
const JOB_DELAY_MS = 6000; // 6s between jobs (10 RPM Cohere Trial limit)

console.log('Worker started. Connecting to Supabase...');

supabase
  .channel('engine-control-channel')
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'engine_control' }, (payload) => {
    const wasRunning = engineRunning;
    engineRunning = payload.new.is_running;
    console.log(`Engine: ${engineRunning ? 'RUNNING' : 'IDLE'}`);
    if (!wasRunning && engineRunning) fetchPendingJobs();
  })
  .subscribe();

supabase
  .channel('jobs-channel')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'jobs' }, (payload) => {
    if (!engineRunning) { console.log('Job received but engine IDLE. Skipping.'); return; }
    jobQueue.push(payload.new);
    processQueue();
  })
  .subscribe(async () => {
    const { data } = await supabase.from('engine_control').select('is_running').eq('id', 1).single();
    if (data) {
      engineRunning = data.is_running;
      console.log(`Connected. Engine is ${engineRunning ? 'RUNNING' : 'IDLE'}.`);
      if (engineRunning) fetchPendingJobs();
    }
  });

async function fetchPendingJobs() {
  if (!engineRunning) return;
  const { data } = await supabase.from('jobs').select('*').eq('status', 'PENDING').order('created_at', { ascending: true });
  if (data && data.length > 0) {
    console.log(`Found ${data.length} pending jobs. Adding to queue.`);
    for (const job of data) {
      if (!jobQueue.find(j => j.id === job.id)) jobQueue.push(job);
    }
    processQueue();
  }
}

async function processQueue() {
  if (jobProcessing || jobQueue.length === 0) return;
  jobProcessing = true;
  const job = jobQueue.shift();
  try {
    await handleJob(job);
  } catch (e) {
    console.error('Queue error:', e.message);
  }
  if (jobQueue.length > 0) {
    console.log(`Queue: ${jobQueue.length} remaining. Waiting ${JOB_DELAY_MS/1000}s...`);
    await new Promise(r => setTimeout(r, JOB_DELAY_MS));
  }
  jobProcessing = false;
  processQueue();
}

// ─── Job Router ───────────────────────────────────────────────────────────────

async function handleJob(job) {
  if (job.status !== 'PENDING') return;
  console.log(`Job [${job.type}] ${job.id} | payload: ${JSON.stringify(job.payload)}`);

  await supabase.from('jobs').update({ status: 'RUNNING', updated_at: new Date().toISOString() }).eq('id', job.id);

  try {
    if (job.type === 'DISCOVER') {
      await handleDiscover(job);
    } else if (job.type === 'PROCESS_REPLY') {
      await handleProcessReply(job);
    } else {
      await handleScrape(job);
    }
    await supabase.from('jobs').update({ status: 'COMPLETED', updated_at: new Date().toISOString() }).eq('id', job.id);
  } catch (error) {
    console.error(`Job ${job.id} failed:`, error.message);
    await supabase.from('jobs').update({ status: 'FAILED', updated_at: new Date().toISOString() }).eq('id', job.id);
  }
}

// ─── DISCOVER: Google Maps scraper ────────────────────────────────────────────

async function handleDiscover(job) {
  const { keyword, location } = job.payload;
  const query = `${keyword} ${location}`;
  console.log(`Discovering leads for: "${query}"`);

  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');

  try {
    const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
    await page.goto(mapsUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForSelector('[role="feed"]', { timeout: 10000 }).catch(() => {});

    // Scroll to load more results
    await page.evaluate(async () => {
      const feed = document.querySelector('[role="feed"]');
      if (feed) {
        for (let i = 0; i < 5; i++) {
          feed.scrollTop += 800;
          await new Promise(r => setTimeout(r, 800));
        }
      }
    });

    // Extract business links
    const businessLinks = await page.$$eval('a[href*="/maps/place/"]', links =>
      [...new Set(links.map(a => a.href).filter(h => h.includes('/maps/place/')))].slice(0, 25)
    );

    console.log(`Found ${businessLinks.length} businesses on Maps`);
    await page.close();

    let queued = 0;
    for (const link of businessLinks) {
      try {
        const bizPage = await browser.newPage();
        await bizPage.goto(link, { waitUntil: 'networkidle2', timeout: 20000 });

        // Extract website from business listing
        const website = await bizPage.evaluate(() => {
          const links = [...document.querySelectorAll('a[href]')];
          const websiteLink = links.find(a =>
            a.getAttribute('data-item-id')?.includes('authority') ||
            a.getAttribute('aria-label')?.toLowerCase().includes('website')
          );
          return websiteLink?.href || null;
        });

        await bizPage.close();

        if (website && !website.includes('google.com') && !website.includes('facebook.com')) {
          const cleanUrl = new URL(website).hostname.replace('www.', '');
          // Queue a scrape job for this domain
          await supabase.from('jobs').insert({
            type: 'SCRAPE',
            status: 'PENDING',
            payload: { target: cleanUrl, source: `discovery:${query}` }
          });
          queued++;
          console.log(`Queued: ${cleanUrl}`);
        }
      } catch (e) {
        // skip failed business pages
      }
    }

    console.log(`✓ Discovery done. Queued ${queued} sites for audit.`);
  } finally {
    await browser.close();
  }
}

// ─── SCRAPE: Deep site audit ──────────────────────────────────────────────────

async function handleScrape(job) {
  const { auditData, contacts } = await runAudit(job.payload.target);

  if (!contacts || contacts.length === 0 || !contacts[0].email) {
    const { data: company } = await supabase.from('companies').insert({
      name: job.payload.target,
      website_url: job.payload.target,
      industry: 'Unknown',
      lead_score: auditData.score,
      status: 'REJECTED',
    }).select().single();

    const { data: audit } = await supabase.from('audits').insert({
      company_id: company.id,
      status: 'COMPLETED',
      total_score: auditData.score
    }).select().single();

    await supabase.from('audit_results').insert({
      audit_id: audit.id,
      category: 'REJECTED',
      raw_data: auditData,
      issues_found: { rejection_reason: "No contact email found", issues: auditData.issues }
    });

    console.log(`✗ ${job.payload.target} | REJECTED: No contact email found.`);
    return;
  }

  const aiAnalysis = await analyzeWithCohere(auditData);

  const { data: company } = await supabase.from('companies').insert({
    name: aiAnalysis.companyName || job.payload.target,
    website_url: job.payload.target,
    industry: aiAnalysis.industry || 'Unknown',
    lead_score: aiAnalysis.leadScore || 50,
    status: 'NEW',
  }).select().single();

  if (contacts.length > 0) {
    await supabase.from('contacts').insert(
      contacts.map((c, i) => ({
        company_id: company.id,
        email: c.email || null,
        linkedin_url: c.linkedin || null,
        is_primary: i === 0,
      }))
    );
  }

  const { data: audit } = await supabase.from('audits').insert({
    company_id: company.id,
    status: 'COMPLETED',
    total_score: auditData.score
  }).select().single();

  await supabase.from('audit_results').insert({
    audit_id: audit.id,
    category: 'AI_PITCH',
    raw_data: auditData,
    issues_found: { pitch: aiAnalysis.pitch, issues: auditData.issues }
  });

  console.log(`✓ ${company.name} | Score: ${auditData.score} | Issues: ${auditData.issues?.length} | Contacts: ${contacts.length}`);

  // ─── Auto-Send Logic ────────────────────────────────────────────────────────
  if (auditData.score < 30 && contacts.length > 0 && contacts[0].email) {
    const targetEmail = contacts[0].email;
    const { count } = await supabase.from('emails')
      .select('*', { count: 'exact', head: true })
      .eq('direction', 'outbound')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    
    if (count < 90) {
      console.log(`Score is < 30. Auto-sending pitch to ${targetEmail} via Resend...`);
      try {
        const { data, error } = await resend.emails.send({
          from: 'Webcord <hello@webcord.in>',
          to: targetEmail,
          subject: 'Quick question about your website',
          html: aiAnalysis.pitch.replace(/\n/g, '<br>')
        });
        if (error) throw error;
        
        await supabase.from('emails').insert({
          company_id: company.id,
          direction: 'outbound',
          subject: 'Quick question about your website',
          body_text: aiAnalysis.pitch
        });
        await supabase.from('companies').update({ status: 'PITCHED' }).eq('id', company.id);
        console.log(`✓ Pitch sent to ${targetEmail} (24h count: ${count + 1})`);
      } catch (err) {
        console.error('Failed to auto-send email:', err.message);
      }
    } else {
      console.log('Skipping auto-send: Daily limit of 90 reached.');
    }
  }
}

// ─── PROCESS_REPLY: Gemini Draft Agent ────────────────────────────────────────

async function handleProcessReply(job) {
  const { email_id, company_id, body_text } = job.payload;
  console.log(`Processing reply for company ${company_id}...`);
  
  const prompt = `
  You are a professional sales closer representing Webcord, a web performance and digital growth agency.
  A potential client just replied to our cold outreach email.
  Read their reply and write a highly professional, persuasive response on behalf of Webcord.
  If they ask questions, answer them confidently in context of Webcord's services (web audits, performance, design, SEO).
  If they want to meet, suggest scheduling a quick call.
  Keep it concise, polite, and persuasive. Sign off as "Webcord Team".
  
  Client Reply:
  "${body_text}"
  
  Respond with only the exact text of the email draft you want me to send. No markdown, no preambles.
  `;

  try {
    const model = gemini.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const response = await model.generateContent(prompt);
    const draftText = response.response.text().trim();
    
    await supabase.from('drafts').insert({
      email_id: email_id,
      draft_text: draftText,
      status: 'pending'
    });
    console.log(`✓ Gemini generated draft for email ${email_id}`);
  } catch (err) {
    console.error('Gemini draft generation failed:', err.message);
  }
}

// ─── Deep Audit ───────────────────────────────────────────────────────────────

async function runAudit(url) {
  console.log(`Auditing ${url}...`);
  if (!url.startsWith('http')) url = 'https://' + url;

  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const issues = [];
  let contacts = [];
  let title = '';
  let loadTimeMs = 0;

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');

    const t0 = Date.now();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    loadTimeMs = Date.now() - t0;
    title = await page.title();

    const checks = await page.evaluate(() => {
      const r = {};
      r.hasH1 = !!document.querySelector('h1');
      r.h1Count = document.querySelectorAll('h1').length;
      r.hasMetaDesc = !!document.querySelector('meta[name="description"]');
      r.metaDescLength = document.querySelector('meta[name="description"]')?.content?.length || 0;
      r.hasTitle = !!document.title;
      r.titleLength = document.title?.length || 0;
      r.hasCanonical = !!document.querySelector('link[rel="canonical"]');
      r.hasOpenGraph = !!document.querySelector('meta[property^="og:"]');
      r.hasTwitterCard = !!document.querySelector('meta[name^="twitter:"]');
      r.hasStructuredData = !!document.querySelector('script[type="application/ld+json"]');
      const imgs = [...document.querySelectorAll('img')];
      r.totalImages = imgs.length;
      r.imagesWithoutAlt = imgs.filter(i => !i.alt || i.alt.trim() === '').length;
      r.hasLazyLoading = imgs.some(i => i.loading === 'lazy');
      r.scriptCount = document.querySelectorAll('script[src]').length;
      const html = document.documentElement.innerHTML;
      r.hasGoogleAnalytics = html.includes('google-analytics.com') || html.includes('gtag(') || html.includes('G-');
      r.hasGTM = html.includes('googletagmanager.com');
      r.hasViewport = !!document.querySelector('meta[name="viewport"]');
      r.hasFavicon = !!(document.querySelector('link[rel="icon"]') || document.querySelector('link[rel="shortcut icon"]'));
      r.hasSocialLinks = html.includes('facebook.com') || html.includes('instagram.com') || html.includes('linkedin.com');
      r.hasForms = !!document.querySelector('form');
      const body = document.body.innerText || '';
      r.wordCount = body.split(/\s+/).filter(Boolean).length;
      r.hasPhoneNumber = /(\+?\d[\d\s\-().]{7,}\d)/.test(body);
      return r;
    });

    if (!checks.hasH1)              issues.push({ category: 'SEO', severity: 'high', issue: 'Missing H1 tag' });
    if (checks.h1Count > 1)         issues.push({ category: 'SEO', severity: 'medium', issue: `Multiple H1 tags (${checks.h1Count})` });
    if (!checks.hasMetaDesc)        issues.push({ category: 'SEO', severity: 'high', issue: 'Missing meta description' });
    if (checks.metaDescLength > 160) issues.push({ category: 'SEO', severity: 'low', issue: `Meta description too long (${checks.metaDescLength} chars)` });
    if (!checks.hasCanonical)       issues.push({ category: 'SEO', severity: 'medium', issue: 'Missing canonical tag' });
    if (!checks.hasOpenGraph)       issues.push({ category: 'SEO', severity: 'medium', issue: 'No Open Graph tags (bad social sharing)' });
    if (!checks.hasTwitterCard)     issues.push({ category: 'SEO', severity: 'low', issue: 'No Twitter Card meta tags' });
    if (!checks.hasStructuredData)  issues.push({ category: 'SEO', severity: 'medium', issue: 'No structured data / Schema.org' });
    if (!checks.hasTitle)           issues.push({ category: 'SEO', severity: 'high', issue: 'Missing page title' });
    if (checks.titleLength > 60)    issues.push({ category: 'SEO', severity: 'low', issue: `Page title too long (${checks.titleLength} chars)` });
    if (checks.imagesWithoutAlt > 0) issues.push({ category: 'Accessibility', severity: 'medium', issue: `${checks.imagesWithoutAlt} image(s) missing alt text` });
    if (!checks.hasViewport)        issues.push({ category: 'Mobile', severity: 'high', issue: 'Missing viewport meta tag — not mobile friendly' });
    if (loadTimeMs > 5000)          issues.push({ category: 'Performance', severity: 'high', issue: `Slow load time: ${(loadTimeMs / 1000).toFixed(1)}s` });
    else if (loadTimeMs > 3000)     issues.push({ category: 'Performance', severity: 'medium', issue: `Load time: ${(loadTimeMs / 1000).toFixed(1)}s (could be faster)` });
    if (!checks.hasLazyLoading && checks.totalImages > 3) issues.push({ category: 'Performance', severity: 'low', issue: 'Images not lazy loaded' });
    if (checks.scriptCount > 10)    issues.push({ category: 'Performance', severity: 'medium', issue: `Heavy page — ${checks.scriptCount} external scripts` });
    if (!checks.hasGoogleAnalytics && !checks.hasGTM) issues.push({ category: 'Analytics', severity: 'high', issue: 'No analytics tracking found' });
    if (!checks.hasFavicon)         issues.push({ category: 'Branding', severity: 'low', issue: 'No favicon' });
    if (!checks.hasSocialLinks)     issues.push({ category: 'Social', severity: 'low', issue: 'No social media links' });
    if (!checks.hasForms)           issues.push({ category: 'Conversion', severity: 'medium', issue: 'No lead capture form' });
    if (!checks.hasPhoneNumber)     issues.push({ category: 'Contact', severity: 'low', issue: 'No phone number on page' });
    if (!url.includes('https'))     issues.push({ category: 'Security', severity: 'high', issue: 'No HTTPS / SSL' });
    if (checks.wordCount < 300)     issues.push({ category: 'Content', severity: 'medium', issue: `Thin content — only ${checks.wordCount} words` });

    const penalties = { high: 15, medium: 7, low: 3 };
    let score = 100;
    for (const i of issues) score -= (penalties[i.severity] || 0);
    score = Math.max(score, 0);

    console.log(`Score: ${score} | Issues: ${issues.length}`);

    const mainContacts = await extractContacts(page);
    contacts.push(...mainContacts);

    const contactLinks = await page.$$eval('a', links =>
      links.map(a => ({ href: a.href, text: a.textContent?.toLowerCase().trim() }))
        .filter(a => a.href && (a.text?.includes('contact') || a.text?.includes('about') || a.text?.includes('team')))
        .slice(0, 2).map(a => a.href)
    );

    for (const cu of contactLinks) {
      try {
        const cp = await browser.newPage();
        await cp.goto(cu, { waitUntil: 'networkidle2', timeout: 15000 });
        contacts.push(...await extractContacts(cp));
        await cp.close();
      } catch (e) { /* skip */ }
    }

    await page.close();

    const seen = new Set();
    contacts = contacts.filter(c => {
      const key = c.email || c.linkedin;
      if (!key || seen.has(key)) return false;
      seen.add(key); return true;
    });

    await browser.close();
    return { auditData: { url, title, score, loadTimeMs, ssl: url.includes('https'), issues, summary: { totalIssues: issues.length, ...checks } }, contacts };

  } catch (e) {
    console.error('Audit error:', e.message);
    await browser.close();
    return { auditData: { url, title, score: 10, loadTimeMs: 0, ssl: false, issues: [{ category: 'General', severity: 'high', issue: 'Site unreachable or timed out' }], summary: {} }, contacts: [] };
  }
}

// ─── Contact Extractor ────────────────────────────────────────────────────────

async function extractContacts(page) {
  return page.evaluate(() => {
    const contacts = [];
    const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
    const body = document.body.innerText || '';
    const emails = [...new Set(body.match(emailRegex) || [])].filter(e =>
      !e.includes('example') && !e.includes('test@') && !e.endsWith('.png') && !e.endsWith('.jpg')
    );
    document.querySelectorAll('a[href^="mailto:"]').forEach(a => {
      const e = a.href.replace('mailto:', '').split('?')[0].trim();
      if (e && !emails.includes(e)) emails.push(e);
    });
    const linkedins = [...new Set([...document.querySelectorAll('a[href*="linkedin.com/in/"]')].map(a => a.href))];
    emails.slice(0, 3).forEach((email, i) => contacts.push({ email, linkedin: linkedins[i] || null }));
    linkedins.slice(emails.length, emails.length + 2).forEach(linkedin => contacts.push({ email: null, linkedin }));
    return contacts.slice(0, 5);
  });
}

// ─── Cohere Analysis ────────────────────────────────────────────────────────

async function analyzeWithCohere(auditData) {
  console.log('Analyzing with Cohere (Command R+)...');
  const issuesSummary = auditData.issues?.map(i => `[${i.severity.toUpperCase()}] ${i.category}: ${i.issue}`).join('\n') || 'None';

  const prompt = `
  You are a sharp web agency consultant who closes clients by being specific.
  
  Website: ${auditData.url}
  Title: "${auditData.title}"
  Score: ${auditData.score}/100
  Load Time: ${(auditData.loadTimeMs / 1000).toFixed(1)}s
  SSL: ${auditData.ssl ? 'Yes' : 'NO'}
  
  Issues (${auditData.issues?.length || 0}):
  ${issuesSummary}
  
  Return a JSON object with:
  1. "companyName": name from URL/title
  2. "industry": specific industry (e.g. "Plumbing Services" not "Services")
  3. "leadScore": 1-100, lower = worse site = hotter lead
  4. "pitch": cold email max 180 words. You represent Webcord, a web performance and digital growth agency. Reference 2-3 specific issues found on their site. Sign off as "Webcord Team". No "I noticed your website" or "I hope this finds you well". Sound professional, direct, and confident.
  `;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await cohere.chat({
        message: prompt,
        model: 'command-r-plus-08-2024',
        responseFormat: { type: 'json_object' }
      });
      
      return JSON.parse(response.text);
    } catch (e) {
      const isRetryable = e.message?.includes('429') || e.message?.includes('rate limit');
      
      if (isRetryable && attempt < 3) {
        const wait = attempt * 15000; // wait 15s, 30s on rate limits
        console.log(`Cohere throttled (429). Waiting ${wait/1000}s...`);
        await new Promise(r => setTimeout(r, wait));
      } else {
        console.error(`Cohere error:`, e.message);
        return { companyName: auditData.url, pitch: 'AI analysis failed.', leadScore: 50 };
      }
    }
  }
  return { companyName: auditData.url, pitch: 'All models unavailable.', leadScore: 50 };
}
