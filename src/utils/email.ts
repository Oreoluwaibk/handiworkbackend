import path from "path";
import dns from "dns";
import fs from "fs-extra";
import Handlebars from "handlebars";
import nodemailer, { Transporter } from "nodemailer";
import axios from "axios";
import { Resend } from "resend";
import { isNetworkError } from "./network";
import { sendViaGmailApi } from "./gmailApi";

dns.setDefaultResultOrder("ipv4first");

const compiledViews = path.join(__dirname, "..", "views");
const sourceViews = path.join(__dirname, "..", "..", "src", "views");
const viewsDir = fs.existsSync(compiledViews) ? compiledViews : sourceViews;

const TEST_FROM = "QuikWrk <beth.t@example.com>";
const PUBLIC_MAILBOX_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "icloud.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
]);

let resendClient: Resend | null = null;
let smtpTransport: Transporter | null = null;

function ipv4Lookup(
  hostname: string,
  _options: unknown,
  callback: (err: NodeJS.ErrnoException | null, address: string, family: number) => void
) {
  dns.lookup(hostname, { family: 4 }, callback);
}

function createGmailTransport(port: 465 | 587) {
  const user = process.env.SMTP_EMAIL?.trim();
  const pass = process.env.SMTP_PASSWORD?.trim().replace(/\s+/g, "");
  if (!user || !pass) {
    throw new Error("SMTP_EMAIL and SMTP_PASSWORD are required for Gmail fallback");
  }

  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port,
    secure: port === 465,
    requireTLS: port === 587,
    auth: { user, pass },
    family: 4,
    lookup: ipv4Lookup,
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
    tls: {
      minVersion: "TLSv1.2",
      servername: "smtp.gmail.com",
    },
  } as any);
}

function getResend() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }
  if (!resendClient) {
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

async function sendViaGmailSmtp(to: string, subject: string, html: string) {
  const ports: Array<465 | 587> = [587, 465];
  let lastError: any;

  for (const port of ports) {
    try {
      smtpTransport = createGmailTransport(port);
      await smtpTransport.sendMail({
        from: gmailFromAddress(),
        to,
        subject,
        html,
      });
      return;
    } catch (error: any) {
      lastError = error;
      smtpTransport = null;
      if (error.code === "EAUTH" || error.responseCode === 535) {
        throw new Error(
          "Gmail rejected SMTP_PASSWORD. Google no longer accepts the normal account password. Create a 16-character App Password at https://myaccount.google.com/apppasswords and update SMTP_PASSWORD in .env, then restart the server."
        );
      }
      if (!isNetworkError(error) && error.code !== "ESOCKET") {
        throw error;
      }
    }
  }

  throw lastError;
}

async function sendViaGmail(to: string, subject: string, html: string) {
  if (process.env.GMAIL_REFRESH_TOKEN?.trim() || process.env.RENDER) {
    await sendViaGmailApi(to, subject, html, gmailFromAddress());
    return;
  }
  await sendViaGmailSmtp(to, subject, html);
}

function extractEmail(value: string) {
  const match = value.match(/<([^>]+)>/);
  return (match ? match[1] : value).trim().toLowerCase();
}

function resendFromAddress() {
  const configured = process.env.FROM_EMAIL?.trim();
  if (!configured) return TEST_FROM;

  const email = extractEmail(configured);
  const domain = email.split("@")[1];
  if (!domain || PUBLIC_MAILBOX_DOMAINS.has(domain) || email.includes("resend.dev")) {
    return TEST_FROM;
  }

  if (configured.includes("<")) return configured;
  return `QuikWrk <${configured}>`;
}

function smtpAllowed() {
  if (process.env.DISABLE_SMTP === "true") return false;
  return Boolean(process.env.SMTP_EMAIL?.trim() && process.env.SMTP_PASSWORD?.trim());
}

function sendgridFromAddress() {
  const configured = process.env.FROM_EMAIL?.trim();
  if (configured) {
    const email = extractEmail(configured);
    if (email && !email.includes("resend.dev")) {
      return { email, name: "QuikWrk" };
    }
  }

  const smtpUser = process.env.SMTP_EMAIL?.trim();
  if (smtpUser) {
    return { email: smtpUser, name: "QuikWrk" };
  }

  throw new Error("FROM_EMAIL or SMTP_EMAIL is required for SendGrid");
}

async function sendViaSendGrid(to: string, subject: string, html: string) {
  const apiKey = process.env.SENDGRID_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("SENDGRID_API_KEY is not configured");
  }

  const from = sendgridFromAddress();
  await axios.post(
    "https://api.sendgrid.com/v3/mail/send",
    {
      personalizations: [{ to: [{ email: to }] }],
      from,
      subject,
      content: [{ type: "text/html", value: html }],
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    }
  );
}

function gmailFromAddress() {
  const user = process.env.SMTP_EMAIL?.trim();
  if (!user) {
    throw new Error("SMTP_EMAIL is not configured");
  }
  return `QuikWrk <${user}>`;
}

async function renderTemplate(fileName: string, context: Record<string, unknown>) {
  const template = await fs.readFile(path.join(viewsDir, fileName), "utf-8");
  return Handlebars.compile(template)(context);
}

