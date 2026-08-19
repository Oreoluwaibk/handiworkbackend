import { Expo, ExpoPushMessage } from "expo-server-sdk";

const expo = new Expo({
  accessToken: process.env.EXPO_ACCESS_TOKEN || undefined,
});

export async function sendPush(
  tokens: string[],
  title: string,
  body: string,
  data: Record<string, any> = {}
) {
  if (!tokens || tokens.length === 0) {
    console.warn("Push skipped: no Expo push tokens");
    return;
  }

  const messages: ExpoPushMessage[] = [];

  for (const token of tokens) {
    if (!Expo.isExpoPushToken(token)) {
      console.warn("Invalid Expo push token:", token);
      continue;
    }

    messages.push({
      to: token,
      sound: "default",
      title,
      body,
      data,
      priority: "high",
      channelId: "default",
    });
  }

  if (messages.length === 0) {
    console.warn("Push skipped: no valid Expo push tokens");
    return;
  }

  try {
    const chunks = expo.chunkPushNotifications(messages);

    for (const chunk of chunks) {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      for (const ticket of tickets) {
        if (ticket.status === "error") {
          console.error("Expo push ticket error:", ticket.message, ticket.details);
        }
      }
    }
  } catch (error) {
    console.error("Error sending push notification:", error);
  }
}
