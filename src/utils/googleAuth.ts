import { OAuth2Client } from "google-auth-library";

const googleClient = new OAuth2Client();

export type GoogleProfile = {
  google_id: string;
  email: string;
  first_name: string;
  last_name: string;
  picture: string | null;
};

function allowedAudiences() {
  return String(process.env.GOOGLE_CLIENT_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export async function exchangeGoogleAuthCode(code?: string) {
  const clientId = allowedAudiences()[0];
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_OAUTH_REDIRECT_URI ||
    "https://handiworkbackend.onrender.com/api/auth/google/callback";

  if (!code) {
    throw Object.assign(new Error("Google authorization code is required"), { status: 400 });
  }

  if (!clientId || !clientSecret) {
    throw Object.assign(new Error("GOOGLE_CLIENT_SECRET is not configured"), { status: 500 });
  }

  const client = new OAuth2Client(clientId, clientSecret, redirectUri);
  const { tokens } = await client.getToken(code);

  if (!tokens.id_token) {
    throw Object.assign(new Error("Google did not return an ID token"), { status: 401 });
  }

  return tokens.id_token;
}

export async function verifyGoogleIdToken(idToken?: string): Promise<GoogleProfile> {
  if (!idToken) {
    throw Object.assign(new Error("Google ID token is required"), { status: 400 });
  }

  const audiences = allowedAudiences();
  if (!audiences.length) {
    throw Object.assign(new Error("GOOGLE_CLIENT_IDS is not configured"), { status: 500 });
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: audiences,
    });

    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) {
      throw Object.assign(new Error("Google token is missing account details"), { status: 401 });
    }

    if (payload.email_verified === false) {
      throw Object.assign(new Error("Google account email is not verified"), { status: 401 });
    }

    const emailPrefix = payload.email.split("@")[0] || "User";

    return {
      google_id: payload.sub,
      email: payload.email,
      first_name: payload.given_name || emailPrefix,
      last_name: payload.family_name || "",
      picture: payload.picture || null,
    };
  } catch (error: any) {
    if (error?.status) throw error;
    throw Object.assign(new Error("Google sign-in token is invalid or expired"), { status: 401 });
  }
}
