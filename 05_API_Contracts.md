# 05 API Contracts

## 1. General Principles
- Base URL: `https://api.n8n-agency.com/v1`
- Content-Type: `application/json`
- Authentication: Bearer Token (JWT) in Authorization header.
- Pagination: Cursor-based for large lists (`?cursor=xyz&limit=50`).

## 2. Endpoints

### 2.1 Companies (CRM)
**`GET /companies`**
- Query Params: `status`, `industry`, `min_score`
- Returns: Array of company objects.

**`POST /companies`**
- Body: `{ "name": "...", "website_url": "..." }`
- Returns: `201 Created` with company ID.

### 2.2 Audits
**`POST /audits/run`**
- Body: `{ "company_id": "uuid", "modules": ["seo", "performance", "ai"] }`
- Returns: `202 Accepted` with `job_id` for tracking.

**`GET /audits/{id}`**
- Returns: `200 OK` with full JSONB payload of audit results and identified issues.

### 2.3 Webhooks & Integrations
**`POST /webhooks/incoming/{id}`**
- Trigger a specific workflow by ID. Payload is passed dynamically to the Workflow Engine.

**`POST /outreach/generate`**
- Body: `{ "company_id": "uuid", "tone": "professional" }`
- Returns: `200 OK` with AI-generated email subject and body based on the latest audit data.
