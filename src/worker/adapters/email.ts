/**
 * Email adapter — SMTP transport with dev fake fallback.
 *
 * In development, emails are logged to the console instead of being sent.
 * In production, nodemailer handles SMTP delivery with connection pooling.
 */

import nodemailer from 'nodemailer';

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  correlationId: string;
}

// Dev fake: logs the email instead of sending it.
async function sendDevEmail(payload: EmailPayload): Promise<void> {
  console.log(JSON.stringify({
    level: 'info',
    message: 'DEV: Email not sent (fake mode)',
    correlationId: payload.correlationId,
    to: payload.to,
    subject: payload.subject,
    htmlLength: payload.html.length,
  }));
}

// Production: sends via SMTP.
async function sendSmtpEmail(payload: EmailPayload): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    connectionTimeout: 10_000,
    greetingTimeout: 5_000,
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM ?? 'Goodform <notifications@goodform.local>',
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
    headers: {
      'X-Correlation-ID': payload.correlationId,
    },
  });
}

export async function sendEmail(payload: EmailPayload): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    return sendSmtpEmail(payload);
  }
  return sendDevEmail(payload);
}
