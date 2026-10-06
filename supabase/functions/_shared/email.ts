// Sending email through Resend (https://resend.com). The API key is a Supabase
// secret (RESEND_API_KEY). All emails are transactional (invoices, receipts,
// shift confirmations), which CASL allows without marketing consent.
import { env } from './supabase.ts';

export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

/** Simple, accessible email layout. `bodyHtml` must already be escaped. */
export function layout(title: string, bodyHtml: string, signature = ''): string {
  return `<!doctype html><html lang="en-CA"><body style="margin:0;background:#f6f5f0;font-family:Arial,Helvetica,sans-serif;color:#131a33">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px">
<tr><td style="background:#131a33;color:#f4c542;padding:18px 24px;font-weight:bold;font-size:18px;border-radius:12px 12px 0 0">Recovery Day Alberta</td></tr>
<tr><td style="padding:24px;font-size:16px;line-height:1.5"><h1 style="font-size:20px;margin:0 0 12px">${esc(title)}</h1>${bodyHtml}
<p style="margin-top:24px;color:#55575d;font-size:14px;white-space:pre-line">${esc(signature)}</p></td></tr>
</table></td></tr></table></body></html>`;
}

export function button(href: string, label: string): string {
  return `<p><a href="${esc(href)}" style="display:inline-block;background:#f4c542;color:#131a33;padding:12px 20px;border-radius:999px;font-weight:bold;text-decoration:none">${esc(label)}</a></p>`;
}

type Attachment = { filename: string; content: Uint8Array };

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export async function sendEmail(opts: {
  from: string; to: string | string[]; subject: string; html: string; replyTo?: string; attachments?: Attachment[];
}): Promise<{ id?: string; skipped?: boolean }> {
  const key = env('RESEND_API_KEY');
  const to = (Array.isArray(opts.to) ? opts.to : [opts.to]).filter(Boolean);
  if (!to.length) return { skipped: true };
  if (!key) { console.warn('RESEND_API_KEY not set; email skipped:', opts.subject); return { skipped: true }; }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: opts.from, to, subject: opts.subject, html: opts.html, reply_to: opts.replyTo,
      attachments: (opts.attachments ?? []).map((a) => ({ filename: a.filename, content: toBase64(a.content) })),
    }),
  });
  if (!res.ok) throw new Error(`Email failed (${res.status}): ${await res.text()}`);
  return await res.json();
}
