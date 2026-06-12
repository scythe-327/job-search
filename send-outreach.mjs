import { readFileSync, writeFileSync, existsSync, statSync, unlinkSync } from 'fs';
import path from 'path';
import jsYaml from 'js-yaml';
const parseYaml = jsYaml.load;
import nodemailer from 'nodemailer';

const CONFIG_PATH = 'config/email.yml';
const OUTREACH_TSV = 'data/outreach.tsv';

// --- Email Verification Providers ---
const VERIFICATION_PROVIDERS = {
  hunter: {
    name: 'Hunter.io',
    url: (email, key) => `https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(email)}&api_key=${key}`,
    validStatuses: ['valid'],
    parseResult: (json) => ({
      status: json.data.status,
      score: json.data.score,
      valid: json.data.status === 'valid',
    }),
    signupUrl: 'https://hunter.io/users/sign_up',
    freeTier: '25 verifications/month',
  },
  zerobounce: {
    name: 'ZeroBounce',
    url: (email, key) => `https://api.zerobounce.net/v2/validate?api_key=${key}&email=${encodeURIComponent(email)}`,
    validStatuses: ['valid'],
    parseResult: (json) => ({
      status: json.status,
      score: null,
      valid: json.status === 'valid',
    }),
    signupUrl: 'https://www.zerobounce.net/signup/',
    freeTier: '100 verifications/month',
  },
};

// --- Safety Configuration Constants ---
const DAILY_MAX_EMAILS = 20;            // Never send more than this per batch run
const MAX_EMAILS_PER_DOMAIN = 20;       // Raised for guessed emails — many won't resolve

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) {
    console.error(`ERROR: ${CONFIG_PATH} not found.`);
    console.error(`Copy config/email.yml.example to config/email.yml and fill in your credentials.`);
    process.exit(1);
  }
  const raw = readFileSync(CONFIG_PATH, 'utf-8');
  return parseYaml(raw);
}

function createTransporter(config) {
  return nodemailer.createTransport({
    host: config.smtp_host,
    port: config.smtp_port,
    secure: config.smtp_secure,
    auth: {
      user: config.smtp_user,
      pass: config.smtp_pass,
    },
  });
}

function buildEmailBody(recruiterName, company, role, message, candidateName, linkedin, portfolio) {
  return `${recruiterName ? `Hi ${recruiterName},` : 'Hi there,'}

${message}

---
Best regards,
${candidateName}
${linkedin}
${portfolio || ''}`;
}

// Utility function to extract a clean domain name from an email address
function extractDomain(email) {
  if (!email || !email.includes('@')) return 'unknown';
  return email.split('@')[1].trim().toLowerCase();
}

// Utility function to generate a randomized delay to mimic human behavior
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

