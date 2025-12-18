import { Expo, ExpoPushMessage } from "expo-server-sdk";

const expo = new Expo();

export async function sendPush(
  tokens: string[],
  title: string,
  body: string,
  data: Record<string, any> = {}
) {
  if (!tokens || tokens.length === 0) return;

  const messages: ExpoPushMessage[] = [];

  for (const token of tokens) {
    if (!Expo.isExpoPushToken(token)) {
      console.warn("❌ Invalid Expo push token:", token);
      continue;
    }

    messages.push({
      to: token,
      sound: "default",
      title,
      body,
      data,
      priority: "high",
    });
  }

  if (messages.length === 0) return;

  try {
    const chunks = expo.chunkPushNotifications(messages);

    for (const chunk of chunks) {
      await expo.sendPushNotificationsAsync(chunk);
    }
  } catch (error) {
    console.error("❌ Error sending push notification:", error);
  }
}
