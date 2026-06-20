# Modo: worldwide-coldemail — Worldwide Remote SDE Cold Outreach

Targets "work from anywhere" remote SDE/Cloud/Backend jobs paying in strong currency (USD/EUR/GBP/CHF).
Finds hiring managers, crafts cold emails, sends via SMTP. Continues until 20 matching emails are SENT.

## Profile Context

Candidate: **Rohan P H** — Cloud & Backend Engineer (Java, AWS, Quarkus/Spring)
- Based: Bengaluru, India (IST, GMT+5:30)
- Indian passport holder — needs worldwide-remote roles (no location restrictions)
- Must pay in stronger currency (USD/EUR/GBP/CHF) — NOT INR-only
- Email: rohanph3277@gmail.com
- LinkedIn: linkedin.com/in/rohan-p-h-876865250
- Portfolio: https://rohanph-cloud-engineer-75sm7wl.gamma.site/
- CV: cv.md (project root)

## Target Roles (match score priority)
1. Cloud Engineer / Backend Engineer (Java/AWS) — **highest match**
2. Platform Engineer / Infrastructure Engineer
3. Software Engineer (general, with backend/cloud focus)
4. DevOps / SRE / Site Reliability Engineer

## Job Sources to Search (in priority order)
- workfromanywhere.io — worldwide remote jobs
- wearedistributed.org — global WFA jobs
- himalayas.app — filter: "Open to candidates from all countries"
- realworkfromanywhere.com — curated WFA
- remotiverocketship.com — worldwide filter
- remoteok.com — remote jobs
- LinkedIn "Work from Anywhere" remote jobs

## Flow

### Step 1 — Discover jobs
Use WebSearch to find currently active "work from anywhere" remote SDE jobs:
```
WebSearch: "work from anywhere" OR "anywhere in the world" "software engineer" OR "backend engineer" OR "cloud engineer" remote 2026
WebSearch: site:himalayas.app "Open to candidates from all countries" software engineer OR backend engineer
WebSearch: site:realworkfromanywhere.com software engineer OR backend engineer OR cloud engineer
WebSearch: site:wearedistributed.org jobs software engineer OR backend engineer
```

For each result, extract:
- Company name
- Role title
- Job URL
- Salary/currency (if visible)
- Location restriction (NONE = eligible)

### Step 2 — Filter for match
Score each job against CV using:
- **Primary** (2x): java, aws, cloud, backend, microservices, serverless, spring, quarkus, api, platform
- **Secondary** (1x): infrastructure, devops, sre, reliability, distributed, full stack
- **Bonus** (1x): senior, lead, staff, software engineer, cloud engineer, backend engineer

**Only proceed with jobs scoring 40+** (scale 0-100).

### Step 3 — Find hiring manager/recruiter
For each matched job, use WebSearch:
```
WebSearch: "{company} talent acquisition OR recruiter OR hiring manager engineering linkedin"
WebSearch: "{company} {role} hiring manager email"
WebSearch: "{company} recruiter email OR linkedin"
```

Extract:
- Name
- LinkedIn profile URL
- Email (if public)
- Role/title
- Confidence (high/medium/low)

**Prefer Engineering Managers / Hiring Managers** over generic recruiters.

### Step 4 — Craft cold email
Use contacto framework from `modes/contacto.md`:

**For Hiring Managers:**
- **Hook**: Specific challenge their team faces (from JD or company news)
- **Proof**: Biggest quantifiable achievement from cv.md solving similar problems
- **CTA**: "Would love to hear how your team is approaching [challenge]"

**Rules:**
- Max 150 words for email
- NO corporate-speak
- NO "I'm passionate about..."
- NEVER share phone number
- Cite exact proof points from cv.md

### Step 5 — Send email
If email found AND confidence is high/medium, add to `data/outreach.tsv` and send immediately:
```js
import { sendSingleOutreach } from './send-outreach.mjs';
await sendSingleOutreach(email, name, company, role, body, subject, candidateInfo);
```

### Step 6 — Track
Record in `data/outreach.tsv`:
```
date	company	role	recruiter_name	recruiter_channel	message_type	status
```

### Step 7 — Loop
- Check `data/applications.md` and `data/outreach.tsv` for existing contacts to avoid duplicates
- Continue Steps 1-6 until **20 emails are status= "sent"**
- If fewer than 20 found in one pass, wait and try again (note: send-outreach.mjs has daily cap of 20)

## Tools Available
- WebSearch: for job discovery + recruiter finding
- WebFetch: for reading job descriptions
- Bash: for running send-outreach.mjs
- Read: cv.md, config/profile.yml, config/email.yml, data/outreach.tsv
- Write/Edit: data/outreach.tsv (to add entries)

## Critical Rules
1. NEVER guess emails. Only use publicly available emails found via WebSearch.
2. If no email found, use LinkedIn profile URL as channel and note "send via LinkedIn".
3. Respect send-outreach.mjs daily cap (20 emails/day).
4. Never contact same company twice for different roles in the same batch.
5. Skip any role that requires location in US/EU only — only "anywhere in world" jobs qualify.
6. Skip any role paying in INR — must be USD/EUR/GBP/CHF.
7. Rohan has an Indian passport — skip jobs requiring US work authorization.
8. After each batch, report count: "Sent X/20. Y remaining."
9. When 20 is reached: "✅ Target reached: 20 emails sent!"
10. Read `_shared.md` and `_profile.md` before starting.
