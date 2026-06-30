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
import Groq from "groq-sdk";
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;

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

// Run daily cleanup interval
setInterval(runDailyCleanup, 1000 * 60 * 60 * 24); // Every 24 hours
setTimeout(runDailyCleanup, 5000); // Also run once 5s after boot

async function runDailyCleanup() {
  console.log('Running daily cleanup for 30-day stale leads...');
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('companies')
    .select('id')
    .eq('status', 'PITCHED')
    .lt('created_at', thirtyDaysAgo);

  if (data && data.length > 0) {
    const ids = data.map(d => d.id);
    await supabase.from('companies').update({
      status: 'REJECTED',
    }).in('id', ids);

    // Also update audit results for reason
    for (const id of ids) {
      const { data: audit } = await supabase.from('audits').select('id').eq('company_id', id).single();
      if (audit) {
        await supabase.from('audit_results').update({
          issues_found: { rejection_reason: "No reply after 30 days" }
        }).eq('audit_id', audit.id).eq('category', 'REJECTED'); // Or insert if missing
        
        // Wait, just insert a new REJECTED audit_result row
        await supabase.from('audit_results').insert({
          audit_id: audit.id,
          category: 'REJECTED',
          raw_data: {},
          issues_found: { rejection_reason: "No reply after 30 days" }
        });
      }
    }
    console.log(`✓ Cleaned up ${ids.length} stale leads.`);
  }
}

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

  const hasEmail = contacts && contacts.length > 0 && contacts.some(c => c.email);
  const hasPhone = contacts && contacts.length > 0 && contacts.some(c => c.phone);

  if (!hasEmail && !hasPhone) {
    console.log(`✗ ${job.payload.target} | SKIPPED: No contact info found.`);
    return;
  }

  const aiAnalysis = await analyzeWithCohere(auditData);
  const groqSuggestions = await analyzeWithGroq(auditData);

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
        instagram_url: c.instagram || null,
        phone: c.phone || null,
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
    issues_found: { pitch: aiAnalysis.pitch, suggestions: groqSuggestions, issues: auditData.issues }
  });

  console.log(`✓ ${company.name} | Score: ${auditData.score} | Issues: ${auditData.issues?.length} | Contacts: ${contacts.length}`);

  // ─── Auto-Send Logic ────────────────────────────────────────────────────────
  if (auditData.score <= 60 && contacts.length > 0 && contacts[0].email) {
    const targetEmail = contacts[0].email;
    const { count } = await supabase.from('emails')
      .select('*', { count: 'exact', head: true })
      .eq('direction', 'outbound')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    
    if (count < 90) {
      console.log(`Score is <= 60. Auto-sending pitch to ${targetEmail} via Resend...`);
      try {
        const htmlTemplate = `
          <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px; line-height: 1.6; color: #111;">
            <p>${aiAnalysis.pitch.replace(/\n/g, '<br>')}</p>
            <br>
            <hr style="border: none; border-top: 1px solid #eaeaea; margin: 24px 0;">
            <div style="font-size: 12px; color: #666;">
              <strong>Webcord Team</strong><br>
              <a href="https://webcord.in" style="color: #666; text-decoration: none;">webcord.in</a> • Growth & Performance
            </div>
          </div>
        `;
        
        const { data, error } = await resend.emails.send({
          from: 'Webcord <hello@webcord.in>',
          to: targetEmail,
          subject: 'Quick question about your website',
          html: htmlTemplate
        });
        if (error) throw error;
        
        await supabase.from('emails').insert({
          company_id: company.id,
          direction: 'outbound',
          subject: 'Quick question about your website',
          body_text: aiAnalysis.pitch // Keep plaintext for dashboard
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
  
  // 1. Classify Intent via Groq
  const intentPrompt = `
  Analyze this email reply to a cold outreach. Is the prospect rejecting us/not interested?
  Reply ONLY with "REJECTED" or "INTERESTED".
  Email: "${body_text}"
  `;
  const completion = await groq.chat.completions.create({
    messages: [{ role: "user", content: intentPrompt }],
    model: "llama-3.1-8b-instant",
    temperature: 0.3,
  });
  
  const intent = completion.choices[0]?.message?.content?.trim().toUpperCase();
  
  if (intent.includes("REJECTED")) {
    console.log(`Intent classified as REJECTED. Archiving company...`);
    await supabase.from('companies').update({ status: 'REJECTED' }).eq('id', company_id);
    
    const { data: audit } = await supabase.from('audits').select('id').eq('company_id', company_id).single();
    if (audit) {
      await supabase.from('audit_results').insert({
        audit_id: audit.id,
        category: 'REJECTED',
        raw_data: {},
        issues_found: { rejection_reason: "Rejected by client" }
      });
    }
    return; // Stop processing, no draft needed
  }

  // 2. Draft Reply via Gemini
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
      r.hasFacebookPixel = html.includes('fbevents.js') || html.includes('fbq(');
      r.hasViewport = !!document.querySelector('meta[name="viewport"]');
      r.hasFavicon = !!(document.querySelector('link[rel="icon"]') || document.querySelector('link[rel="shortcut icon"]'));
      r.hasSocialLinks = html.includes('facebook.com') || html.includes('instagram.com') || html.includes('linkedin.com');
      r.hasForms = !!document.querySelector('form');
      const body = document.body.innerText || '';
      r.wordCount = body.split(/\s+/).filter(Boolean).length;
      r.hasPhoneNumber = /(\+?\d[\d\s\-().]{7,}\d)/.test(body);
      
      // Deep Extraction: Tech Stack
      r.isWordPress = !!document.querySelector('meta[name="generator"][content*="WordPress"]') || html.includes('/wp-content/');
      r.isShopify = !!window.Shopify || !!document.querySelector('script[src*="cdn.shopify.com"]');
      r.isWebflow = !!document.querySelector('html[data-wf-site]');
      r.isReact = !!document.querySelector('[data-reactroot]') || !!window.__REACT_DEVTOOLS_GLOBAL_HOOK__ || html.includes('react-dom');
      r.isNextJs = !!document.querySelector('#__next') || !!window.__NEXT_DATA__;
      r.isJQuery = !!window.jQuery || html.includes('jquery.min.js');
      
      // Deep Extraction: Content & Niche
      r.headings = Array.from(document.querySelectorAll('h2')).map(h => h.innerText.trim()).filter(t => t.length > 5).slice(0, 5);
      r.paragraphs = Array.from(document.querySelectorAll('p')).map(p => p.innerText.trim()).filter(t => t.length > 50).slice(0, 3);
      r.hasPricingSignals = html.includes('Pricing') || html.includes('Plans') || html.includes('$');
      
      // Deep Extraction: Security & Trust
      r.hasPrivacyPolicy = Array.from(document.querySelectorAll('a')).some(a => a.innerText.toLowerCase().includes('privacy'));
      r.hasUnsecureForms = Array.from(document.querySelectorAll('form')).some(f => {
        const action = f.getAttribute('action');
        return !action || action.startsWith('http://');
      });
      
      // Deep Extraction: Red Flags & Sales Triggers
      r.hasBrokenLinks = Array.from(document.querySelectorAll('a')).some(a => {
        const h = a.getAttribute('href');
        return h === '#' || h === '' || h?.includes('javascript:void(0)');
      });
      const copyMatch = html.match(/(?:©|Copyright)\s*(20[0-2][0-9])/i);
      r.hasOutdatedCopyright = copyMatch ? parseInt(copyMatch[1]) < new Date().getFullYear() : false;
      r.hasPlaceholderText = html.toLowerCase().includes('lorem ipsum') || html.toLowerCase().includes('powered by shopify') || html.toLowerCase().includes('powered by wordpress');
      r.isHiring = html.toLowerCase().includes('we are hiring') || html.toLowerCase().includes('careers') || html.toLowerCase().includes('open positions');
      r.isHttpOnly = window.location.protocol === 'http:';
      r.missingAdaLabels = Array.from(document.querySelectorAll('input, button, textarea, select')).some(el => !el.hasAttribute('aria-label') && !el.id);
      
      return r;
    });

    const rawText = await page.evaluate(() => document.body?.innerText || '');

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
    if (!checks.hasFacebookPixel)   issues.push({ category: 'Marketing', severity: 'high', issue: 'No Facebook Pixel found (cannot run retargeting ads)' });
    if (!checks.hasPrivacyPolicy)   issues.push({ category: 'Security', severity: 'high', issue: 'Missing Privacy Policy link' });
    if (checks.hasUnsecureForms)    issues.push({ category: 'Security', severity: 'high', issue: 'Unsecured form submission detected' });
    if (!checks.hasFavicon)         issues.push({ category: 'Branding', severity: 'low', issue: 'No favicon' });
    if (!checks.hasSocialLinks)     issues.push({ category: 'Social', severity: 'low', issue: 'No social media links' });
    if (!checks.hasForms)           issues.push({ category: 'Conversion', severity: 'medium', issue: 'No lead capture form' });
    if (!checks.hasPhoneNumber)     issues.push({ category: 'Contact', severity: 'low', issue: 'No phone number on page' });
    if (checks.hasBrokenLinks)      issues.push({ category: 'UX', severity: 'high', issue: 'Broken links detected (e.g. href="#") — losing customers' });
    if (checks.hasOutdatedCopyright) issues.push({ category: 'Trust', severity: 'medium', issue: 'Outdated copyright year — site looks abandoned' });
    if (checks.hasPlaceholderText)  issues.push({ category: 'Brand', severity: 'high', issue: 'Placeholder or template text found ("Lorem Ipsum" / "Powered by...")' });
    if (checks.isHiring)            issues.push({ category: 'Sales Signal', severity: 'low', issue: 'Company is hiring (Has budget for web dev/marketing)' });
    if (checks.isHttpOnly)          issues.push({ category: 'Security', severity: 'high', issue: 'Missing SSL (HTTP) — Google flags as Not Secure' });
    if (checks.missingAdaLabels)    issues.push({ category: 'Legal', severity: 'high', issue: 'Missing ADA compliance tags (ARIA labels) — High risk of lawsuit' });
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
      const key = c.email || c.linkedin || c.phone;
      if (!key || seen.has(key)) return false;
      seen.add(key); return true;
    });

    await browser.close();
    let techStack = 'Unknown/Custom';
    if (checks.isNextJs) techStack = 'Next.js (React)';
    else if (checks.isReact) techStack = 'React';
    else if (checks.isShopify) techStack = 'Shopify';
    else if (checks.isWebflow) techStack = 'Webflow';
    else if (checks.isWordPress) techStack = 'WordPress';
    else if (checks.isJQuery) techStack = 'Legacy jQuery';
    
    let semanticData = null;
    try {
        semanticData = await extractSemanticBusinessData(rawText);
    } catch (e) {
        console.error('Semantic extraction failed:', e.message);
    }
    
    const businessContext = {
        headings: checks.headings || [],
        paragraphs: checks.paragraphs || [],
        hasPricing: checks.hasPricingSignals || false,
        semantic: semanticData
    };

    return { auditData: { url, title, score, loadTimeMs, ssl: url.includes('https'), issues, techStack, businessContext, summary: { totalIssues: issues.length, ...checks } }, contacts };

  } catch (e) {
    console.error('Audit error:', e.message);
    await browser.close();
    return { auditData: { url, title, score: 10, loadTimeMs: 0, ssl: false, issues: [{ category: 'General', severity: 'high', issue: 'Site unreachable or timed out' }], summary: {} }, contacts: [] };
  }
}

