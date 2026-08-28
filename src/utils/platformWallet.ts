import User from "../schema/userSchema";
import Wallet from "../schema/walletSchema";
import { normalizeEmail } from "./authIdentity";

const PLATFORM_EMAIL =
  normalizeEmail(process.env.PLATFORM_WALLET_EMAIL) || "platform-wallet@quikwrk.system";

let cachedPlatformUserId: string | null = null;

export async function getPlatformUserId(): Promise<string> {
  if (cachedPlatformUserId) return cachedPlatformUserId;

  if (process.env.PLATFORM_USER_ID) {
    cachedPlatformUserId = process.env.PLATFORM_USER_ID;
    return cachedPlatformUserId;
  }

  let user = await User.findOne({ email: PLATFORM_EMAIL });
  if (!user) {
    user = await User.create({
      first_name: "Platform",
      last_name: "Wallet",
      email: PLATFORM_EMAIL,
      phone_number: "00000000000",
      is_vendor: false,
      is_verified: true,
      is_active: false,
      is_deleted: false,
    });
  }

  const wallet = await Wallet.findOne({ user_id: user._id });
  if (!wallet) {
    await Wallet.create({
      user_id: user._id,
      currency_code: "NGN",
      balance: 0,
      is_active: true,
    });
  }

  cachedPlatformUserId = user._id.toString();
  return cachedPlatformUserId;
}