async function verifyBulkEmails(emailList, config) {
  const providerKey = config.email_verification_provider || 'hunter';
  const apiKey = config.email_verification_api_key;

  if (!apiKey) {
    console.log('⚠️  No email_verification_api_key configured. Skipping bulk verification.');
    console.log('   Get a free ZeroBounce key: https://www.zerobounce.net/signup/ (100 free/month)');
    return {};
  }

  if (providerKey !== 'zerobounce') {
    console.log(`ℹ️  Bulk verification only supported for "zerobounce" provider (current: "${providerKey}"). Falling back to individual verification.`);
    return {};
  }

  if (emailList.length === 0) return {};

  console.log(`📤 ZeroBounce SendFile: uploading ${emailList.length} emails for bulk verification...`);

  // Create temp CSV with header row
  const tmpFile = path.join('tmp', `zb-bulk-${Date.now()}.csv`);
  const csvContent = 'email_address\n' + emailList.join('\n');
  writeFileSync(tmpFile, csvContent, 'utf-8');

  const fileBuffer = readFileSync(tmpFile);
  const blob = new Blob([fileBuffer], { type: 'text/csv' });

  const formData = new FormData();
  formData.append('file', blob, 'emails.csv');
  formData.append('api_key', apiKey);
  formData.append('email_address_column', '1');
  formData.append('has_header_row', 'true');
  formData.append('remove_duplicate', 'true');

  try {
    const uploadRes = await fetch('https://bulkapi.zerobounce.net/v2/sendfile', { method: 'POST', body: formData });
    if (!uploadRes.ok) {
      console.log(`⚠️  SendFile upload failed (${uploadRes.status}). Falling back to individual verification.`);
      return {};
    }
    const uploadData = await uploadRes.json();
    if (!uploadData.success) {
      console.log(`⚠️  SendFile error: ${uploadData.error_message}`);
      return {};
    }

    const fileId = uploadData.file_id;
    console.log(`✅ File accepted — File ID: ${fileId}. Polling for results...`);

    // Poll getfile endpoint until results are ready
    const results = await pollGetFileResults(fileId, apiKey);
    console.log(`📊 Bulk verification: ${Object.keys(results).length} results — ${Object.values(results).filter(r => r.valid).length} valid, ${Object.values(results).filter(r => !r.valid).length} invalid`);
    return results;
  } catch (err) {
    console.log(`⚠️  Bulk verification failed: ${err.message}. Falling back to individual verification.`);
    return {};
  } finally {
    try { unlinkSync(tmpFile); } catch {}
  }
}

async function pollGetFileResults(fileId, apiKey) {
  const maxAttempts = 36;
  const pollIntervalMs = 5000;
  const results = {};

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetch(`https://bulkapi.zerobounce.net/v2/getfile?file_id=${encodeURIComponent(fileId)}&api_key=${encodeURIComponent(apiKey)}`);

    if (res.status === 404) {
      const elapsed = ((attempt + 1) * pollIntervalMs / 1000).toFixed(1);
      process.stdout.write(`\r⏳ Processing... ${elapsed}s`);
      await sleep(pollIntervalMs);
      continue;
    }

    if (!res.ok) {
      console.log(`\n⚠️  getfile error (${res.status}).`);
      return {};
    }

    const csvText = await res.text();
    const lines = csvText.trim().split('\n');

    if (lines.length < 2) {
      await sleep(pollIntervalMs);
      continue;
    }

    const headers = parseCSVLine(lines[0]);
    const emailIdx = headers.indexOf('email_address');
    const statusIdx = headers.indexOf('status');

    if (emailIdx === -1 || statusIdx === -1) {
      console.log('\n⚠️  Unexpected CSV format in getfile response.');
      return {};
    }

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const cols = parseCSVLine(lines[i]);
      const email = cols[emailIdx];
      const status = cols[statusIdx] || 'unknown';
      if (email) {
        results[email.toLowerCase()] = { valid: status === 'valid', status };
      }
    }
    console.log(''); // newline after progress dots
    return results;
  }

  console.log('\n⏰ Timed out waiting for bulk verification results.');
  return {};
}

async function verifyEmail(email, config) {
  const providerKey = config.email_verification_provider || 'hunter';
  const apiKey = config.email_verification_api_key;

  if (!apiKey) {
    console.log('⚠️  No email_verification_api_key configured. Skipping verification.');
    console.log(`   Get a free Hunter.io key: https://hunter.io/users/sign_up (25 free/month)`);
    return { valid: true, skipped: true };
  }

  const provider = VERIFICATION_PROVIDERS[providerKey];
  if (!provider) {
    console.log(`⚠️  Unknown verification provider "${providerKey}". Skipping verification.`);
    return { valid: true, skipped: true };
  }

  const url = provider.url(email, apiKey);
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.log(`⚠️  Verification API returned ${response.status}. Proceeding without verification.`);
      return { valid: true, skipped: true };
    }
    const json = await response.json();
    const result = provider.parseResult(json);

    if (result.valid) {
      console.log(`✅ Email verified: ${email} (${result.status})`);
    } else {
      console.log(`❌ Email invalid: ${email} (${result.status})`);
    }
    return result;
  } catch (err) {
    console.log(`⚠️  Verification request failed: ${err.message}. Proceeding without verification.`);
    return { valid: true, skipped: true };
  }
}

