import express from 'express';
import { execFile } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, readdirSync, copyFileSync } from 'fs';
import { randomUUID } from 'crypto';
import schedule from 'node-schedule';

const EMAIL_SVC = process.env.EMAIL_SERVICE_URL;

const PORT = process.env.PORT || 7860;
const jobs = {};

const DATA_DIRS = ['output', 'reports', 'jds', 'batch/tracker-additions', 'tmp'];

const STARTER_FILES = {
  'data/pipeline.md': '# Pipeline Inbox\n\n## Pendientes\n\n## Procesadas\n',
  'data/applications.md': '# Applications Tracker\n\n| # | Date | Company | Role | Score | Status | PDF | Report | Notes |\n|---|------|---------|------|-------|--------|-----|--------|-------|\n',
  'data/outreach.tsv': 'date\tcompany\trole\trecruiter_name\trecruiter_channel\tmessage_type\tstatus\tsubject\tmessage\tresume_path\n',
  'data/scan-history.tsv': 'url\tfirst_seen\tportal\ttitle\tcompany\tstatus\n',
};

function ensureDataFiles() {
  for (const dir of DATA_DIRS) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
  for (const [file, content] of Object.entries(STARTER_FILES)) {
    if (!existsSync(file)) writeFileSync(file, content, 'utf-8');
  }
  // Create config/email.yml from env vars (HF Spaces) — refresh always to pick up secret changes
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    const yml = `smtp_host: smtp.gmail.com\nsmtp_port: 587\nsmtp_secure: false\nsmtp_user: '${process.env.SMTP_USER}'\nsmtp_pass: '${process.env.SMTP_PASS}'\nfrom_name: 'Rohan P H'\nfrom_email: '${process.env.SMTP_USER}'\ncandidate_linkedin: 'https://linkedin.com/in/rohan-p-h-876865250'\ncandidate_portfolio: 'https://rohanph-cloud-engineer-75sm7wl.gamma.site/'\n`;
    mkdirSync('config', { recursive: true });
    writeFileSync('config/email.yml', yml, 'utf-8');
    console.log('Created config/email.yml from SMTP_USER/SMTP_PASS env vars');
  }
  // Copy persistent config from /data/config/ if available (HF Spaces)
  if (existsSync('/data/config/')) {
    for (const f of readdirSync('/data/config/')) {
      if (!existsSync(f)) {
        copyFileSync('/data/config/' + f, f);
        console.log('Restored ' + f + ' from /data/config/');
      }
    }
  }
}

function runScript(script, args = []) {
  return new Promise((resolve, reject) => {
    const child = execFile('node', [script, ...args], {
      cwd: '.',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    }, (error, stdout, stderr) => {
      if (error) reject({ error, stderr });
      else resolve({ stdout, stderr });
    });
    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);
  });
}

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

app.post('/run/scan', async (req, res) => {
  try {
    const args = req.body?.company ? ['--company', req.body.company] : [];
    if (req.body?.dryRun) args.push('--dry-run');
    await runScript('scan.mjs', args);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.error?.message || err.message });
  }
});

app.post('/run/send-outreach', async (_req, res) => {
  try {
    await runScript('send-outreach.mjs');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.error?.message || err.message });
  }
});

app.post('/run/worldwide-outreach', async (_req, res) => {
  try {
    await runScript('worldwide-outreach-agent.mjs');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.error?.message || err.message });
  }
});

app.post('/run/pdf', async (req, res) => {
  try {
    const { input, output, format } = req.body || {};
    if (!input || !output) return res.status(400).json({ error: 'input and output required' });
    const args = [input, output];
    if (format) args.push(`--format=${format}`);
    await runScript('generate-pdf.mjs', args);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.error?.message || err.message });
  }
});