// ─── Contact Extractor (Deep) ─────────────────────────────────────────────────

async function extractContacts(page) {
  return page.evaluate(() => {
    const emails = new Set();
    const linkedins = new Set();
    const phones = new Set();

    // 1. Scan full HTML source (catches obfuscated/hidden emails)
    const html = document.documentElement.innerHTML;
    const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
    const htmlEmails = html.match(emailRegex) || [];
    htmlEmails.forEach(e => {
      const clean = e.toLowerCase().trim();
      if (
        !clean.includes('example') && !clean.includes('test@') &&
        !clean.endsWith('.png') && !clean.endsWith('.jpg') &&
        !clean.endsWith('.gif') && !clean.endsWith('.svg') &&
        !clean.includes('sentry') && !clean.includes('schema') &&
        !clean.includes('@2x') && !clean.includes('noreply') &&
        !clean.includes('no-reply') && !clean.includes('donotreply') &&
        !clean.includes('wordpress') && !clean.includes('woocommerce')
      ) emails.add(clean);
    });

    // 2. Scan visible body text
    const body = document.body?.innerText || '';
    (body.match(emailRegex) || []).forEach(e => emails.add(e.toLowerCase()));

    // 3. All mailto: links
    document.querySelectorAll('a[href^="mailto:"]').forEach(a => {
      const e = a.href.replace('mailto:', '').split('?')[0].trim().toLowerCase();
      if (e) emails.add(e);
    });

    // 4. tel: and wa.me links for phone
    document.querySelectorAll('a[href^="tel:"], a[href*="wa.me"], a[href*="api.whatsapp.com"]').forEach(a => {
      let p = '';
      if (a.href.includes('tel:')) {
        p = a.href.replace('tel:', '').trim();
      } else if (a.href.includes('wa.me/')) {
        p = a.href.split('wa.me/')[1].split('?')[0].replace(/[^0-9+]/g, '');
      } else if (a.href.includes('api.whatsapp.com/send')) {
        try {
          const url = new URL(a.href);
          p = url.searchParams.get('phone') || '';
        } catch(e) {}
      }
      if (p) phones.add(p);
    });

    // 5. LinkedIn profiles
    document.querySelectorAll('a[href*="linkedin.com/in/"], a[href*="linkedin.com/company/"]').forEach(a => {
      linkedins.add(a.href);
    });

    // 6. Instagram profiles
    const instagrams = new Set();
    document.querySelectorAll('a[href*="instagram.com/"]').forEach(a => {
      const href = a.href;
      // skip instagram.com root, login, explore etc
      if (!href.match(/instagram\.com\/(p\/|reel\/|explore|accounts|login|$)/)) {
        instagrams.add(href.split('?')[0].replace(/\/$/, ''));
      }
    });

    const contacts = [];
    const emailArr = [...emails].slice(0, 5);
    const linkedinArr = [...linkedins].slice(0, 3);
    const instagramArr = [...instagrams].slice(0, 3);
    const phoneArr = [...phones].slice(0, 3);

    emailArr.forEach((email, i) => contacts.push({ email, linkedin: linkedinArr[i] || null, instagram: instagramArr[i] || null, phone: phoneArr[i] || null }));
    linkedinArr.slice(emailArr.length).forEach((linkedin, i) => contacts.push({ email: null, linkedin, instagram: instagramArr[emailArr.length + i] || null, phone: phoneArr[emailArr.length + i] || null }));

    // Add remaining phones if they weren't attached to an email/linkedin
    phoneArr.slice(contacts.length).forEach(phone => contacts.push({ email: null, linkedin: null, instagram: null, phone }));

    return contacts.slice(0, 5);
  });
}

