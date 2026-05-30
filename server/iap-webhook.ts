/**
 * IAP Webhook Handler — Express router for Apple App Store Server Notifications v2
 * and Google Play Real-Time Developer Notifications (Pub/Sub).
 *
 * Register in server/_core/index.ts:
 *   import { iapWebhookRouter } from "../iap-webhook";
 *   app.use("/api/iap/webhook", iapWebhookRouter);
 *
 * Configure in the stores:
 *   Apple: App Store Connect → Your App → App Information → App Store Server Notifications
 *          URL: https://your-domain.com/api/iap/webhook/apple
 *   Google: Google Play Console → Monetize → Subscriptions → Real-time developer notifications
 *           Pub/Sub push subscription pointing to:
 *           https://your-domain.com/api/iap/webhook/google
 */
import { Router, type Request, type Response } from "express";
import { eq, and } from "drizzle-orm";
import { getDb } from "./db";
import { iapSubscriptions } from "../drizzle/schema";

export const iapWebhookRouter = Router();

// ─── Apple App Store Server Notifications v2 ─────────────────────────────────

function decodeJWSPayload(jws: string): any | null {
  try {
    const parts = jws.split(".");
    if (parts.length !== 3) return null;
    const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(Buffer.from(padded, "base64").toString("utf-8"));
  } catch {
    return null;
  }
}

function appleNotificationAction(
  notificationType: string,
): "activate" | "expire" | "refund" | "ignore" {
  switch (notificationType) {
    case "SUBSCRIBED":
    case "DID_RENEW":
    case "DID_RECOVER":
    case "OFFER_REDEEMED":
      return "activate";
    case "EXPIRED":
    case "REVOKE":
      return "expire";
    case "REFUND":
    case "REFUND_REVERSED":
      return "refund";
    default:
      return "ignore";
  }
}

iapWebhookRouter.post("/apple", async (req: Request, res: Response) => {
  res.status(200).json({ ok: true });
  try {
    const { signedPayload } = req.body ?? {};
    if (typeof signedPayload !== "string") return;
    const envelope = decodeJWSPayload(signedPayload);
    if (!envelope) return;
    const { notificationType, data } = envelope;
    const action = appleNotificationAction(notificationType);
    if (action === "ignore") return;
    const transactionInfo = data?.signedTransactionInfo
      ? decodeJWSPayload(data.signedTransactionInfo)
      : null;
    if (!transactionInfo) return;
    const originalTransactionId: string = transactionInfo.originalTransactionId ?? "";
    const expiresDateMs: number = Number(transactionInfo.expiresDate ?? 0);
    const environment: "production" | "sandbox" =
      (data?.environment ?? "Production") === "Sandbox" ? "sandbox" : "production";
    if (!originalTransactionId) return;
    const db = getDb();
    const existing = await db
      .select()
      .from(iapSubscriptions)
      .where(eq(iapSubscriptions.originalTransactionId, originalTransactionId))
      .limit(1);
    if (existing.length === 0) return;
    const newExpiryMs =
      action === "expire" || action === "refund"
        ? Date.now() - 1000
        : expiresDateMs > 0
          ? expiresDateMs
          : existing[0].expiryMs;
    await db
      .update(iapSubscriptions)
      .set({ expiryMs: newExpiryMs, environment })
      .where(eq(iapSubscriptions.id, existing[0].id));
    console.log(`[IAP/Apple] ${notificationType} → expiryMs=${newExpiryMs}`);
  } catch (err) {
    console.warn("[IAP/Apple] Webhook processing error:", err);
  }
});

// ─── Google Play Real-Time Developer Notifications ────────────────────────────

const GOOGLE_ACTION: Record<number, "activate" | "expire" | "ignore"> = {
  1: "activate",  // SUBSCRIPTION_RECOVERED
  2: "activate",  // SUBSCRIPTION_RENEWED
  3: "expire",    // SUBSCRIPTION_CANCELED
  4: "activate",  // SUBSCRIPTION_PURCHASED
  5: "activate",  // SUBSCRIPTION_ON_HOLD
  6: "ignore",    // SUBSCRIPTION_IN_GRACE_PERIOD
  7: "ignore",    // SUBSCRIPTION_RESTARTED
  8: "ignore",    // SUBSCRIPTION_PRICE_CHANGE_CONFIRMED
  9: "ignore",    // SUBSCRIPTION_DEFERRED
  10: "ignore",   // SUBSCRIPTION_PAUSED
  11: "ignore",   // SUBSCRIPTION_PAUSE_SCHEDULE_CHANGED
  12: "expire",   // SUBSCRIPTION_REVOKED
  13: "expire",   // SUBSCRIPTION_EXPIRED
};

iapWebhookRouter.post("/google", async (req: Request, res: Response) => {
  res.status(200).json({ ok: true });
  try {
    const message = req.body?.message;
    if (!message?.data) return;
    const decoded = Buffer.from(message.data, "base64").toString("utf-8");
    const notification = JSON.parse(decoded);
    const subNotification = notification?.subscriptionNotification;
    if (!subNotification) return;
    const { notificationType, purchaseToken } = subNotification;
    const action = GOOGLE_ACTION[notificationType as number] ?? "ignore";
    if (action === "ignore") return;
    const db = getDb();
    const existing = await db
      .select()
      .from(iapSubscriptions)
      .where(
        and(
          eq(iapSubscriptions.originalTransactionId, purchaseToken),
          eq(iapSubscriptions.platform, "android"),
        ),
      )
      .limit(1);
    if (existing.length === 0) return;
    const newExpiryMs =
      action === "expire"
        ? Date.now() - 1000
        : Date.now() + 30 * 24 * 60 * 60 * 1000; // fallback: +30 days
    await db
      .update(iapSubscriptions)
      .set({ expiryMs: newExpiryMs })
      .where(eq(iapSubscriptions.id, existing[0].id));
    console.log(`[IAP/Google] type=${notificationType} → expiryMs=${newExpiryMs}`);
  } catch (err) {
    console.warn("[IAP/Google] Webhook processing error:", err);
  }
});