app.post('/run/test-email', async (req, res) => {
  try {
    const { to, subject, message } = req.body || {};
    if (!to) return res.status(400).json({ error: '"to" field required' });

    // Use email microservice if configured (Koyeb)
    if (EMAIL_SVC) {
      const r = await fetch(EMAIL_SVC + '/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, subject: subject || 'Career-Ops Test Email', text: message || 'Test from Career-Ops.' }),
      });
      const d = await r.json();
      return res.json(d);
    }

    const cfg = (await import('js-yaml')).load(await import('fs').then(m => m.readFileSync('config/email.yml', 'utf-8')));
    const transporter = (await import('nodemailer')).default.createTransport({
      host: cfg.smtp_host, port: cfg.smtp_port, secure: cfg.smtp_secure,
      auth: { user: cfg.smtp_user, pass: cfg.smtp_pass },
    });

    const body = `Hi,

This is a test email from the Career-Ops deployment.

${message || 'Test message - no content.'}

---
Best regards,
${cfg.from_name || 'Career-Ops'}
${cfg.candidate_linkedin || ''}`;

    await transporter.sendMail({
      from: `"${cfg.from_name}" <${cfg.from_email}>`,
      to, subject: subject || 'Career-Ops Test Email', text: body,
    });

    res.json({ success: true, to });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/run/doctor', async (_req, res) => {
  try {
    await runScript('doctor.mjs');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.error?.message || err.message });
  }
});

app.post('/run/upload-config', (req, res) => {
  try {
    const { files } = req.body || {};
    if (!files || typeof files !== 'object') return res.status(400).json({ error: 'files object required' });
    mkdirSync('/data/config', { recursive: true });
    const written = [];
    for (const [name, content] of Object.entries(files)) {
      const safe = name.replace(/[^a-zA-Z0-9._-]/g, '');
      if (!safe) continue;
      writeFileSync('/data/config/' + safe, String(content), 'utf-8');
      writeFileSync(safe, String(content), 'utf-8');
      written.push(safe);
    }
    res.json({ success: true, files: written });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/run/verify', async (_req, res) => {
  try {
    await runScript('verify-pipeline.mjs');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.error?.message || err.message });
  }
});

app.post('/run/yc-fetch', async (req, res) => {
  try {
    const args = [];
    if (req.body?.query) args.push('-q', req.body.query);
    if (req.body?.role) args.push('--role', req.body.role);
    if (req.body?.location) args.push('-l', req.body.location);
    if (req.body?.company) args.push('--company', req.body.company);
    if (req.body?.hits) args.push('-n', String(req.body.hits));
    if (req.body?.output) args.push('-o', req.body.output);
    await runScript('scripts/yc-fetch.mjs', ['fetch', ...args]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.error?.message || err.message });
  }
});

app.post('/run/yc-scrape', async (_req, res) => {
  try {
    await runScript('scripts/yc-scraper.mjs');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.error?.message || err.message });
  }
});

app.post('/run/yc-scrape-eng', async (req, res) => {
  try {
    const args = [];
    if (req.body?.filters) args.push('-f', req.body.filters);
    if (req.body?.hits) args.push('-n', String(req.body.hits));
    if (req.body?.maxPages) args.push('-m', String(req.body.maxPages));
    await runScript('scripts/scrape-yc-jobs.mjs', args);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.error?.message || err.message });
  }
});

app.post('/run/scrape', async (req, res) => {
  const { prompt, source, company, role, location, title, hits } = req.body || {};
  const sources = source === 'all' ? ['portals', 'yc', 'yc-eng', 'yc-public'] : [source || 'yc'];
  const results = [];

  console.log(`[scrape] prompt="${prompt}" source=${sources.join(',')} company=${company} role=${role} location=${location}`);

  for (const s of sources) {
    try {
      switch (s) {
        case 'portals': {
          const args = [];
          if (company) args.push('--company', company);
          await runScript('scan.mjs', args);
          results.push({ source: s, success: true });
          break;
        }
        case 'yc': {
          const args = ['fetch'];
          if (company) args.push('--company', company);
          if (role) args.push('--role', role);
          if (location) args.push('-l', location);
          if (title) args.push('-q', title);
          if (hits) args.push('-n', String(hits));
          await runScript('scripts/yc-fetch.mjs', args);
          results.push({ source: s, success: true });
          break;
        }
        case 'yc-eng': {
          const args = [];
          const filters = [];
          if (role) filters.push(`role:${role}`);
          if (company) filters.push(`company_name:"${company}"`);
          if (location) filters.push(`locations_for_search:"${location}"`);
          if (filters.length) args.push('-f', filters.join(' AND '));
          if (hits) args.push('-n', String(hits));
          await runScript('scripts/scrape-yc-jobs.mjs', args);
          results.push({ source: s, success: true });
          break;
        }
        case 'yc-public': {
          await runScript('scripts/yc-scraper.mjs');
          results.push({ source: s, success: true });
          break;
        }
        default:
          results.push({ source: s, success: false, error: `unknown source: ${s}` });
      }
    } catch (err) {
      results.push({ source: s, success: false, error: err.error?.message || err.message });
    }
  }

  res.json({ success: results.some(r => r.success), results });
});