async function sendEmail(transporter, config, to, subject, body, attachments = []) {
  return await transporter.sendMail({
    from: `"${config.from_name}" <${config.from_email}>`,
    to,
    subject,
    text: body,
    attachments,
  });
}

async function main() {
  const cfg = loadConfig();
  const transporter = createTransporter(cfg);

  if (!existsSync(OUTREACH_TSV)) {
    console.error(`ERROR: ${OUTREACH_TSV} not found. Run your generation script first.`);
    process.exit(1);
  }

  // Read lines and parse TSV headers dynamically
  const fileContent = readFileSync(OUTREACH_TSV, 'utf-8').trim();
  if (!fileContent) {
    console.log('Outreach TSV file is empty.');
    return;
  }

  const lines = fileContent.split('\n');
  const headers = lines[0].split('\t');
  
  const statusIdx = headers.indexOf('status');
  const companyIdx = headers.indexOf('company');
  const emailIdx = headers.indexOf('recruiter_channel'); // Assuming this stores the email destination address
  const nameIdx = headers.indexOf('recruiter_name');
  const roleIdx = headers.indexOf('role');
  const msgIdx = headers.indexOf('message'); 
  const subjectIdx = headers.indexOf('subject'); 
  const resumeIdx = headers.indexOf('resume_path'); 

  // Track tracking indexes for safety counters
  let totalSentThisBatch = 0;
  const domainCounters = {};

  // --- BULK EMAIL VERIFICATION (upfront, replaces per-email API calls) ---
  const draftEmails = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cols = lines[i].split('\t');
    if (cols[statusIdx] === 'draft') draftEmails.push(cols[emailIdx]);
  }
  const verifiedResults = await verifyBulkEmails([...new Set(draftEmails)], cfg);

  // Pre-mark invalid emails in TSV before the sending loop
  if (Object.keys(verifiedResults).length > 0) {
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const cols = lines[i].split('\t');
      if (cols[statusIdx] === 'draft') {
        const result = verifiedResults[cols[emailIdx].toLowerCase()];
        if (result && !result.valid) {
          console.log(`⏭️  ${cols[emailIdx]} flagged as ${result.status}. Marking as 'invalid_email'.`);
          cols[statusIdx] = 'invalid_email';
          lines[i] = cols.join('\t');
        }
      }
    }
    writeFileSync(OUTREACH_TSV, lines.join('\n'), 'utf-8');
  }

  console.log('🔄 Initializing outreach pipeline with strict anti-spam guardrails...');

  // Loop starting at index 1 to skip TSV column headers
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    const cols = lines[i].split('\t');
    
    // Process only rows marked explicitly as 'draft'
    if (cols[statusIdx] === 'draft') {
      const emailAddress = cols[emailIdx];
      const companyName = cols[companyIdx] || 'Unknown';
      const targetDomain = extractDomain(emailAddress);

      // --- GUARDRAIL 1: Daily Volume Batch Cap ---
      if (totalSentThisBatch >= DAILY_MAX_EMAILS) {
        console.log(`\n🛑 Daily safety threshold reached (${DAILY_MAX_EMAILS} emails). Stopping execution slice to protect email reputation.`);
        break;
      }

      // --- GUARDRAIL 2: Single-Company Gateway Protection ---
      domainCounters[targetDomain] = (domainCounters[targetDomain] || 0) + 1;
      if (domainCounters[targetDomain] > MAX_EMAILS_PER_DOMAIN) {
        console.log(`⚠️ Skipping ${emailAddress} (${companyName}) - Already processed ${MAX_EMAILS_PER_DOMAIN} emails for ${targetDomain} in this run.`);
        continue;
      }

      const recruiterName = cols[nameIdx];
      const roleName = cols[roleIdx];
      const rawMessage = cols[msgIdx] ? cols[msgIdx].replace(/\\n/g, '\n') : ''; // Parse newline tokens if stored linearly
      const subjectLine = cols[subjectIdx] || `Application / Discussion - ${roleName}`;

      console.log(`\n✉️ Sending [${totalSentThisBatch + 1}/${DAILY_MAX_EMAILS}] to ${recruiterName || 'Team'} at ${companyName} (${emailAddress})...`);

      try {
        // Build the contextual message body string
        const bodyContent = buildEmailBody(
          recruiterName,
          companyName,
          roleName,
          rawMessage,
          cfg.from_name,
          cfg.candidate_linkedin || '',
          cfg.candidate_portfolio || ''
        );

        // Check for resume attachment
        const attachments = [];
        const resumePath = cols[resumeIdx];
        if (resumePath && existsSync(resumePath) && statSync(resumePath).isFile()) {
          const resumeName = resumePath.split(/[/\\]/).pop();
          attachments.push({
            filename: resumeName,
            path: resumePath,
          });
          console.log(`📎 Attaching resume: ${resumePath}`);
        }

        // --- GUARDRAIL 4: Email Verification (checked against bulk results) ---
        const cachedResult = verifiedResults[emailAddress.toLowerCase()];
        if (cachedResult && !cachedResult.valid) {
          console.log(`⏭️  Skipping ${emailAddress} — email flagged as ${cachedResult.status}.`);
          continue;
        }
        // Fallback: individual verification if email wasn't in bulk results
        if (!cachedResult && cfg.email_verification_api_key) {
          const verification = await verifyEmail(emailAddress, cfg);
          if (!verification.valid) {
            console.log(`⏭️  Skipping ${emailAddress} — email flagged as ${verification.status}. Marking as 'invalid_email'.`);
            cols[statusIdx] = 'invalid_email';
            lines[i] = cols.join('\t');
            writeFileSync(OUTREACH_TSV, lines.join('\n'), 'utf-8');
            continue;
          }
        }

        // Execute outbound SMTP transaction via Nodemailer
        await sendEmail(transporter, cfg, emailAddress, subjectLine, bodyContent, attachments);
        
        // Update the current line status explicitly inside our in-memory TSV array matrix
        cols[statusIdx] = 'sent';
        lines[i] = cols.join('\t');
        
        // Write instantly back to disk to preserve state if the script crashes on a subsequent loop
        writeFileSync(OUTREACH_TSV, lines.join('\n'), 'utf-8');
        
        totalSentThisBatch++;
        console.log(`✅ Transmission confirmed. Row updated to 'sent'.`);

        // --- GUARDRAIL 3: Human Behavioral Throttling Delay ---
        // Generates a random interval between 180,000ms (3 mins) and 360,000ms (6 mins)
        const randomDelayMs = Math.floor(Math.random() * (360000 - 180000 + 1)) + 180000;
        
        // Prevent printing a pending wait log if this was the final allowed email
        if (totalSentThisBatch < DAILY_MAX_EMAILS && i < lines.length - 1) {
          console.log(`⏳ Throttling connection wrapper. Sleeping for ${(randomDelayMs / 1000 / 60).toFixed(2)} minutes before processing next row...`);
          await sleep(randomDelayMs);
        }

      } catch (error) {
        console.error(`❌ Failed transmission to ${emailAddress}: ${error.message}`);
        cols[statusIdx] = 'failed';
        lines[i] = cols.join('\t');
        writeFileSync(OUTREACH_TSV, lines.join('\n'), 'utf-8');
      }
    }
  }

  console.log(`\n🏁 Pipeline execution finished. Successfully dispatched ${totalSentThisBatch} emails.`);
}

main().catch((err) => {
  console.error('Fatal Pipeline Crash Error:', err.message);
  process.exit(1);
});