// ─── Semantic Extractor (OpenRouter Llama 3) ───────────────────────────────────

async function extractSemanticBusinessData(rawText) {
  const cleanText = rawText.replace(/\s+/g, ' ').trim().slice(0, 10000); 
  const prompt = `
  You are an expert business analyst. Read the following website text and extract exactly what this business does.
  
  WEBSITE TEXT:
  """
  ${cleanText}
  """
  
  Return a JSON object with exactly these keys:
  - "companyName": string
  - "industry": string
  - "primaryService": string (What they actually sell/do)
  - "targetAudience": string (Who buys from them)
  - "uniqueSellingProposition": string (What makes them special)
  `;

  // We are using a 100% free model from OpenRouter
  // Since model slugs change occasionally for free models, we fetch the first available free one.
  const modRes = await fetch('https://openrouter.ai/api/v1/models');
  const modJson = await modRes.json();
  const freeModels = modJson.data.filter(m => m.pricing.prompt === '0' || m.pricing.prompt === 0).map(m => m.id);
  const modelToUse = freeModels.includes('meta-llama/llama-3-8b-instruct:free') ? 'meta-llama/llama-3-8b-instruct:free' : freeModels[0];

  console.log(`Extracting semantics using ${modelToUse}...`);

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: modelToUse,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }]
    })
  });
  
  const json = await response.json();
  if (json.choices && json.choices.length > 0) {
      return JSON.parse(json.choices[0].message.content);
  }
  throw new Error("Failed to extract semantic data");
}

