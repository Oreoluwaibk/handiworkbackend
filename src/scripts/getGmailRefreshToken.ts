import dotenv from "dotenv";
import http from "http";
import { URL } from "url";
import { createGmailOAuthClient, gmailAuthUrl, gmailOAuthRedirect } from "../utils/gmailApi";

dotenv.config();

async function main() {
  const redirect = gmailOAuthRedirect();
  const redirectUrl = new URL(redirect);
  const port = Number(redirectUrl.port || 5555);

  console.log("\nGmail API setup");
  console.log("1. Google Cloud Console → APIs & Services → enable Gmail API");
  console.log(`2. Add this Authorized redirect URI to your Web OAuth client:\n   ${redirect}`);
  console.log("3. Open this URL, sign in as the Gmail mailbox that should send mail:\n");
  console.log(gmailAuthUrl());
  console.log("\nWaiting for Google to redirect back...\n");

  const code = await new Promise<string>((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url || "/", `http://localhost:${port}`);
        const authCode = url.searchParams.get("code");
        if (!authCode) {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("Missing code");
          return;
        }
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("Gmail connected. You can close this tab and copy GMAIL_REFRESH_TOKEN from the terminal.");
        server.close();
        resolve(authCode);
      } catch (error) {
        reject(error);
      }
    });

    server.listen(port, "127.0.0.1");
  });

  const client = createGmailOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      "Google did not return a refresh token. Revoke access at https://myaccount.google.com/permissions then run this again."
    );
  }

  console.log("\nAdd this to Render Environment and to local .env:\n");
  console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`);
  console.log("EMAIL_PROVIDER=gmail\n");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