async function sendViaResend(to: string, subject: string, html: string) {
  const { data, error } = await getResend().emails.send({
    from: resendFromAddress(),
    to,
    subject,
    html,
  });

  if (error) {
    throw new Error(error.message || "Failed to send email with Resend");
  }

  return data;
}

function emailProvider() {
  return (process.env.EMAIL_PROVIDER || "auto").trim().toLowerCase();
}

async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  if (!to) {
    throw new Error("Email recipient is missing");
  }

  const provider = emailProvider();
  const errors: string[] = [];

  if (provider === "gmail") {
    if (!smtpAllowed()) {
      throw new Error("EMAIL_PROVIDER=gmail requires SMTP_EMAIL and SMTP_PASSWORD");
    }
    await sendViaGmail(to, subject, html);
    console.log(`Email sent via Gmail SMTP to ${to}`);
    return;
  }

  if (provider === "sendgrid") {
    await sendViaSendGrid(to, subject, html);
    console.log(`Email sent via SendGrid to ${to}`);
    return;
  }

  if (provider === "resend") {
    const result = await sendViaResend(to, subject, html);
    console.log(`Email sent via Resend to ${to}`);
    return result;
  }

  if (process.env.RESEND_API_KEY?.trim()) {
    try {
      const result = await sendViaResend(to, subject, html);
      console.log(`Email sent via Resend to ${to}`);
      return result;
    } catch (error: any) {
      errors.push(`Resend: ${error.message}`);
      console.warn(`Resend failed (${error.message}). Trying next provider.`);
    }
  }

  if (process.env.SENDGRID_API_KEY?.trim()) {
    try {
      await sendViaSendGrid(to, subject, html);
      console.log(`Email sent via SendGrid to ${to}`);
      return;
    } catch (error: any) {
      const detail = error.response?.data?.errors?.[0]?.message || error.message;
      errors.push(`SendGrid: ${detail}`);
      console.warn(`SendGrid failed (${detail}). Falling back to Gmail SMTP.`);
    }
  }

  if (smtpAllowed()) {
    await sendViaGmail(to, subject, html);
    console.log(`Email sent via Gmail SMTP to ${to}`);
    return;
  }

  throw new Error(errors.join(" | ") || "No email provider is configured");
}

export async function sendWelcomeEmail(userEmail: string, userName: string): Promise<void> {
  const html = await renderTemplate("welcome.handlebars", { name: userName });

  try {
    await sendEmail({
      to: userEmail,
      subject: "Welcome to QuikWrk!",
      html,
    });
    console.log(`Email sent to ${userEmail}`);
  } catch (error) {
    console.error(`Failed to send email to ${userEmail}:`, error);
    throw error;
  }
}

export async function sendOtp(
  userEmail: string,
  otp: string | number,
  userName: string
): Promise<void> {
  const html = await renderTemplate("otp.handlebars", {
    name: userName,
    otp,
    appName: "QuikWrk",
  });

  try {
    await sendEmail({
      to: userEmail,
      subject: "Your One-Time Password (OTP)",
      html,
    });
    console.log(`Email sent to ${userEmail}`);
  } catch (error) {
    console.error(`Failed to send email to ${userEmail}:`, error);
    throw error;
  }
}

export const sendArtisanRequestEmail = async (data: any) => {
  const to = process.env.NOTIFICATION_EMAIL?.trim();
  if (!to) {
    throw new Error("NOTIFICATION_EMAIL is not configured");
  }

  try {
    const html = await renderTemplate("artisanRequest.handlebars", data);
    await sendEmail({
      to,
      subject: "New Artisan Request",
      html,
    });
    console.log(`Artisan request email sent to ${to}`);
  } catch (error) {
    console.error("Failed to send artisan request email:", error);
    throw error;
  }
};

const REQUEST_STATUS_COPY: Record<string, { label: string; message: string }> = {
  pending: {
    label: "Pending",
    message: "Your request is open. Matching artisans can send bids.",
  },
  assigned: {
    label: "Artisan selected",
    message: "An artisan has been selected. Please accept the bid to confirm the job.",
  },
  in_progress: {
    label: "In progress",
    message: "Work is now in progress on your artisan request.",
  },
  fulfilled: {
    label: "Fulfilled",
    message: "Your artisan request has been fulfilled.",
  },
  delivered: {
    label: "Delivered",
    message: "Your artisan request has been marked as delivered.",
  },
  cancelled: {
    label: "Cancelled",
    message: "Your artisan request has been cancelled.",
  },
};

export function getArtisanRequestStatusCopy(status?: string) {
  return (
    REQUEST_STATUS_COPY[status || ""] || {
      label: status || "Updated",
      message: "There is a new update on your artisan request.",
    }
  );
}

export async function sendArtisanRequestUpdateEmail(data: {
  name?: string;
  email?: string;
  title?: string;
  problem?: string;
  status?: string;
}) {
  if (!data.email) {
    throw new Error("Customer email is missing");
  }

  const copy = getArtisanRequestStatusCopy(data.status);

  const html = await renderTemplate("artisanRequestUpdate.handlebars", {
    name: data.name || "there",
    title: data.title || "your request",
    problem: data.problem || "",
    statusLabel: copy.label,
    statusMessage: copy.message,
  });

  await sendEmail({
    to: data.email,
    subject: `Update on your ${data.title || "artisan"} request: ${copy.label}`,
    html,
  });

  return copy;
}

