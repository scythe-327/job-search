# Career-Ops Deployed API

Base URL: `https://scythe327-career-ops.hf.space`

> **Deployment**: Hugging Face Spaces (Docker) — 2 vCPU, 16 GB RAM, persistent storage at `/data`

---

## Health Check

**GET** `/health`

Check if the server is alive.

```powershell
curl.exe https://scythe327-career-ops.hf.space/health
```

Response:
```json
{ "status": "ok", "uptime": 137.4 }
```

---

## Scanners — Find Jobs

### Scan all portals

**POST** `/run/scan`

Scans job boards and company career pages (Ashby, Greenhouse, Lever, Wellfound, etc.) for matching roles.

```powershell
curl.exe -X POST https://scythe327-career-ops.hf.space/run/scan
```

Options (JSON body):
- `company` — scan only a specific company
- `dryRun` — `true` to preview without saving

---

### Unified Job Scraper

**POST** `/run/scrape`

Run one or more scrapers with a single request. Supports:

| source | What it does |
|--------|-------------|
| `yc` | Searches YC Work at a Startup via Algolia (requires `YC_ALGOLIA_KEY` secret) |
| `yc-eng` | Deep engineering-focused YC Algolia scrape |
| `yc-public` | Public YC Companies API (no key needed) |
| `portals` | Same as `/run/scan` |
| `all` | Runs all four in parallel |

```powershell
$body = '{"source":"yc-public"}'
curl.exe -X POST https://scythe327-career-ops.hf.space/run/scrape ^
  -H "Content-Type: application/json" -d $body
```

```powershell
$body = '{"source":"yc","role":"eng","location":"Remote","hits":10}'
curl.exe -X POST https://scythe327-career-ops.hf.space/run/scrape ^
  -H "Content-Type: application/json" -d $body
```

---

## Outreach — Send Emails

### Smart Outreach (Auto)

**POST** `/run/outreach-for`

Give it a company name and role. The server will:
1. Search YC Algolia for the job description
2. Read your CV (`cv.md`)
3. Craft a personalized email based on your actual experience
4. Guess the company email (`hello@`, `founders@`, `apply@`, `team@`)
5. Send the email

```powershell
$body = '{"company":"Zymbly","role":"Forward Deployed Engineer"}'
curl.exe -X POST https://scythe327-career-ops.hf.space/run/outreach-for ^
  -H "Content-Type: application/json" -d $body
```

Response:
```json
{
  "success": true,
  "company": "Zymbly",
  "role": "Forward Deployed Engineer",
  "candidate_name": "Rohan P H",
  "emails_tried": [
    { "to": "hello@zymbly.com", "success": true }
  ]
}
```

### Send Outreach from TSV

**POST** `/run/send-outreach`

Sends all "draft" rows from `data/outreach.tsv` through the full pipeline (verification → throttle → send). Max 20 emails per run.

```powershell
curl.exe -X POST https://scythe327-career-ops.hf.space/run/send-outreach
```

### Send Test Email

**POST** `/run/test-email`

Send a one-off email to any address.

```powershell
$body = '{"to":"someone@gmail.com","subject":"Hello","message":"This is a test"}'
curl.exe -X POST https://scythe327-career-ops.hf.space/run/test-email ^
  -H "Content-Type: application/json" -d $body
```

---

## System — Diagnostics

### Doctor

**POST** `/run/doctor`

Runs a health check on the system — validates config files, dependencies, and connectivity.

```powershell
curl.exe -X POST https://scythe327-career-ops.hf.space/run/doctor
```

### Verify Pipeline

**POST** `/run/verify`

Verifies the end-to-end pipeline is functional.

```powershell
curl.exe -X POST https://scythe327-career-ops.hf.space/run/verify
```

---

## PDF Generation

**POST** `/run/pdf`

Convert HTML to PDF using Playwright (Chromium).

```powershell
$body = '{"input":"input.html","output":"output/cv.pdf"}'
curl.exe -X POST https://scythe327-career-ops.hf.space/run/pdf ^
  -H "Content-Type: application/json" -d $body
```

---

## YC-Specific

### Fetch YC Jobs (Algolia)

