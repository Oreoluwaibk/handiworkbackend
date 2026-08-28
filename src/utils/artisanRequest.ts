import User from "../schema/userSchema";

export async function findMatchingArtisans(skillId: string, area: string) {
  if (!skillId || !area) return [];

  return User.find({
    is_vendor: true,
    is_deleted: { $ne: true },
    area,
    $or: [
      { primary_skill: skillId },
      { skill: skillId },
      { skill: { $in: [skillId] } },
    ],
  }).select("_id first_name last_name picture expo_push_tokens");
}

export function ownsArtisanRequest(request: any, user: any): boolean {
  return (
    request.user_id === user._id.toString() ||
    String(request.email || "").toLowerCase() === String(user.email || "").toLowerCase()
  );
}
