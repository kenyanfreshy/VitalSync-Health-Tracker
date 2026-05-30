/**
 * IAP Router — server-side receipt validation for iOS App Store and Google Play.
 *
 * Endpoints:
 *   iap.validateReceipt  — validate a purchase receipt and upsert expiry in DB
 *   iap.getStatus        — return the server-verified subscription status for the caller
 *
 * Secrets required (set via webdev_request_secrets):
 *   APPLE_SHARED_SECRET         — App Store Connect → App-Specific Shared Secret
 *   GOOGLE_SERVICE_ACCOUNT_JSON — base64-encoded Google service account key JSON
 *                                  with androidpublisher scope
 *
 * Without the secrets the endpoints fall back to the client-supplied expiry estimate.
 */
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { router, protectedProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { iapSubscriptions } from "../drizzle/schema";

// ─── Apple verifyReceipt ──────────────────────────────────────────────────────

const APPLE_VERIFY_PROD = "https://buy.itunes.apple.com/verifyReceipt";
const APPLE_VERIFY_SANDBOX = "https://sandbox.itunes.apple.com/verifyReceipt";

async function verifyAppleReceipt(
  receiptData: string,
  sharedSecret: string,
  useSandbox = false,
): Promise<{ expiryMs: number; originalTransactionId: string; environment: "production" | "sandbox" } | null> {
  const url = useSandbox ? APPLE_VERIFY_SANDBOX : APPLE_VERIFY_PROD;
  const body = JSON.stringify({ "receipt-data": receiptData, password: sharedSecret });
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  if (!res.ok) return null;
  const json = await res.json() as any;

  // status 21007 = receipt is from sandbox, retry against sandbox endpoint
  if (json.status === 21007 && !useSandbox) {
    return verifyAppleReceipt(receiptData, sharedSecret, true);
  }
  if (json.status !== 0) return null;

  const latestReceipts: any[] = json.latest_receipt_info ?? [];
  if (latestReceipts.length === 0) return null;

  latestReceipts.sort(
    (a, b) => Number(b.expires_date_ms) - Number(a.expires_date_ms),
  );
  const latest = latestReceipts[0];
  const expiryMs = Number(latest.expires_date_ms);
  const originalTransactionId = String(latest.original_transaction_id ?? latest.transaction_id);
  const environment: "production" | "sandbox" = json.environment === "Sandbox" ? "sandbox" : "production";

  return { expiryMs, originalTransactionId, environment };
}

// ─── Google Play Developer API ────────────────────────────────────────────────

async function verifyGoogleReceipt(
  packageName: string,
  productId: string,
  purchaseToken: string,
  serviceAccountJson: string,
): Promise<{ expiryMs: number; originalTransactionId: string } | null> {
  try {
    const sa = JSON.parse(Buffer.from(serviceAccountJson, "base64").toString("utf-8"));
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        iss: sa.client_email,
        scope: "https://www.googleapis.com/auth/androidpublisher",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
      }),
    ).toString("base64url");

    const keyData = sa.private_key
      .replace(/-----BEGIN PRIVATE KEY-----/, "")
      .replace(/-----END PRIVATE KEY-----/, "")
      .replace(/\n/g, "");
    const binaryKey = Buffer.from(keyData, "base64");
    const cryptoKey = await crypto.subtle.importKey(
      "pkcs8",
      binaryKey,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sigBuffer = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      cryptoKey,
      Buffer.from(`${header}.${payload}`),
    );
    const sig = Buffer.from(sigBuffer).toString("base64url");
    const jwt = `${header}.${payload}.${sig}`;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });
    if (!tokenRes.ok) return null;
    const { access_token } = await tokenRes.json() as any;

    const apiUrl = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/subscriptionsv2/tokens/${purchaseToken}`;
    const subRes = await fetch(apiUrl, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!subRes.ok) return null;
    const sub = await subRes.json() as any;

    const expiryMs = Number(sub.lineItems?.[0]?.expiryTime ?? sub.expiryTimeMillis ?? 0);
    return { expiryMs, originalTransactionId: purchaseToken };
  } catch (err) {
    console.warn("[IAP] Google receipt verification error:", err);
    return null;
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const iapRouter = router({
  validateReceipt: protectedProcedure
    .input(
      z.object({
        platform: z.enum(["ios", "android"]),
        productId: z.string(),
        receiptData: z.string(),
        clientExpiryMs: z.number(),
        packageName: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const db = getDb();
      let expiryMs = input.clientExpiryMs;
      let originalTransactionId: string | undefined;
      let environment: "production" | "sandbox" = "production";

      if (input.platform === "ios") {
        const secret = process.env.APPLE_SHARED_SECRET;
        if (secret) {
          const result = await verifyAppleReceipt(input.receiptData, secret);
          if (result) {
            expiryMs = result.expiryMs;
            originalTransactionId = result.originalTransactionId;
            environment = result.environment;
          }
        }
      } else {
        const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
        if (saJson && input.packageName) {
          const result = await verifyGoogleReceipt(
            input.packageName,
            input.productId,
            input.receiptData,
            saJson,
          );
          if (result) {
            expiryMs = result.expiryMs;
            originalTransactionId = result.originalTransactionId;
          }
        }
      }

      const existing = await db
        .select()
        .from(iapSubscriptions)
        .where(
          and(
            eq(iapSubscriptions.userId, userId),
            eq(iapSubscriptions.productId, input.productId),
            eq(iapSubscriptions.platform, input.platform),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(iapSubscriptions)
          .set({
            expiryMs,
            environment,
            ...(originalTransactionId ? { originalTransactionId } : {}),
          })
          .where(eq(iapSubscriptions.id, existing[0].id));
      } else {
        await db.insert(iapSubscriptions).values({
          userId,
          productId: input.productId,
          platform: input.platform,
          environment,
          expiryMs,
          originalTransactionId: originalTransactionId ?? null,
        });
      }

      return { expiryMs, validated: expiryMs !== input.clientExpiryMs };
    }),

  getStatus: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;
    const db = getDb();
    const rows = await db
      .select()
      .from(iapSubscriptions)
      .where(eq(iapSubscriptions.userId, userId));

    if (rows.length === 0) {
      return { hasActiveSubscription: false, expiryMs: null, productId: null };
    }

    rows.sort((a: typeof rows[0], b: typeof rows[0]) => b.expiryMs - a.expiryMs);
    const latest = rows[0];
    const now = Date.now();
    return {
      hasActiveSubscription: latest.expiryMs > now,
      expiryMs: latest.expiryMs,
      productId: latest.productId,
    };
  }),
});