app.post('/run/outreach-for', async (req, res) => {
  try {
    const { company, role } = req.body || {};
    if (!company || !role) return res.status(400).json({ error: '"company" and "role" required' });

    const fs = await import('fs');
    const jsYaml = await import('js-yaml');

    // 1. Load CV
    const cv = fs.existsSync('cv.md') ? fs.readFileSync('cv.md', 'utf-8') : '';
    // 2. Load SMTP config
    const cfg = jsYaml.load(fs.readFileSync('config/email.yml', 'utf-8'));
    const transporter = (await import('nodemailer')).default.createTransport({
      host: cfg.smtp_host, port: cfg.smtp_port, secure: cfg.smtp_secure,
      auth: { user: cfg.smtp_user, pass: cfg.smtp_pass },
    });

    // 3. Try YC Algolia for company info
    let jobInfo = null;
    try {
      const algoliaKey = process.env.YC_ALGOLIA_KEY || '';
      if (algoliaKey) {
        const resA = await fetch(`https://45bwzj1sgc-dsn.algolia.net/1/indexes/WaaSPublicCompanyJob_created_at_desc_production/query`, {
          method: 'POST',
          headers: { 'X-Algolia-Application-Id': '45BWZJ1SGC', 'X-Algolia-API-Key': algoliaKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: role, hitsPerPage: 5, filters: `company_name:"${company}"`, attributesToRetrieve: ['title','company_name','locations_for_search','remote','description'] }),
        });
        const data = await resA.json();
        if (data.hits?.length) jobInfo = data.hits[0];
      }
    } catch {}

    // 4. Build a genuine outreach email using CV context
    const name = cfg.from_name || 'Rohan P H';
    const headline = 'Cloud & Backend Engineer specializing in serverless AWS, Java microservices, and AI';
    const highlights = cv.includes('60%') ? 'reducing cold-start latency by 60%, cutting cloud OpEx by 65%, and building LLM-powered RAG systems' : 'building and scaling distributed systems on AWS';
    const companyContext = jobInfo ? `I see you're hiring a ${jobInfo.title} — ${jobInfo.description?.substring(0, 200) || 'building AI-native solutions'}` : `I'm very interested in the ${role} role at ${company}`;

    const body = `Hi ${company} team,

${companyContext}.

I'm ${name}, a ${headline}. At BT Openreach, I've been owning end-to-end delivery of serverless platforms — ${highlights}.

I'm drawn to ${company} because of the meaningful impact you're making, and I'm confident my background in ${(jobInfo?.description || '').includes('AWS') ? 'AWS, distributed systems, and on-the-ground delivery' : 'full-stack engineering, security, and AI'} aligns well with what you're building.

I'd love to chat about how I can contribute.

Best,
${name}
${cfg.candidate_linkedin || ''}`;

    // 5. Guess founder emails
    const domain = company.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com';
    const guesses = [`hello@${domain}`, `founders@${domain}`, `apply@${domain}`, `team@${domain}`];

    let sent = false;
    const results = [];
    for (const to of guesses) {
      try {
        if (EMAIL_SVC) {
          const r = await fetch(EMAIL_SVC + '/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to, subject: `Application for ${role} at ${company}`, text: body }),
          });
          const d = await r.json();
          if (d.success) { results.push({ to, success: true }); sent = true; break; }
          else { results.push({ to, success: false, error: d.error }); }
        } else {
          await transporter.sendMail({
            from: `"${cfg.from_name}" <${cfg.from_email}>`,
            to, subject: `Application for ${role} at ${company}`, text: body,
          });
          results.push({ to, success: true });
          sent = true;
          break;
        }
      } catch (e) {
        results.push({ to, success: false, error: e.message });
      }
    }

    res.json({ success: sent, company, role, candidate_name: name, emails_tried: results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/run/ai-prompt', (req, res) => {
  const { prompt } = req.body || {};
  if (!prompt) return res.status(400).json({ error: '"prompt" required' });

  const jobId = randomUUID().slice(0, 8);
  jobs[jobId] = { status: 'running', prompt, result: null, error: null, started: Date.now() };

  const child = execFile('opencode', ['run', prompt, '--dangerously-skip-permissions', '--format', 'default'], {
    cwd: '.',
    env: { ...process.env, TERM: 'dumb', OPENCODE_CLI_DISABLE_TELEMETRY: '1' },
    timeout: 600000,
    maxBuffer: 10 * 1024 * 1024,
  });

  let stdout = '', stderr = '';
  child.stdout.on('data', d => stdout += d);
  child.stderr.on('data', d => stderr += d);

  child.on('close', code => {
    jobs[jobId].status = code === 0 ? 'done' : 'error';
    jobs[jobId].result = stdout.trim();
    jobs[jobId].error = code !== 0 ? stderr.trim() : null;
  });
  child.on('error', err => {
    jobs[jobId].status = 'error';
    jobs[jobId].error = err.message;
  });

  res.json({ success: true, job_id: jobId, status: 'running' });
});

app.get('/run/ai-prompt/:jobId', (req, res) => {
  const job = jobs[req.params.jobId];
  if (!job) return res.status(404).json({ error: 'job not found' });
  res.json({ job_id: req.params.jobId, status: job.status, result: job.result, error: job.error });
});

app.get('/run/ai-prompt', (_req, res) => {
  const list = Object.entries(jobs).slice(-20).map(([id, j]) => ({ job_id: id, status: j.status, prompt: j.prompt?.slice(0, 80), started: j.started }));
  res.json(list);
});

const SCAN_SCHEDULE = process.env.SCAN_SCHEDULE;
const OUTREACH_SCHEDULE = process.env.OUTREACH_SCHEDULE;
const YC_SCHEDULE = process.env.YC_SCHEDULE;

if (SCAN_SCHEDULE) {
  schedule.scheduleJob(SCAN_SCHEDULE, () => {
    console.log(`[${new Date().toISOString()}] Scheduled scan starting...`);
    runScript('scan.mjs').catch(err => console.error('Scheduled scan failed:', err.error?.message));
  });
  console.log(`Scan scheduled: ${SCAN_SCHEDULE}`);
}

if (OUTREACH_SCHEDULE) {
  schedule.scheduleJob(OUTREACH_SCHEDULE, () => {
    console.log(`[${new Date().toISOString()}] Scheduled outreach starting...`);
    runScript('worldwide-outreach-agent.mjs').catch(err => console.error('Scheduled outreach failed:', err.error?.message));
  });
  console.log(`Outreach scheduled: ${OUTREACH_SCHEDULE}`);
}

if (YC_SCHEDULE) {
  schedule.scheduleJob(YC_SCHEDULE, () => {
    console.log(`[${new Date().toISOString()}] Scheduled YC scrape starting...`);
    runScript('scripts/yc-scraper.mjs').catch(err => console.error('Scheduled YC scrape failed:', err.error?.message));
  });
  console.log(`YC scrape scheduled: ${YC_SCHEDULE}`);
}

ensureDataFiles();

app.listen(PORT, () => {
  console.log(`Career-Ops server listening on port ${PORT}`);
});
