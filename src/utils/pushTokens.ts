import User from "../schema/userSchema";

/**
 * Bind an Expo push token to one user and remove it from every other account.
 * Same physical device must not keep delivering pushes for a previously logged-in user.
 */
export async function claimExpoPushToken(userId: string, expoPushToken: string) {
  if (!userId || !expoPushToken) return;

  await User.updateMany(
    {
      _id: { $ne: userId },
      expo_push_tokens: expoPushToken,
    },
    {
      $pull: { expo_push_tokens: expoPushToken },
    }
  );

  await User.findByIdAndUpdate(userId, {
    $addToSet: { expo_push_tokens: expoPushToken },
  });
}

export async function releaseExpoPushToken(userId: string, expoPushToken: string) {
  if (!userId || !expoPushToken) return;

  await User.findByIdAndUpdate(userId, {
    $pull: { expo_push_tokens: expoPushToken },
  });
}