// ─── Cohere Analysis ────────────────────────────────────────────────────────

async function analyzeWithCohere(auditData) {
  console.log('Analyzing with Cohere (Command R+)...');
  const issuesSummary = auditData.issues?.map(i => `[${i.severity.toUpperCase()}] ${i.category}: ${i.issue}`).join('\n') || 'None';

  const prompt = `
  You are a sharp web agency consultant who closes clients by being specific.
  
  Website: ${auditData.url}
  Title: "${auditData.title}"
  Tech Stack: ${auditData.techStack}
  Company Name: ${auditData.businessContext.semantic?.companyName || 'Unknown'}
  Industry: ${auditData.businessContext.semantic?.industry || 'Unknown'}
  Primary Service: ${auditData.businessContext.semantic?.primaryService || 'Unknown'}
  Target Audience: ${auditData.businessContext.semantic?.targetAudience || 'Unknown'}
  Unique Value: ${auditData.businessContext.semantic?.uniqueSellingProposition || 'Unknown'}
  Core Content (Fallback): ${auditData.businessContext.headings.join(' | ')}
  Score: ${auditData.score}/100
  Load Time: ${(auditData.loadTimeMs / 1000).toFixed(1)}s
  SSL: ${auditData.ssl ? 'Yes' : 'NO'}
  
  Issues (${auditData.issues?.length || 0}):
  ${issuesSummary}
  
  Return a JSON object with:
  1. "companyName": name from URL/title
  2. "industry": specific industry (e.g. "Plumbing Services" not "Services")
  3. "leadScore": 1-100, lower = worse site = hotter lead
  4. "pitch": cold email max 180 words. You represent Webcord, a web performance and digital growth agency. Reference their specific industry/niche and 1-2 specific technical issues. Sign off as "Webcord Team". Sound professional, direct, and confident. IMPORTANT: Do not use exact metrics or robotic numbers like "your load time is 5.5s" or "you have 38 scripts". Use natural human language like "your site is noticeably slow" or "we noticed your images aren't optimized".
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

// ─── Groq Internal Intelligence ──────────────────────────────────────────────

async function analyzeWithGroq(auditData) {
  console.log('Generating internal suggestions with Groq (Llama-3)...');
  const prompt = `
  You are the lead technical strategist at Webcord.
  We just audited a potential client's website: ${auditData.url}
  Tech Stack Detected: ${auditData.techStack}
  What they sell: ${auditData.businessContext.semantic?.primaryService || 'Unknown'}
  Their Value Prop: ${auditData.businessContext.semantic?.uniqueSellingProposition || 'Unknown'}
  Score: ${auditData.score}/100.
  Issues found: ${auditData.issues?.map(i => i.issue).join(', ')}
  
  Write a ruthless, internal-only cheat sheet for ME (the salesperson). 
  I need a bulleted list of exact, concrete technical upgrades we can sell them based on their issues and tech stack.
  
  Format strictly as bullet points following this exact structure:
  • Implement [Solution] to [Benefit]
  • Replace [Old Tech/Problem] with [New Tech/Solution] for [Benefit]
  • Fix [Specific Security/Missing Page Issue] to [Benefit]
  
  Rules:
  - DO NOT talk to the client. Talk to ME.
  - Be blunt, highly technical, and specific based on their actual issues and platform (e.g. if they use WordPress, suggest headless; if they use jQuery, suggest React).
  - No fluff, no paragraphs, just 3-5 punchy bullet points.
  `;
  
  try {
    const completion = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "llama-3.1-8b-instant",
      temperature: 0.3,
    });
    return completion.choices[0]?.message?.content?.trim() || "No suggestions generated.";
  } catch (e) {
    console.error("Groq Error:", e.message);
    return "Error generating suggestions.";
  }
}
