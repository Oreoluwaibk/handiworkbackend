import bcryptjs from "bcryptjs";

export function confirmUserPassword(user: { password?: string | null }, password?: string) {
  if (!user?.password) {
    return {
      ok: false as const,
      status: 400,
      message: "This Google account has no password yet. Use Forgot Password to set one, then try again.",
    };
  }

  if (!password) {
    return { ok: false as const, status: 400, message: "Password is required" };
  }

  if (!bcryptjs.compareSync(password, user.password)) {
    return { ok: false as const, status: 401, message: "Invalid password" };
  }

  return { ok: true as const };
}
