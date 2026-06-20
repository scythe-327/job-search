import express from 'express';
import { readFileSync, existsSync } from 'fs';
import { load } from 'js-yaml';
import { createTransport } from 'nodemailer';

const PORT = process.env.PORT || 8000;
const app = express();
app.use(express.json({ limit: '1mb' }));

function getConfig() {
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    return {
      smtp_host: 'smtp.gmail.com',
      smtp_port: 587,
      smtp_secure: false,
      smtp_user: process.env.SMTP_USER,
      smtp_pass: process.env.SMTP_PASS,
      from_name: process.env.FROM_NAME || 'Rohan P H',
      from_email: process.env.SMTP_USER,
      candidate_linkedin: process.env.CANDIDATE_LINKEDIN || '',
      candidate_portfolio: process.env.CANDIDATE_PORTFOLIO || '',
    };
  }
  if (existsSync('config/email.yml')) {
    return load(readFileSync('config/email.yml', 'utf-8'));
  }
  throw new Error('No SMTP config. Set SMTP_USER/SMTP_PASS env vars or create config/email.yml');
}

app.get('/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

app.post('/send-email', async (req, res) => {
  try {
    const { to, subject, text, html } = req.body || {};
    if (!to || !subject) return res.status(400).json({ error: '"to" and "subject" required' });

    const cfg = getConfig();
    const transporter = createTransport({
      host: cfg.smtp_host, port: cfg.smtp_port, secure: cfg.smtp_secure,
      auth: { user: cfg.smtp_user, pass: cfg.smtp_pass },
    });

    await transporter.sendMail({
      from: `"${cfg.from_name}" <${cfg.from_email}>`,
      to, subject, text: text || '', html: html || text || '',
    });

    res.json({ success: true, to, subject });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/send-outreach', async (req, res) => {
  try {
    const { email, subject, body } = req.body || {};
    if (!email || !subject) return res.status(400).json({ error: '"email" and "subject" required' });

    const cfg = getConfig();
    const transporter = createTransport({
      host: cfg.smtp_host, port: cfg.smtp_port, secure: cfg.smtp_secure,
      auth: { user: cfg.smtp_user, pass: cfg.smtp_pass },
    });

    await transporter.sendMail({
      from: `"${cfg.from_name}" <${cfg.from_email}>`,
      to: email, subject, text: body || '',
    });

    res.json({ success: true, to: email });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => console.log(`Email service on port ${PORT}`));
