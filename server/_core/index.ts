import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import path from "path";
import { fileURLToPath } from "url";

// ESM-safe __dirname: works in both tsx (dev) and esbuild ESM bundle (prod)
const __filename_safe = typeof __filename !== "undefined" ? __filename : fileURLToPath(import.meta.url);
const __dirname_safe = path.dirname(__filename_safe);
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { iapWebhookRouter } from "../iap-webhook";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Enable CORS for all routes - reflect the request origin to support credentials
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.header("Access-Control-Allow-Origin", origin);
    }
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization",
    );
    res.header("Access-Control-Allow-Credentials", "true");

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerOAuthRoutes(app);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  // Privacy Policy page — served as a public HTML page
  // Supports ?lang=zh for Mandarin Chinese, and auto-detects Accept-Language header
  app.get("/privacy", (req, res) => {
    const langParam = (req.query.lang as string | undefined)?.toLowerCase() ?? "";
    const acceptLang = (req.headers["accept-language"] ?? "").toLowerCase();
    const isZh =
      langParam === "zh" ||
      langParam.startsWith("zh-") ||
      (!langParam && (acceptLang.startsWith("zh") || acceptLang.includes(",zh")));
    const file = isZh ? "../privacy-policy-zh.html" : "../privacy-policy.html";
    res.sendFile(path.join(__dirname_safe, file));
  });

  // ICE Emergency Card — read-only page for first responders
  // Decodes base64-encoded vault data from the ?d= query param and renders it
  // as a mobile-optimised emergency information card.
  app.get("/ice", (_req, res) => {
    res.sendFile(path.join(__dirname_safe, "../ice-card.html"));
  });

  // Terms of Use page — served as a public HTML page
  // Supports ?lang=zh for Mandarin Chinese, and auto-detects Accept-Language header
  app.get("/terms", (req, res) => {
    const langParam = (req.query.lang as string | undefined)?.toLowerCase() ?? "";
    const acceptLang = (req.headers["accept-language"] ?? "").toLowerCase();
    const isZh =
      langParam === "zh" ||
      langParam.startsWith("zh-") ||
      (!langParam && (acceptLang.startsWith("zh") || acceptLang.includes(",zh")));
    const file = isZh ? "../terms-of-use-zh.html" : "../terms-of-use.html";
    res.sendFile(path.join(__dirname_safe, file));
  });

  // IAP webhook routes — raw Express routes (not tRPC) for App Store / Play Store callbacks
  app.use("/api/iap/webhook", iapWebhookRouter);

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`[api] server listening on port ${port}`);
  });
}

startServer().catch(console.error);
