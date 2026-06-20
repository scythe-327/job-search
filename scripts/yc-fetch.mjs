#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const ALGOLIA_APP_ID = '45BWZJ1SGC';
const JOBS_INDEX = 'WaaSPublicCompanyJob_created_at_desc_production';

const mode = process.argv[2] || 'fetch';
const args = process.argv.slice(3);
const opts = {
  query: '', role: 'eng', location: '', company: '', batch: '',
  minExp: '', hits: 20, page: 0, output: '', apiKey: '',
  extractKey: false, interactive: false,
};

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--query' || a === '-q') opts.query = args[++i];
  else if (a === '--role') opts.role = args[++i];
  else if (a === '--location' || a === '-l') opts.location = args[++i];
  else if (a === '--company') opts.company = args[++i];
  else if (a === '--batch' || a === '-b') opts.batch = args[++i];
  else if (a === '--exp') opts.minExp = args[++i];
  else if (a === '--hits' || a === '-n') opts.hits = parseInt(args[++i]) || 20;
  else if (a === '--page' || a === '-p') opts.page = parseInt(args[++i]) || 0;
  else if (a === '--output' || a === '-o') opts.output = args[++i];
  else if (a === '--api-key') opts.apiKey = args[++i];
  else if (a === '--extract-key') opts.extractKey = true;
  else if (a === '--interactive' || a === '-i') opts.interactive = true;
  else if (a === '--help' || a === '-h') { help(); process.exit(0); }
}

function help() { console.log(`
YC Job Fetcher + Cold Outreach Pipeline

USAGE:

  # Fetch jobs from YC Work at a Startup (Algolia)
  node scripts/yc-fetch.mjs fetch -q "founding engineer" -l Bengaluru -n 10
  node scripts/yc-fetch.mjs fetch --role eng -l Remote -n 20 -o jobs.json

  # Parse pasted YC job listing text into structured JSON
  node scripts/yc-fetch.mjs parse listings.txt -o jobs.json

  # Show pipeline instructions
  node scripts/yc-fetch.mjs send

  # API key can also be set via YC_ALGOLIA_KEY env var
`); }

async function queryAlgolia(apiKey, indexName, body) {
  const endpoint = `https://${ALGOLIA_APP_ID.toLowerCase()}-dsn.algolia.net/1/indexes/${indexName}/query`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'X-Algolia-Application-Id': ALGOLIA_APP_ID,
      'X-Algolia-API-Key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const result = await res.json();
  if (!res.ok || result.status === 403 || result.message) {
    if (result.message?.includes('Invalid')) {
      throw new Error(`Algolia auth failed: ${result.message}. Check your YC_ALGOLIA_KEY.`);
    }
    throw new Error(`Algolia error: ${JSON.stringify(result)}`);
  }
  return result;
}

async function cmdFetch() {
  const apiKey = opts.apiKey || process.env.YC_ALGOLIA_KEY || '';
  if (!apiKey) {
    console.log('❌ No API key provided. Use --api-key <key> or set YC_ALGOLIA_KEY env var.');
    console.log('💡 Get the key from the ycombinator.com page (AlgoliaOpts.key) and pass it.');
    process.exit(1);
  }

  const filters = [];
  if (opts.role) filters.push(`role:${opts.role}`);
  if (opts.location) filters.push(`locations_for_search:"${opts.location}"`);
  if (opts.company) filters.push(`company_name:"${opts.company}"`);
  if (opts.minExp) filters.push(`min_experience:>=${opts.minExp}`);

  console.log(`\n🔎 Fetching from ${JOBS_INDEX}...`);
  if (filters.length) console.log(`   Filters: ${filters.join(' AND ')}`);

  try {
    const result = await queryAlgolia(apiKey, JOBS_INDEX, {
      query: opts.query,
      hitsPerPage: opts.hits,
      page: opts.page,
      filters: filters.length > 0 ? filters.join(' AND ') : undefined,
      attributesToRetrieve: ['title','company_name','company_website',
        'company_description','locations_for_search','remote',
        'min_experience','search_path','created_at','description'],
    });

    if (!result.hits || result.hits.length === 0) {
      console.log(`\n⚠️  0 results found. nbHits: ${result.nbHits || 0}`);
      if (result.params) console.log(`   Params: ${result.params}`);
      return;
    }

    console.log(`\n📊 ${result.nbHits} job(s) found. Showing ${result.hits.length}:\n`);
    for (const [i, job] of result.hits.entries()) {
      console.log(`${i+1}. [${job.company_name}] ${job.title}`);
      console.log(`   ${(job.locations_for_search||[]).join(', ') || 'N/A'} | remote:${job.remote||'?'}`);
      console.log(`   Exp: ${job.min_experience ?? 'Any'}yr | https://www.workatastartup.com${job.search_path||''}`);
      console.log('');
    }

    if (opts.output) {
      writeFileSync(opts.output, JSON.stringify({ total: result.nbHits, jobs: result.hits }, null, 2));
      console.log(`💾 Saved to ${opts.output}`);
    }
  } catch (e) {
    console.log(`\n❌ ${e.message}`);
  }
}

