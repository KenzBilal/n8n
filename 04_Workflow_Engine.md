# 04 Workflow Engine Specification

## 1. Overview
The platform includes a directed acyclic graph (DAG) workflow engine to allow users to build custom automation sequences.

## 2. Core Concepts
- **Trigger**: The starting node (e.g., "Schedule: Every Monday at 9AM", "Webhook Received").
- **Action Node**: Performs a specific task (e.g., "Scrape Website", "Analyze with AI", "Send Email").
- **Connection**: Data flows from one node's output to the next node's input via JSON mapping.

## 3. Node Execution Lifecycle
1. **Init**: Node receives input payload.
2. **Validate**: Checks if required fields (e.g., API keys, URLs) exist.
3. **Execute**: Runs the core logic (e.g., HTTP request).
4. **Error Handling**: If fail, check retry policy. If max retries hit, route to "On Error" path.
5. **Output**: Passes transformed JSON to connected nodes.

## 4. Standard Library (Built-in Nodes)
- **Google Maps Extractor**: Fetches local businesses.
- **Lighthouse Auditor**: Runs headless Chrome performance checks.
- **OpenAI Completer**: Passes prompt + context for text generation.
- **Email Sender**: SMTP / SendGrid integration.
- **CRM Updater**: Mutates the internal `companies` table.

## 5. Queueing, State & Graceful Shutdown
- **Job Triggering**: Vercel Dashboard inserts a job into Supabase (`status = 'RUNNING'`).
- **Worker Execution**: A Docker container (running locally for free) listens to Supabase via Realtime. When a job appears, it starts scraping.
- **Graceful Stop**: When you click "Stop" on the dashboard, it updates the job in Supabase to `status = 'STOPPING'`.
- **Worker Reaction**: The Docker worker sees `STOPPING`. It instantly stops fetching *new* leads, but finishes auditing the ones currently in memory. Once finished, it sets `status = 'COMPLETED'`.
- **Real-Time AI Processing**: AI does NOT wait for the job to finish. As soon as a single lead's audit is done, it is immediately passed to the AI. Results stream into the dashboard one-by-one in real-time.
