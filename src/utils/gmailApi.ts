import { OAuth2Client } from "google-auth-library";
import axios from "axios";

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.send";

function googleWebClientId() {
  return String(process.env.GOOGLE_CLIENT_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)[0];
}

export function gmailOAuthRedirect() {
  return process.env.GMAIL_OAUTH_REDIRECT || "http://localhost:5555/oauth2callback";
}

export function createGmailOAuthClient() {
  const clientId = googleWebClientId();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_IDS and GOOGLE_CLIENT_SECRET are required for Gmail API");
  }
  return new OAuth2Client(clientId, clientSecret, gmailOAuthRedirect());
}

export function gmailAuthUrl() {
  return createGmailOAuthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [GMAIL_SCOPE],
  });
}

function encodeSubject(subject: string) {
  return `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
}

function toRawMessage({
  from,
  to,
  subject,
  html,
}: {
  from: string;
  to: string;
  subject: string;
  html: string;
}) {
  const message = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeSubject(subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=UTF-8",
    "",
    html,
  ].join("\r\n");

  return Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export async function sendViaGmailApi(to: string, subject: string, html: string, from: string) {
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN?.trim();
  if (!refreshToken) {
    throw new Error(
      "Gmail SMTP is blocked on Render. Set GMAIL_REFRESH_TOKEN to send through the Gmail API. Run `yarn gmail-token` locally to create the token."
    );
  }

  const client = createGmailOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });
  const accessTokenResponse = await client.getAccessToken();
  const accessToken = accessTokenResponse?.token;
  if (!accessToken) {
    throw new Error("Unable to refresh Gmail API access token. Recreate GMAIL_REFRESH_TOKEN with yarn gmail-token.");
  }

  await axios.post(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      raw: toRawMessage({ from, to, subject, html }),
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    }
  );
}