**POST** `/run/yc-fetch`

Search YC Work at a Startup with filters. Requires `YC_ALGOLIA_KEY` secret.

```powershell
$body = '{"role":"eng","location":"Remote","hits":20}'
curl.exe -X POST https://scythe327-career-ops.hf.space/run/yc-fetch ^
  -H "Content-Type: application/json" -d $body
```

### Scrape YC Public

**POST** `/run/yc-scrape`

Lists all YC companies via the public API (no key needed).

```powershell
curl.exe -X POST https://scythe327-career-ops.hf.space/run/yc-scrape
```

### Deep YC Engineering Scrape

**POST** `/run/yc-scrape-eng`

Filters YC jobs by engineering role with pagination.

```powershell
$body = '{"filters":"role:eng","hits":100}'
curl.exe -X POST https://scythe327-career-ops.hf.space/run/yc-scrape-eng ^
  -H "Content-Type: application/json" -d $body
```

---

## AI-Powered Prompts (Async)

### Run AI Prompt

**POST** `/run/ai-prompt`

Run an AI prompt via `opencode-ai` (built-in model, no external API key needed). Returns immediately with a `job_id` — poll the GET endpoint for results.

```powershell
Set-Content -Path body.json -Value '{"prompt":"List 3 SRE best practices"}'
curl.exe -X POST https://scythe327-career-ops.hf.space/run/ai-prompt ^
  -H "Content-Type: application/json" -d @body.json
```

Response:
```json
{ "success": true, "job_id": "a1b2c3d4", "status": "running" }
```

### Poll AI Result

**GET** `/run/ai-prompt/:jobId`

```powershell
curl.exe https://scythe327-career-ops.hf.space/run/ai-prompt/a1b2c3d4
```

Response (running):
```json
{ "job_id": "a1b2c3d4", "status": "running", "result": null }
```

Response (done):
```json
{ "job_id": "a1b2c3d4", "status": "done", "result": "...", "error": null }
```

### List AI Jobs

**GET** `/run/ai-prompt`

Lists all recent AI prompt jobs.

```powershell
curl.exe https://scythe327-career-ops.hf.space/run/ai-prompt
```

---

## Scheduled Jobs

The server auto-runs these if the corresponding env vars are set:

| Env Var | Cron Format | Default Schedule |
|---------|------------|------------------|
| `SCAN_SCHEDULE` | `0 9 * * 1` | Mon 9am |
| `OUTREACH_SCHEDULE` | `0 10 * * *` | Daily 10am |
| `YC_SCHEDULE` | `0 8 * * 1` | Mon 8am |

---

## Step-by-Step Example: Full Workflow

### 1. Check the server is alive

```powershell
curl.exe https://scythe327-career-ops.hf.space/health
# → { "status": "ok", "uptime": 137 }
```

### 2. Find jobs

```powershell
# Quick public YC scan (no key needed)
curl.exe -X POST https://scythe327-career-ops.hf.space/run/scrape ^
  -H "Content-Type: application/json" -d '{"source":"yc-public"}'
# → { "success": true, "results": [...] }
```

### 3. Send a targeted outreach

```powershell
curl.exe -X POST https://scythe327-career-ops.hf.space/run/outreach-for ^
  -H "Content-Type: application/json" -d '{"company":"Zymbly","role":"Forward Deployed Engineer"}'
# → { "success": true, "emails_tried": [...] }
```

### 4. Run diagnostics

```powershell
curl.exe -X POST https://scythe327-career-ops.hf.space/run/doctor
# → { "success": true }
```

---

## Notes

- Use a temp file for JSON body in PowerShell: `Set-Content -Path body.json -Value '...'` then `curl.exe -d "@body.json"`
- Persistent storage at `/data` — config files (`profile.yml`, `portals.yml`, `cv.md`) go in `/data/config/` and survive redeploys
- SMTP credentials (`SMTP_USER`, `SMTP_PASS`) are injected via HF Secrets
- `config/email.yml` is auto-created at startup from `SMTP_USER`/`SMTP_PASS` env vars
- `YC_ALGOLIA_KEY` is optional — Algolia-based endpoints work without it (public endpoints don't need it)
