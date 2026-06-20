# Deploy Career-Ops on Koyeb

## 1. Push to GitHub

```sh
git add -A
git commit -m "add Koyeb deployment (Dockerfile + server wrapper)"
git push
```

## 2. Create Secrets (Koyeb Console → Secrets)

| Secret Name | Value |
|---|---|
| `SMTP_USER` | `rohanph3277@gmail.com` |
| `SMTP_PASS` | *(your Gmail app password)* |
| `YC_ALGOLIA_KEY` | *(Algolia search key from ycombinator.com — see below)* |
| `EMAIL_VERIFICATION_KEY` | *(ZeroBounce/Hunter API key — optional)* |

> **Get the YC Algolia key:** Visit https://www.workatastartup.com/companies → View page source → search for `AlgoliaOpts.key` → copy the value.

## 3. Create Config Files (Koyeb Console → App → Settings → Config Files)

### `/app/config/email.yml`
```yaml
smtp_host: smtp.gmail.com
smtp_port: 587
smtp_secure: false
smtp_user: '{{ secret.SMTP_USER }}'
smtp_pass: '{{ secret.SMTP_PASS }}'
from_name: 'Rohan P H'
from_email: 'rohanph3277@gmail.com'
candidate_linkedin: 'https://linkedin.com/in/rohan-p-h-876865250'
candidate_portfolio: 'https://rohanph-cloud-engineer-75sm7wl.gamma.site/'
```

### `/app/config/profile.yml`
*(copy your local `config/profile.yml` content here)*

### `/app/portals.yml`
*(copy your local `portals.yml` content here)*

### `/app/cv.md`
*(copy your local `cv.md` content here)*

## 4. Create the App + Service (Koyeb Console)

1. **Create App** → name: `career-ops`
2. **Create Service** → select your GitHub repo, branch `main`
3. **Builder**: `Dockerfile`
4. **Service type**: `Worker`
5. **Instance**: `micro` or `nano` (512MB RAM is enough)
6. **Ports**: not needed for Worker type (health is via TCP)
7. **Volumes**:
   - `/app/data`
   - `/app/output`
   - `/app/reports`
   - `/app/jds`
   - `/app/batch/tracker-additions`
8. **Environment variables**:
   - `PORT` → `8000`
   - `SCAN_SCHEDULE` → `0 9 * * 1` (scan every Monday 9am — optional)
   - `OUTREACH_SCHEDULE` → `0 10 * * *` (outreach daily 10am — optional)
   - `YC_SCHEDULE` → `0 8 * * 1` (YC scrape every Monday 8am — optional)

## 5. Deploy

Click **Deploy**. Koyeb clones your repo, builds the Docker image, starts the server.

## 6. Trigger Scripts

```sh
# Scan all portals
curl -X POST https://career-ops-yourname.koyeb.app/run/scan

# Scan specific company
curl -X POST https://career-ops-yourname.koyeb.app/run/scan \
  -H 'Content-Type: application/json' \
  -d '{"company": "Supabase"}'

# Dry run scan
curl -X POST https://career-ops-yourname.koyeb.app/run/scan \
  -H 'Content-Type: application/json' \
  -d '{"dryRun": true}'

# Run worldwide outreach
curl -X POST https://career-ops-yourname.koyeb.app/run/worldwide-outreach

# Fetch YC jobs via Algolia (requires YC_ALGOLIA_KEY secret)
curl -X POST https://career-ops-yourname.koyeb.app/run/yc-fetch \
  -H 'Content-Type: application/json' \
  -d '{"role": "eng", "location": "Remote", "hits": 20}'

# Scrape YC jobs via public API (no key needed)
curl -X POST https://career-ops-yourname.koyeb.app/run/yc-scrape

# Deep scrape YC engineering jobs via Algolia
curl -X POST https://career-ops-yourname.koyeb.app/run/yc-scrape-eng \
  -H 'Content-Type: application/json' \
  -d '{"filters": "role:eng", "hits": 100}'

# Unified scrape endpoint — run any source with a prompt
curl -X POST https://career-ops-yourname.koyeb.app/run/scrape \
  -H 'Content-Type: application/json' \
  -d '{
    "prompt": "find senior backend engineer at stripe in london",
    "source": "yc",
    "company": "Stripe",
    "role": "eng",
    "location": "London",
    "title": "senior backend engineer",
    "hits": 50
  }'

# Run all scrapers at once
curl -X POST https://career-ops-yourname.koyeb.app/run/scrape \
  -H 'Content-Type: application/json' \
  -d '{"source": "all", "role": "eng", "location": "Remote"}'

# Generate PDF from HTML
curl -X POST https://career-ops-yourname.koyeb.app/run/pdf \
  -H 'Content-Type: application/json' \
  -d '{"input": "input.html", "output": "output/cv.pdf"}'

# Health check
curl https://career-ops-yourname.koyeb.app/health
```

## 7. Local dev still works unchanged

```sh
node scan.mjs
node send-outreach.mjs
```
All existing scripts work as before — no changes needed.