function parseListingText(text) {
  const companies = [];
  const blocks = text.split(/\n(?=[A-Z][a-z]+\w*\()/);

  for (const block of blocks) {
    if (!block.trim() || block.startsWith('http')) continue;
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) continue;

    const company = { name: '', batch: '', location: '', description: '', salary: '', roles: [] };

    for (const line of lines) {
      const headerMatch = line.match(/^([A-Za-z0-9\s&.]+)\(([A-Z0-9]+)\)/);
      if (headerMatch) {
        company.name = headerMatch[1].trim();
        company.batch = headerMatch[2];
        continue;
      }
      if (line.includes(',') && !line.includes('$') && !line.includes('%') && !line.includes('\u20b9') && !line.includes('\u00a3') && !line.includes('\u20ac')) {
        const locMatch = line.match(/^[A-Za-z\s,.-]+$/);
        if (locMatch) { company.location = line; continue; }
      }
      if (line.includes('$') || line.includes('\u20b9') || line.includes('\u00a3') || line.includes('\u20ac')) {
        company.salary = line; continue;
      }
      if (line.length > 20 && !line.startsWith('View job') && !line.startsWith('See all') && !line.startsWith('Apply')) {
        company.description = line; continue;
      }
      if (line.match(/^(Founding|Senior|Staff|Software|Backend|Frontend|Full.Stack|Forward|SDE|Principal|Lead|Product)/i)) {
        company.roles.push(line);
      }
    }

    if (company.name) companies.push(company);
  }
  return companies;
}

async function cmdParse() {
  const file = opts.output || 'parsed-jobs.json';
  const input = process.argv[3];

  let text = '';
  if (input && existsSync(input)) {
    text = readFileSync(input, 'utf-8');
  } else if (input) {
    text = input;
  } else {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    text = Buffer.concat(chunks).toString('utf-8');
  }

  const companies = parseListingText(text);
  console.log(`\n📊 Parsed ${companies.length} companies:\n`);
  for (const c of companies) {
    console.log(`  ${c.name} (${c.batch || '?'}) \u2014 ${c.location || '?'}`);
    if (c.salary) console.log(`    Salary: ${c.salary}`);
    if (c.description) console.log(`    ${c.description.substring(0, 120)}...`);
    if (c.roles.length) console.log(`    Roles: ${c.roles.join(', ')}`);
    console.log('');
  }

  writeFileSync(file, JSON.stringify(companies, null, 2));
  console.log(`\u{1F4BE} Saved to ${file}`);
}

function cmdSend() {
  console.log(`
📧 Cold Outreach Pipeline

To send cold emails to YC founders, use the existing pipeline:
  - data/outreach.tsv    (outreach database)
  - send-outreach.mjs     (email dispatcher)
  - config/email.yml      (SMTP config)
  - generate-pdf.mjs      (HTML \u2192 PDF)

Workflow:
  1. node scripts/yc-fetch.mjs fetch --api-key "<key>" -n 20 -o jobs.json
  2. Edit jobs.json to add founder emails & research contacts
  3. Use the main outreach pipeline to generate CVs + send
`);
}

switch (mode) {
  case 'fetch': await cmdFetch(); break;
  case 'parse': await cmdParse(); break;
  case 'send':  cmdSend();        break;
  default:      help();           break;
}
