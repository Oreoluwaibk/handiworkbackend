import { Request, Response, Router } from "express";
import User from "../schema/userSchema";
import Wallet from "../schema/walletSchema";
import { createToken, generateOtp, resetToken, verifyToken } from "../utils/tokens";
import bcryptjs from "bcryptjs";
import { sendOtp } from "../utils/email";
import { v4 as uuidv4 } from 'uuid';
import { authentication, AuthenticatedRequest } from "../middleware/authentication";
import { applyDeviceUpdate } from "../utils/device";
import { emailMatch, isValidNigerianPhone, normalizeEmail, normalizePhone } from "../utils/authIdentity";
import { verifyGoogleIdToken, exchangeGoogleAuthCode } from "../utils/googleAuth";

function sendGoogleAppRedirect(res: Response, params: Record<string, string>) {
  const appUrl = `quikwrk://oauthredirect?${new URLSearchParams(params).toString()}`;
  const hasError = Boolean(params.error);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${hasError ? "Google sign-in failed" : "Signing in to QuikWrk"}</title>
  </head>
  <body style="font-family: sans-serif; padding: 24px; text-align: center; background: #fff; color: #111;">
    <p>${hasError ? String(params.error).replace(/[<>&]/g, "") : "Signing you in to QuikWrk..."}</p>
    <p><a href="${appUrl.replace(/"/g, "&quot;")}">Return to QuikWrk</a></p>
    <script>
      window.location.replace(${JSON.stringify(appUrl)});
    </script>
  </body>
