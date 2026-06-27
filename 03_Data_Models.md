# 03 Data Models & Schema

## 1. Core Tables

### `organizations` (Tenants)
- `id` (UUID, PK)
- `name` (String)
- `subscription_tier` (Enum: FREE, PRO, ENTERPRISE)
- `created_at`, `updated_at` (Timestamps)

### `users`
- `id` (UUID, PK)
- `organization_id` (UUID, FK -> organizations)
- `email` (String, Unique)
- `password_hash` (String)
- `role` (Enum: ADMIN, USER)

## 2. CRM & Leads

### `companies` (The Leads)
- `id` (UUID, PK)
- `organization_id` (UUID, FK -> organizations)
- `name` (String)
- `website_url` (String)
- `industry` (String)
- `lead_score` (Integer, default 0)
- `status` (Enum: NEW, CONTACTED, NEGOTIATING, CLOSED_WON, CLOSED_LOST)

### `contacts`
- `id` (UUID, PK)
- `company_id` (UUID, FK -> companies)
- `first_name`, `last_name`, `email`, `linkedin_url` (Strings)
- `is_primary` (Boolean)

## 3. Audits & Results

### `audits`
- `id` (UUID, PK)
- `company_id` (UUID, FK -> companies)
- `status` (Enum: PENDING, RUNNING, COMPLETED, FAILED)
- `total_score` (Integer)

### `audit_results`
- `id` (UUID, PK)
- `audit_id` (UUID, FK -> audits)
- `category` (Enum: SEO, PERFORMANCE, SECURITY, AI_UX)
- `raw_data` (JSONB)
- `issues_found` (JSONB)

## 4. Outreach & Campaigns

### `outreach_messages`
- `id` (UUID, PK)
- `company_id` (UUID, FK -> companies)
- `generated_subject` (String)
- `generated_body` (Text)
- `status` (Enum: DRAFT, SENT, OPENED, REPLIED)
