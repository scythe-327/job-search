import express from 'express';
import { execFile } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import schedule from 'node-schedule';

const PORT = process.env.PORT || 8000;

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

app.post('/run/doctor', async (_req, res) => {
  try {
    await runScript('doctor.mjs');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.error?.message || err.message });
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
