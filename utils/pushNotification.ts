import webpush from "web-push";
import dotenv from "dotenv";
dotenv.config();

webpush.setVapidDetails(
  "mailto:admin@yourdomain.com",
  process.env.FIREBASE_VAPID_PUBLIC_KEY!,
  process.env.FIREBASE_VAPID_PRIVATE_KEY!
);

// Function to send a push notification
export async function sendPushNotification(
  subscription: any,
  payload: { title: string; body: string; url?: string }
) {
  const notification = JSON.stringify({
    notification: {
      title: payload.title,
      body: payload.body,
      icon: "/icon.png",
      data: { url: payload.url },
    },
  });

  try {
    await webpush.sendNotification(subscription, notification);
    console.log("✅ Push notification sent successfully");
  } catch (error: any) {
    console.error("❌ Push notification failed:", error);
  }
}
