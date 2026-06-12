# Modo: coldemail — Batch Outreach to Recruiters

Sends cold emails/LinkedIn messages to recruiters and hiring managers for jobs in the pipeline.

## Flow

For each job in the input (from pipeline "Pendientes" or provided directly):
  1. Extract company name and role title
  2. WebSearch to find the recruiter / talent acquisition person hiring for that role at that company
  3. Search for their LinkedIn profile or email
  4. Craft a custom message using the contacto framework (3-sentence structure) + candidate's CV
  5. Output the complete outreach ready to send

## Input

Accepts from pipeline "Pendientes" section (`data/pipeline.md`) or inline:
```
/career-ops coldemail
  → Reads all pending jobs from data/pipeline.md
/career-ops coldemail [URL]
  → Single job URL
/career-ops coldemail batch:3
  → Top 3 pending jobs
```

## Workflow

### Step 1 — Gather jobs
Read jobs from pipeline.md "Pendientes" section. Extract for each:
  - `{url}` — job posting URL
  - `{company}` — company name
  - `{title}` — role title

If `batch:N` specified, process only the first N pending items.

### Step 2 — Find recruiters
For each job, use WebSearch to find the recruiter:
```
WebSearch: "{company} hiring {title} recruiter OR talent acquisition OR HR"
WebSearch: "{company} talent acquisition team linkedin"
WebSearch: "site:linkedin.com/in {company} talent recruiter {title}"
```

Extract:
  - Name of recruiter
  - LinkedIn profile URL
  - Email (if publicly available)
  - Their role/title (e.g., "Technical Recruiter", "Talent Acquisition Partner")
  - Confidence level (high/medium/low)

### Step 3 — Classify contact type
Infer from their title:
  - **Recruiter** — "Talent Acquisition", "Recruiter", "Sourcing", "HR"
  - **Hiring Manager** — "Engineering Manager", "Head of", "Director", "VP"
  - **Peer** — Same/similar role title at the company

### Step 4 — Craft message
Use the contacto framework from `modes/contacto.md`:

**For Recruiters (default):**
  - **Frase 1 (Fit)**: Direct match criteria — role, relevant experience, location/availability
  - **Frase 2 (Proof)**: One quantifiable achievement from CV that answers screening questions
  - **Frase 3 (CTA)**: "Happy to share my CV if this aligns with what you're looking for"

**For Hiring Managers:**
  - **Frase 1 (Hook)**: Specific challenge their team faces (from JD or company news)
  - **Frase 2 (Proof)**: Biggest quantifiable achievement solving similar problems
  - **Frase 3 (CTA)**: "Would love to hear how your team is approaching [specific challenge]"

Rules:
- Max 300 chars for LinkedIn, max 150 words for email
- NO corporate-speak
- NO "I'm passionate about..."
- NEVER share phone number
- Cite exact proof points from cv.md (line references)

### Step 5 — Output

```
════════════════════════════════════════════════════
Cold Outreach Batch — {YYYY-MM-DD}
Jobs processed: N
Recruiters found: N
Messages generated: N
════════════════════════════════════════════════════

#1 | {company} | {title}
────────────────────────────────────────────────────
  Recruiter: {name} | {role}
  LinkedIn: {url}
  Email: {email} {confidence}
  Channel: {linkedin | email | both}

  Message (LinkedIn - 300 chars):
  ┌─────────────────────────────────────┐
  │ {message}                           │
  └─────────────────────────────────────┘

  Message (Email):
  ┌─────────────────────────────────────┐
  │ Subject: {subject}                  │
  │                                     │
  │ {email_body}                        │
  └─────────────────────────────────────┘

#2 | ...
```

### Step 6 — Send email
If the recruiter has an email and the channel is `email` or `both`, send the email immediately via SMTP.

**Setup required (one-time):**
1. Copy `config/email.yml.example` → `config/email.yml`
2. Fill in your Gmail + App Password
3. Generate App Password at: https://myaccount.google.com/apppasswords

**Sending via script:**
```js
import { sendSingleOutreach } from './send-outreach.mjs';

await sendSingleOutreach(
  "recruiter@company.com",      // to
  "Recruiter Name",             // recruiterName
  "Company",                    // company
  "Role Title",                 // role
  "Custom message body...",     // message
  "Subject: Candidate for Role",// subject
  { name: "Rohan PH", linkedin: "linkedin.com/in/rohanph", portfolio: "https://..." }
);
```

### Step 7 — Track outreach
After generating messages, register in `data/outreach.tsv`:
```
date	company	role	recruiter_name	recruiter_channel	message_type	status
2026-05-16	Acme	FDE	John Doe	linkedin	connection_request	draft
2026-05-16	Acme	FDE	Jane Smith	email	custom	sent
```

- Drafted (not sent yet) → status `draft`
- Email sent → status `sent`
- LinkedIn message (user must send manually) → status `draft` (user marks `sent` after sending)

Create `data/outreach.tsv` if it doesn't exist.

## Execution

This mode is delegated to a subagent (uses WebSearch heavily):

```
Agent(
    subagent_type="general-purpose",
    prompt="[content of modes/_shared.md]\n\n[content of modes/coldemail.md]\n\n[invocation-specific data]",
    description="career-ops coldemail"
)
```

## Requirements

- Always read cv.md for proof points before crafting messages
- Always read modes/_profile.md for narrative framing
- If no recruiter found for a job, skip it and note "No recruiter found"
- If multiple recruiters found, pick the most relevant one (closest to the role/team)
- Respect LENGTH LIMITS strictly — LinkedIn connection requests are 300 chars max