</html>`);
}

function createSessionToken(user: any) {
  return createToken({
    first_name: user.first_name,
    last_name: user.last_name,
    email: user.email,
    phone_number: user.phone_number,
    _id: user._id.toString(),
    is_admin: Boolean(user.is_admin),
  });
}

async function ensureWallet(userId: string) {
  const existing = await Wallet.findOne({ user_id: userId });
  if (existing) return existing;

  return Wallet.create({
    user_id: userId,
    currency_code: "NGN",
    balance: 0,
    is_active: true,
  });
}

const saltRounds = 10;
const authRouter = Router();

authRouter
.post("/register", async (req: Request, res: Response) => {
  try {
    const { first_name, last_name, email, password, phone_number, referred_by, device } = req.body;
    const normalizedEmail = normalizeEmail(email);
    const normalizedPhone = normalizePhone(phone_number);

    if (!first_name || !last_name || !normalizedEmail || !password || !normalizedPhone) {
      return res.status(400).json({
        message: "first_name, last_name, email, phone_number and password are required",
      });
    }

    if (!isValidNigerianPhone(normalizedPhone)) {
      return res.status(400).json({ message: "Enter a valid Nigerian phone number" });
    }

    const isUser = await User.findOne(emailMatch(normalizedEmail));
    if (isUser) {
      return res.status(400).json({ message: "User already exists, kindly login to continue" });
    }

    const existingPhone = await User.findOne({ phone_number: normalizedPhone });
    if (existingPhone) {
      return res.status(400).json({ message: "An account with this phone number already exists" });
    }

    let validReferrer: any | null = null;
    if (referred_by) {
      validReferrer = await User.findOne({
        referral_code: referred_by,
        is_vendor: true,
        "subscription.active": true,
      });

      if (!validReferrer) {
        return res.status(400).json({ message: "Invalid referral code" });
      }
    }

    const salt = bcryptjs.genSaltSync(saltRounds);
    const hashedPassword = bcryptjs.hashSync(password, salt);
    const chat_id = uuidv4();

    const user = await User.create({
      first_name: String(first_name).trim(),
      last_name: String(last_name).trim(),
      email: normalizedEmail,
      phone_number: normalizedPhone,
      password: hashedPassword,
      picture: null,
      chat_id,
      referral_code: null,
      referred_by: validReferrer ? validReferrer.referral_code : null,
      last_login: new Date(),
      subscription: {
        plan_name: null,
        amount: 0,
        active: false,
        start_date: null,
        renewed_at: null,
      },
    });
    applyDeviceUpdate(user, device);
    await user.save();

    await ensureWallet(user._id.toString());

    const token = createSessionToken(user);

    res.status(200).json({
      token,
      message: "Registration successful",
      user,
    });
  } catch (error: any) {
    console.error("Registration error:", error);
    res.status(500).json({
      success: false,
      message: `Unable to create user: ${error.message}`,
    });
  }
})
.post("/login", async (req: Request, res: Response) => {
  const { email, password, expoPushToken, device } = req.body;

  try {
    if (!normalizeEmail(email) || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user = await User.findOne(emailMatch(email));

    if (!user) {
      res.status(404).json({
        success: false,
        message: "User does not exist, kindly register to continue!",
      });
      return;
    }

    if (user.is_deleted) {
      res.status(404).json({
        success: false,
        message: "User has been deactivated, kindly reactivate your account or contact admin!",
      });
      return;
    }

    if (!user.password) {
      res.status(401).json({
        success: false,
        message: "This account uses Google sign-in. Continue with Google to log in.",
      });
      return;
    }

    const isPasswordCorrect = bcryptjs.compareSync(password, user.password);

    if (!isPasswordCorrect) {
      res.status(401).json({ success: false, message: "Incorrect password!" });
      return;
    }

    user.last_login = new Date();
    applyDeviceUpdate(user, device);
    await user.save();

    if (expoPushToken) {
      await User.findByIdAndUpdate(user._id, {
        $addToSet: { expo_push_tokens: expoPushToken },
      });
    }

    const token = createSessionToken(user);

    res.status(200).json({
      success: true,
      message: "login successful",
      user,
      token,
    });
  } catch (error: any) {
    console.log("err", error);
    res.status(500).json({ message: `Cannot login - ${error.message || error}` });
  }
})
.post("/google", async (req: Request, res: Response) => {
  const { idToken, expoPushToken, device } = req.body;
  console.log("[GoogleAuth] POST /auth/google", {
    hasIdToken: Boolean(idToken),
    hasDevice: Boolean(device),
  });

  try {
    const profile = await verifyGoogleIdToken(idToken);
    const normalizedEmail = normalizeEmail(profile.email);

    let user = await User.findOne({
      $or: [{ google_id: profile.google_id }, emailMatch(normalizedEmail)],
    });

    if (user?.is_deleted) {
      return res.status(404).json({
        success: false,
        message: "User has been deactivated, kindly reactivate your account or contact admin!",
      });
    }

    if (!user) {
      console.log("[GoogleAuth] creating user from Google profile", { email: normalizedEmail });
      user = await User.create({
        first_name: profile.first_name,
        last_name: profile.last_name,
        email: normalizedEmail,
        picture: profile.picture,
        google_id: profile.google_id,
        chat_id: uuidv4(),
        referral_code: null,
        referred_by: null,
        last_login: new Date(),
        is_verified: true,
        subscription: {
          plan_name: null,
          amount: 0,
          active: false,
          start_date: null,
          renewed_at: null,
        },
      });
      await ensureWallet(user._id.toString());
    } else {
      console.log("[GoogleAuth] existing user found", {
        email: user.email,
        hasGoogleId: Boolean(user.google_id),
      });
      if (!user.google_id) user.google_id = profile.google_id;
      if (!user.picture && profile.picture) user.picture = profile.picture;
      if (!user.first_name && profile.first_name) user.first_name = profile.first_name;
      if (!user.last_name && profile.last_name) user.last_name = profile.last_name;
      user.is_verified = true;
      user.last_login = new Date();
    }

    applyDeviceUpdate(user, device);
    await user.save();

    if (expoPushToken) {
      await User.findByIdAndUpdate(user._id, {
        $addToSet: { expo_push_tokens: expoPushToken },
      });
    }

    console.log("[GoogleAuth] POST /auth/google success", { email: user.email });
    return res.status(200).json({
      success: true,
      message: "Google sign-in successful",
      user,
      token: createSessionToken(user),
    });
  } catch (error: any) {
    console.error("[GoogleAuth] POST /auth/google failed", {
      message: error.message,
      status: error.status,
    });
    return res.status(error.status || 401).json({
      success: false,
      message: error.message || "Unable to sign in with Google",
    });
  }
})
.get("/google/callback", async (req: Request, res: Response) => {
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const error = typeof req.query.error === "string" ? req.query.error : "";
  const errorDescription =
    typeof req.query.error_description === "string" ? req.query.error_description : "";

  console.log("[GoogleAuth] GET /auth/google/callback", {
    hasCode: Boolean(code),
    hasState: Boolean(state),
    error: error || null,
    errorDescription: errorDescription || null,
    queryKeys: Object.keys(req.query || {}),
  });

  if (error) {
    console.log("[GoogleAuth] Google returned error to callback", { error, errorDescription });
    return sendGoogleAppRedirect(res, {
      error: errorDescription || error,
      state,
    });
  }

  if (!code) {
    console.log("[GoogleAuth] callback missing authorization code");
    return sendGoogleAppRedirect(res, {
      error: "Google sign-in did not return an authorization code",
      state,
    });
  }

  try {
    const idToken = await exchangeGoogleAuthCode(code);
    console.log("[GoogleAuth] callback exchanging code succeeded, redirecting to app");
    return sendGoogleAppRedirect(res, { id_token: idToken, state });
  } catch (err: any) {
    console.error("[GoogleAuth] callback exchange failed", {
      message: err.message,
      status: err.status,
      response: err.response?.data,
    });
    return sendGoogleAppRedirect(res, {
      error: err.message || "Unable to complete Google sign-in",
      state,
    });
  }
})
.post("/forgot-password", async (req: Request, res: Response) => {
  const { email } = req.body;
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    return res.status(400).json({ message: "Email is required" });
  }

  try {
    const user = await User.findOne(emailMatch(normalizedEmail));

    if (!user) {
      return res.status(404).json({ message: "User does not exist!" });
    }

    if (user.is_deleted) {
      return res.status(403).json({
        message: "This account has been deactivated, kindly contact admin",
      });
    }

    const token = resetToken({ first_name: user.first_name, email: user.email });
    const otp = generateOtp();

    user.resetToken = token;
    user.otp = otp;
    await user.save();

    await sendOtp(user.email, otp, user.first_name);
    return res.status(200).json({
      success: true,
      message: "OTP sent successfully, kindly check mail or spam",
      token,
      email: user.email,
    });
  } catch (err) {
    console.log("err", err);
    return res.status(400).json({
      message: "Unable to reset your password, try again or contact admin!",
    });
  }
})
.post("/reset-password/:token", async (req: Request, res: Response) => {
  const { token } = req.params;
  const { email, otp, password } = req.body;

  if (!email || !otp || !password) {
    return res.status(400).json({ message: "email, otp and password are required" });
  }

  try {
    const { valid } = verifyToken(token);

    if (!valid) {
      return res.status(401).json({ message: "Reset link has expired, request a new OTP" });
    }

    const user = await User.findOne(emailMatch(email));

    if (!user) {
      return res.status(404).json({ message: "User does not exist!" });
    }

    const submittedOtp = Number(String(otp).trim());
    if (!user.otp || Number.isNaN(submittedOtp) || submittedOtp !== user.otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    if (token !== user.resetToken) {
      return res.status(400).json({ message: "Reset token is not valid, request a new OTP" });
    }

    user.password = bcryptjs.hashSync(password, saltRounds);
    user.resetToken = "";
    user.otp = null;
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Password reset successful",
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message || "Unable to reset password" });
  }
})
.post("/push-token", authentication, async (req: AuthenticatedRequest, res: Response) => {
  const { expoPushToken, device } = req.body;

  if (!expoPushToken) {
    return res.status(400).json({ message: "expoPushToken is required" });
  }

  const user = await User.findById(req.user._id);
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  user.expo_push_tokens = Array.from(new Set([...(user.expo_push_tokens || []), expoPushToken]));
  applyDeviceUpdate(user, device);
  await user.save();

  return res.status(200).json({
    success: true,
    message: "Push token saved",
  });
});

export default authRouter;
