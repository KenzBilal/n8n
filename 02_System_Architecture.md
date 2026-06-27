# 02 System Architecture

## 1. High-Level Architecture
The system follows a modern, scalable microservices-inspired modular monolith approach.

- **Frontend**: Next.js (React), TailwindCSS, TypeScript. Deployed on Vercel or custom Node server.
- **Backend**: Node.js / NestJS for robust API structure and dependency injection.
- **Database**: PostgreSQL (Relational data), Redis (Caching & Job Queues).
- **Worker Nodes**: Dedicated Node.js processes for heavy background jobs (crawling, auditing).

## 2. Component Interaction
1. **Client** requests a lead scan via **API Gateway**.
2. **API** creates a job in **PostgreSQL** and enqueues a message in **Redis**.
3. **Worker Pool** picks up the job, orchestrates headless browsers (Puppeteer/Playwright) to scrape and audit.
4. **Worker** sends data to **AI Service** (OpenAI/Anthropic) for UX analysis and email generation.
5. **Worker** saves results to **PostgreSQL**.
6. **WebSockets** push real-time updates to the **Client**.

## 3. Deployment Topology (100% Free Stack)
- **Frontend Dashboard**: Deployed on Vercel (default `.vercel.app`).
- **Database**: Supabase (PostgreSQL) or Convex. Both have excellent generous free tiers.
- **Scraper / Worker Engine**:
  - *Option A*: GitHub Actions (run scraping jobs on a cron for free).
  - *Option B*: Local machine (run a local Node.js script when you want to find clients).
  - *Option C*: Koyeb / Render free tier (has limits, might sleep).
- **Storage**: Supabase Storage (Free tier) for audit screenshots.

## 4. Security & Compliance
- **Auth**: None. No login required.
- **Data Privacy**: Internal tool only.
- **Rate Limiting**: None needed.
