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
      total_score: auditData.score
    }).select().single();

    // 6. Save AI pitch + raw issues
    await supabase.from('audit_results').insert({
      audit_id: audit.id,
      category: 'AI_PITCH',
      raw_data: auditData,
      issues_found: { pitch: aiAnalysis.pitch, issues: auditData.issues }
    });

    await supabase.from('jobs').update({ status: 'COMPLETED', updated_at: new Date().toISOString() }).eq('id', job.id);
    console.log(`✓ Job ${job.id} completed for ${company.name} | Score: ${auditData.score} | Issues: ${auditData.issues?.length} | Contacts: ${contacts.length}`);
  } catch (error) {
    console.error('Job failed:', error.message);
    await supabase.from('jobs').update({ status: 'FAILED', updated_at: new Date().toISOString() }).eq('id', job.id);
  }
}

async function runAudit(url) {
  console.log(`Deep auditing ${url}...`);
  if (!url.startsWith('http')) url = 'https://' + url;

  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const issues = [];
  let contacts = [];
  let title = '';
  let loadTimeMs = 0;

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');

    // Measure load time
    const t0 = Date.now();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    loadTimeMs = Date.now() - t0;

    title = await page.title();

    // Run all checks inside browser context
    const checks = await page.evaluate(() => {
      const results = {};

      // --- SEO ---
      results.hasH1 = !!document.querySelector('h1');
      results.h1Count = document.querySelectorAll('h1').length;
      results.hasMetaDesc = !!document.querySelector('meta[name="description"]');
      results.metaDescLength = document.querySelector('meta[name="description"]')?.content?.length || 0;
      results.hasTitle = !!document.title;
      results.titleLength = document.title?.length || 0;
      results.hasCanonical = !!document.querySelector('link[rel="canonical"]');
      results.hasOpenGraph = !!document.querySelector('meta[property^="og:"]');
      results.hasTwitterCard = !!document.querySelector('meta[name^="twitter:"]');
      results.hasStructuredData = !!document.querySelector('script[type="application/ld+json"]');
      results.hasH2 = !!document.querySelector('h2');
      results.hasH3 = !!document.querySelector('h3');

      // --- Images ---
      const imgs = [...document.querySelectorAll('img')];
      results.totalImages = imgs.length;
      results.imagesWithoutAlt = imgs.filter(img => !img.alt || img.alt.trim() === '').length;

      // --- Performance indicators ---
      results.hasLazyLoading = imgs.some(img => img.loading === 'lazy');
      results.scriptCount = document.querySelectorAll('script[src]').length;
      results.cssCount = document.querySelectorAll('link[rel="stylesheet"]').length;

      // --- Analytics & Tracking ---
      const pageText = document.documentElement.innerHTML;
      results.hasGoogleAnalytics = pageText.includes('google-analytics.com') || pageText.includes('gtag(') || pageText.includes('UA-') || pageText.includes('G-');
      results.hasGTM = pageText.includes('googletagmanager.com');
      results.hasPixel = pageText.includes('connect.facebook.net') || pageText.includes('fbq(');

      // --- UX & Accessibility ---
      results.hasViewport = !!document.querySelector('meta[name="viewport"]');
      results.hasFavicon = !!(document.querySelector('link[rel="icon"]') || document.querySelector('link[rel="shortcut icon"]'));
      results.hasCookieBanner = pageText.toLowerCase().includes('cookie') && (
        !!document.querySelector('[class*="cookie"]') || !!document.querySelector('[id*="cookie"]')
      );
      results.hasLiveChat = pageText.includes('tawk.to') || pageText.includes('intercom') || pageText.includes('crisp.chat') || pageText.includes('freshchat');

      // --- Links ---
      const allLinks = [...document.querySelectorAll('a[href]')];
      results.totalLinks = allLinks.length;
      results.externalLinks = allLinks.filter(a => a.href && !a.href.startsWith(window.location.origin) && a.href.startsWith('http')).length;

      // --- Social ---
      results.hasSocialLinks = pageText.includes('facebook.com') || pageText.includes('instagram.com') || pageText.includes('twitter.com') || pageText.includes('linkedin.com');

      // --- Forms ---
      results.hasForms = !!document.querySelector('form');
      results.hasContactForm = !!(document.querySelector('form') && (pageText.toLowerCase().includes('contact') || pageText.toLowerCase().includes('message')));

      // --- Copy Quality ---
      const bodyText = document.body.innerText || '';
      results.wordCount = bodyText.split(/\s+/).filter(Boolean).length;
      results.hasPhoneNumber = /(\+?\d[\d\s\-().]{7,}\d)/.test(bodyText);

      return results;
    });

    // --- Score each issue ---
    if (!checks.hasH1)             issues.push({ category: 'SEO', severity: 'high', issue: 'Missing H1 tag' });
    if (checks.h1Count > 1)        issues.push({ category: 'SEO', severity: 'medium', issue: `Multiple H1 tags (${checks.h1Count})` });
    if (!checks.hasMetaDesc)       issues.push({ category: 'SEO', severity: 'high', issue: 'Missing meta description' });
    if (checks.metaDescLength > 160) issues.push({ category: 'SEO', severity: 'low', issue: `Meta description too long (${checks.metaDescLength} chars)` });
    if (!checks.hasCanonical)      issues.push({ category: 'SEO', severity: 'medium', issue: 'Missing canonical tag' });
    if (!checks.hasOpenGraph)      issues.push({ category: 'SEO', severity: 'medium', issue: 'No Open Graph tags (bad social sharing)' });
    if (!checks.hasTwitterCard)    issues.push({ category: 'SEO', severity: 'low', issue: 'No Twitter Card meta tags' });
    if (!checks.hasStructuredData) issues.push({ category: 'SEO', severity: 'medium', issue: 'No structured data / Schema.org markup' });
    if (checks.titleLength > 60)   issues.push({ category: 'SEO', severity: 'low', issue: `Page title too long (${checks.titleLength} chars)` });
    if (!checks.hasTitle)          issues.push({ category: 'SEO', severity: 'high', issue: 'Missing page title' });

    if (checks.imagesWithoutAlt > 0) issues.push({ category: 'Accessibility', severity: 'medium', issue: `${checks.imagesWithoutAlt} image(s) missing alt text` });
    if (!checks.hasViewport)       issues.push({ category: 'Mobile', severity: 'high', issue: 'Missing viewport meta tag (not mobile-friendly)' });

    if (loadTimeMs > 5000)         issues.push({ category: 'Performance', severity: 'high', issue: `Slow load time: ${(loadTimeMs/1000).toFixed(1)}s` });
    else if (loadTimeMs > 3000)    issues.push({ category: 'Performance', severity: 'medium', issue: `Load time could be faster: ${(loadTimeMs/1000).toFixed(1)}s` });
    if (!checks.hasLazyLoading && checks.totalImages > 3) issues.push({ category: 'Performance', severity: 'low', issue: 'Images not lazy loaded' });
    if (checks.scriptCount > 10)   issues.push({ category: 'Performance', severity: 'medium', issue: `Many external scripts (${checks.scriptCount}) — may slow page` });

    if (!checks.hasGoogleAnalytics && !checks.hasGTM) issues.push({ category: 'Analytics', severity: 'high', issue: 'No analytics tracking detected' });
    if (!checks.hasFavicon)        issues.push({ category: 'Branding', severity: 'low', issue: 'No favicon' });
    if (!checks.hasSocialLinks)    issues.push({ category: 'Social', severity: 'low', issue: 'No social media links found' });
    if (!checks.hasForms)          issues.push({ category: 'Conversion', severity: 'medium', issue: 'No forms found — no lead capture' });
    if (!checks.hasPhoneNumber)    issues.push({ category: 'Contact', severity: 'low', issue: 'No phone number visible on page' });
    if (!url.includes('https'))    issues.push({ category: 'Security', severity: 'high', issue: 'No HTTPS / SSL certificate' });
    if (checks.wordCount < 300)    issues.push({ category: 'Content', severity: 'medium', issue: `Thin content — only ${checks.wordCount} words on page` });

    // Penalty scoring
    const penalties = { high: 15, medium: 7, low: 3 };
    let score = 100;
    for (const i of issues) score -= (penalties[i.severity] || 0);
    score = Math.max(score, 0);

    console.log(`Audit done: ${issues.length} issues found, score: ${score}`);

    // Extract contacts
    const mainContacts = await extractContacts(page);
    contacts.push(...mainContacts);

    const contactLinks = await page.$$eval('a', links =>
      links
        .map(a => ({ href: a.href, text: a.textContent?.toLowerCase().trim() }))
        .filter(a => a.href && (a.text?.includes('contact') || a.text?.includes('about') || a.text?.includes('team')))
        .slice(0, 2).map(a => a.href)
    );

    for (const contactUrl of contactLinks) {
      try {
        const cp = await browser.newPage();
        await cp.goto(contactUrl, { waitUntil: 'networkidle2', timeout: 15000 });
        contacts.push(...await extractContacts(cp));
        await cp.close();
      } catch (e) { /* skip */ }
    }

    await page.close();

    // Deduplicate contacts
    const seen = new Set();
    contacts = contacts.filter(c => {
      const key = c.email || c.linkedin;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    console.log(`Found ${contacts.length} contact(s)`);

    return {
      auditData: {
        url, title, score, loadTimeMs,
        ssl: url.includes('https'),
        issues,
        summary: {
          totalIssues: issues.length,
          highPriority: issues.filter(i => i.severity === 'high').length,
          mediumPriority: issues.filter(i => i.severity === 'medium').length,
          lowPriority: issues.filter(i => i.severity === 'low').length,
          ...checks,
        }
      },
      contacts,
    };

  } catch (e) {
    console.error('Audit failed:', e.message);
    await browser.close();
    return {
      auditData: { url, title, score: 10, loadTimeMs: 0, ssl: false, issues: [{ category: 'General', severity: 'high', issue: 'Site unreachable or timed out' }], summary: {} },
      contacts: [],
    };
  }
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
  const issuesSummary = auditData.issues?.map(i => `[${i.severity.toUpperCase()}] ${i.category}: ${i.issue}`).join('\n') || 'No issues found';
  const prompt = `
  You are a sharp, senior web agency consultant who closes clients by being brutally specific.
  
  Website: ${auditData.url}
  Page Title: "${auditData.title}"
  Score: ${auditData.score}/100
  Load Time: ${(auditData.loadTimeMs/1000).toFixed(1)}s
  SSL: ${auditData.ssl ? 'Yes' : 'NO — CRITICAL'}
  
  Issues found (${auditData.issues?.length || 0} total):
  ${issuesSummary}
  
  Return a JSON object with:
  1. "companyName": Inferred company name from URL/title.
  2. "industry": Inferred industry (be specific, e.g. "Plumbing Services" not just "Services").
  3. "leadScore": 1-100. Use their site score as a baseline. Lower score = worse site = hotter lead for us.
  4. "pitch": Write a cold outreach email (max 180 words). Rules:
     - Reference 2-3 SPECIFIC issues by name (e.g. "your site has no meta description", "images are missing alt text")
     - Sound like a human, not a robot
     - One clear call to action at the end
     - Do NOT use phrases like "I noticed your website" or "I hope this email finds you well"
     - Sign off as "Kenz"
  
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
