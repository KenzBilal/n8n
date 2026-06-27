# 01 Product Requirements Document (PRD)

## 1. Vision & Overview
n8n (Agency OS) is a comprehensive, AI-powered platform for B2B lead generation, automated auditing, CRM, and personalized outreach. It discovers potential clients, audits their digital footprint, scores them, and generates hyper-personalized sales collateral.

## 2. Target Audience & Personas
- **Agency Owners**: Need to automate client acquisition and reduce time spent on manual audits.
- **SDRs (Sales Development Reps)**: Require enriched contact data and AI-written outreach drafts.
- **Freelancers/Consultants**: Need a "business in a box" to identify prospects lacking basic web presence or SEO.

## 3. Core Features
### 3.1 Lead Discovery Engine
- **Input**: Industry, location, keyword (e.g., "Plumbers in Chicago").
- **Processing**: Integrates with Google Maps API, LinkedIn, and Web scraping to build a list of local businesses.
- **Output**: Structured list of companies with website URLs, phone numbers, and potential contacts.

### 3.2 Advanced Automated Auditing Suite
Exhaustive, deep-scan rule-based engine capturing everything about the target:
- **Performance & Core Web Vitals**: Lighthouse/PageSpeed, DOM size, script execution time, TTFB, image optimization levels.
- **Technical SEO**: Meta tags, canonicals, robots.txt, sitemaps, schema.org markup, 404 broken links, URL structure, heading hierarchy.
- **Security & Tech Stack**: SSL validity, security headers (HSTS, CSP), exposed directories, known CVEs, tech stack sniffing (Wappalyzer equivalent).
- **UX & Accessibility**: Mobile responsiveness, tap target sizing, WCAG contrast ratios, missing ALT text, form accessibility.
- **Business Presence**: Social media link validation, Google My Business (GMB) detection, local schema, contact info verification.
- **AI Data Structuring**: Uses LLMs to ingest all this raw, advanced scraped data and organize it into clean, structured results.

### 3.3 Dynamic Lead Scoring
- **Logic**: Assigns scores based on audit failures (e.g., Missing SSL = +20 points, High bounce rate indicators = +15 points). Higher scores = higher need for agency services.

### 3.4 Proposal & Outreach Generator (AI Expert Consultant)
- **AI Integration**: LLM acts as an expert consultant. It analyzes raw audit failures (e.g., slow load time, missing SSL, bad SEO) and translates them into business impact (lost sales, zero trust).
- **Pitch Generation**: AI writes exact suggestions on how to make the website perfect, crafting the perfect pitch to sell your agency's services.
- **Outputs**: Highly personalized cold emails, PDF proposals, and HTML email drafts.

### 3.5 Built-in CRM
- Kanban boards for pipeline management.
- Activity logging, status tracking, and automated follow-up sequences.
