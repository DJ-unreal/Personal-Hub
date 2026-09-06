import nodemailer, { type Transporter } from "nodemailer";

/* =====================================================================
   Outbound mail — used only to send a health document to an address the
   user types, and only after an explicit server-side confirmation step
   (see the health-docs email routes). Nothing is ever sent silently.

   Configured for Gmail SMTP with an App Password by default, but any
   SMTP host works via the SMTP_* env vars.
   ===================================================================== */

export function isMailConfigured(): boolean {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

function config() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) throw new Error("Mail is not configured");
  return {
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT ?? 465),
    user,
    // Google displays App Passwords in groups of four; spaces are not
    // part of the secret.
    pass: pass.replace(/\s+/g, ""),
    from: process.env.MAIL_FROM ?? user,
  };
}

function transport(): Transporter {
  const c = config();
  return nodemailer.createTransport({
    host: c.host,
    port: c.port,
    secure: c.port === 465, // 465 = implicit TLS, 587 = STARTTLS
    auth: { user: c.user, pass: c.pass },
  });
}

/** Check host reachability + credentials WITHOUT sending anything. */
export async function verifyMail(): Promise<void> {
  await transport().verify();
}

export function mailFrom(): string {
  return config().from;
}

/** Basic sanity check — deliberately permissive, the confirmation step
    is what actually protects against sending to the wrong person. */
export function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}

/** Turn nodemailer/SMTP failures into something actionable, without
    echoing credentials or raw server chatter back to the browser. */
export function describeMailError(e: unknown): string {
  const err = e as { code?: string; responseCode?: number; message?: string };
  switch (err?.code) {
    case "EAUTH":
      return "SMTP rejected the credentials — check SMTP_USER and the App Password.";
    case "ESOCKET":
    case "ECONNECTION":
      return "Couldn't reach the mail server — check SMTP_HOST and SMTP_PORT.";
    case "ETIMEDOUT":
      return "The mail server timed out.";
    case "EENVELOPE":
      return "The mail server rejected the recipient address.";
    default:
      return err?.responseCode
        ? `Mail server error (${err.responseCode}).`
        : "Sending failed — the document was not emailed.";
  }
}

export async function sendDocument(opts: {
  to: string;
  filename: string;
  content: Buffer;
  contentType: string;
}): Promise<string> {
  const c = config();
  const info = await transport().sendMail({
    from: c.from,
    to: opts.to,
    subject: `Health record — ${opts.filename}`,
    text:
      `Attached: ${opts.filename}\n\n` +
      `Sent from your Personal Hub at your request.`,
    attachments: [
      {
        filename: opts.filename,
        content: opts.content,
        contentType: opts.contentType,
      },
    ],
  });
  return info.messageId;
}
