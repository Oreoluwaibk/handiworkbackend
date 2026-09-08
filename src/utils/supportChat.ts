import { v4 as uuidv4 } from "uuid";
import User from "../schema/userSchema";
import { normalizeEmail } from "./authIdentity";

const SUPPORT_EMAIL =
  normalizeEmail(process.env.SUPPORT_CHAT_EMAIL) || "support@quikwrk.system";

let cachedSupportChatId: string | null = null;

export async function getSupportChatUser() {
  if (cachedSupportChatId) {
    const existing = await User.findOne({ chat_id: cachedSupportChatId });
    if (existing?.chat_id) return existing;
    cachedSupportChatId = null;
  }

  const preferredChatId = process.env.SUPPORT_CHAT_ID?.trim() || null;

  let user = preferredChatId
    ? await User.findOne({ chat_id: preferredChatId })
    : null;

  if (!user) {
    user = await User.findOne({ email: SUPPORT_EMAIL });
  }

  if (!user) {
    user = await User.create({
      first_name: "QuikWrk",
      last_name: "Support",
      email: SUPPORT_EMAIL,
      phone_number: "00000000001",
      chat_id: preferredChatId || uuidv4(),
      is_vendor: false,
      is_verified: true,
      is_active: false,
      is_deleted: false,
      is_admin: false,
    });
  } else {
    let dirty = false;
    if (!user.chat_id) {
      user.chat_id = preferredChatId || uuidv4();
      dirty = true;
    }
    if (user.first_name !== "QuikWrk") {
      user.first_name = "QuikWrk";
      dirty = true;
    }
    if (user.last_name !== "Support") {
      user.last_name = "Support";
      dirty = true;
    }
    if (dirty) await user.save();
  }

  cachedSupportChatId = user.chat_id!;
  return user;
}

export async function getSupportChatId(): Promise<string> {
  const user = await getSupportChatUser();
  return user.chat_id as string;
}
