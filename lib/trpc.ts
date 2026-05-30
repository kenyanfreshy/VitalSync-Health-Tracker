import { createTRPCReact } from "@trpc/react-query";
import { createTRPCClient as createTRPCVanillaClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@/server/routers";
import { getApiBaseUrl } from "@/constants/oauth";
import * as Auth from "@/lib/_core/auth";

/**
 * tRPC React client for type-safe API calls.
 *
 * IMPORTANT (tRPC v11): The `transformer` must be inside `httpBatchLink`,
 * NOT at the root createClient level. This ensures client and server
 * use the same serialization format (superjson).
 */
export const trpc = createTRPCReact<AppRouter>();

/**
 * Creates a vanilla (non-React) tRPC client for imperative calls outside
 * React component trees (e.g. context providers, background tasks).
 *
 * Usage:
 * ```ts
 * const client = createVanillaTRPCClient();
 * const result = await client.iap.getStatus.query();
 * ```
 */
export function createVanillaTRPCClient() {
  return createTRPCVanillaClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${getApiBaseUrl()}/api/trpc`,
        transformer: superjson,
        async headers() {
          const token = await Auth.getSessionToken();
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
        async fetch(url, options) {
          const response = await globalThis.fetch(url, {
            ...options,
            credentials: "include",
          });
          const contentType = response.headers.get("content-type") ?? "";
          if (!contentType.includes("json") && !response.ok) {
            const text = await response.text().catch(() => response.statusText);
            const body = JSON.stringify({
              error: {
                json: {
                  message: `API server unreachable or returned HTML (${response.status}): ${text.slice(0, 200)}`,
                  code: -32603,
                  data: { code: "INTERNAL_SERVER_ERROR", httpStatus: response.status },
                },
              },
            });
            return new Response(body, {
              status: response.status,
              headers: { "content-type": "application/json" },
            });
          }
          return response;
        },
      }),
    ],
  });
}

/**
 * Creates the tRPC React-Query client with proper configuration.
 * Call this once in your app's root layout.
 */
export function createTRPCClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${getApiBaseUrl()}/api/trpc`,
        // tRPC v11: transformer MUST be inside httpBatchLink, not at root
        transformer: superjson,
        async headers() {
          const token = await Auth.getSessionToken();
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
        // Custom fetch to include credentials for cookie-based auth.
        // Also guards against HTML error pages (e.g. 404/502 from a proxy) that
        // would cause a cryptic "JSON Parse error: Unexpected character: <" on native.
        async fetch(url, options) {
          const response = await globalThis.fetch(url, {
            ...options,
            credentials: "include",
          });
          const contentType = response.headers.get("content-type") ?? "";
          if (!contentType.includes("json") && !response.ok) {
            // The server returned an HTML error page — clone with a JSON body so
            // tRPC can surface a readable message instead of a parse crash.
            const text = await response.text().catch(() => response.statusText);
            const body = JSON.stringify({
              error: {
                json: {
                  message: `API server unreachable or returned HTML (${response.status}): ${text.slice(0, 200)}`,
                  code: -32603,
                  data: { code: "INTERNAL_SERVER_ERROR", httpStatus: response.status },
                },
              },
            });
            return new Response(body, {
              status: response.status,
              headers: { "content-type": "application/json" },
            });
          }
          return response;
        },
      }),
    ],
  });
}
