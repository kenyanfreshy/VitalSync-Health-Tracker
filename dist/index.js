// server/_core/index.ts
import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import path2 from "path";
import { fileURLToPath } from "url";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";

// server/db.ts
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";

// drizzle/schema.ts
import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";
var users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
});

// server/_core/env.ts
var ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? ""
};

// server/db.ts
var _db = null;
async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}
async function upsertUser(user) {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  try {
    const values = {
      openId: user.openId
    };
    const updateSet = {};
    const textFields = ["name", "email", "loginMethod"];
    const assignNullable = (field) => {
      const value = user[field];
      if (value === void 0) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== void 0) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== void 0) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) {
      values.lastSignedIn = /* @__PURE__ */ new Date();
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = /* @__PURE__ */ new Date();
    }
    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return void 0;
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}

// server/_core/cookies.ts
var LOCAL_HOSTS = /* @__PURE__ */ new Set(["localhost", "127.0.0.1", "::1"]);
function isIpAddress(host) {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  return host.includes(":");
}
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getParentDomain(hostname) {
  if (LOCAL_HOSTS.has(hostname) || isIpAddress(hostname)) {
    return void 0;
  }
  const parts = hostname.split(".");
  if (parts.length < 3) {
    return void 0;
  }
  return "." + parts.slice(-2).join(".");
}
function getSessionCookieOptions(req) {
  const hostname = req.hostname;
  const domain = getParentDomain(hostname);
  return {
    domain,
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req)
  };
}

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
var isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
      );
    }
  }
  decodeState(state) {
    const redirectUri = atob(state);
    return redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(EXCHANGE_TOKEN_PATH, payload);
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(GET_USER_INFO_PATH, {
      accessToken: token.accessToken
    });
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(platforms.filter((p) => typeof p === "string"));
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || ""
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString(openId) || !isNonEmptyString(appId) || !isNonEmptyString(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId,
        name
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    let token;
    if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
      token = authHeader.slice("Bearer ".length).trim();
    }
    const cookies = this.parseCookies(req.headers.cookie);
    const sessionCookie = token || cookies.get(COOKIE_NAME);
    const session = await this.verifySession(sessionCookie);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionCookie ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var sdk = new SDKServer();

// server/_core/oauth.ts
function getQueryParam(req, key) {
  const value = req.query[key];
  return typeof value === "string" ? value : void 0;
}
async function syncUser(userInfo) {
  if (!userInfo.openId) {
    throw new Error("openId missing from user info");
  }
  const lastSignedIn = /* @__PURE__ */ new Date();
  await upsertUser({
    openId: userInfo.openId,
    name: userInfo.name || null,
    email: userInfo.email ?? null,
    loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
    lastSignedIn
  });
  const saved = await getUserByOpenId(userInfo.openId);
  return saved ?? {
    openId: userInfo.openId,
    name: userInfo.name,
    email: userInfo.email,
    loginMethod: userInfo.loginMethod ?? null,
    lastSignedIn
  };
}
function buildUserResponse(user) {
  return {
    id: user?.id ?? null,
    openId: user?.openId ?? null,
    name: user?.name ?? null,
    email: user?.email ?? null,
    loginMethod: user?.loginMethod ?? null,
    lastSignedIn: (user?.lastSignedIn ?? /* @__PURE__ */ new Date()).toISOString()
  };
}
function registerOAuthRoutes(app) {
  app.get("/api/oauth/callback", async (req, res) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      await syncUser(userInfo);
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      const frontendUrl = process.env.EXPO_WEB_PREVIEW_URL || process.env.EXPO_PACKAGER_PROXY_URL || "http://localhost:8081";
      res.redirect(302, frontendUrl);
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
  app.get("/api/oauth/mobile", async (req, res) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      const user = await syncUser(userInfo);
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.json({
        app_session_id: sessionToken,
        user: buildUserResponse(user)
      });
    } catch (error) {
      console.error("[OAuth] Mobile exchange failed", error);
      res.status(500).json({ error: "OAuth mobile exchange failed" });
    }
  });
  app.post("/api/auth/logout", (req, res) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    res.json({ success: true });
  });
  app.get("/api/auth/me", async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req);
      res.json({ user: buildUserResponse(user) });
    } catch (error) {
      console.error("[Auth] /api/auth/me failed:", error);
      res.status(401).json({ error: "Not authenticated", user: null });
    }
  });
  app.post("/api/auth/session", async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req);
      const authHeader = req.headers.authorization || req.headers.Authorization;
      if (typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
        res.status(400).json({ error: "Bearer token required" });
        return;
      }
      const token = authHeader.slice("Bearer ".length).trim();
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.json({ success: true, user: buildUserResponse(user) });
    } catch (error) {
      console.error("[Auth] /api/auth/session failed:", error);
      res.status(401).json({ error: "Invalid token" });
    }
  });
}

// server/routers.ts
import { z as z4 } from "zod";

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString2 = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL("webdevtoken.v1.WebDevService/SendNotification", normalizedBase).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString2(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString2(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/_core/llm.ts
var ensureArray = (value) => Array.isArray(value) ? value : [value];
var normalizeContentPart = (part) => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }
  if (part.type === "text") {
    return part;
  }
  if (part.type === "image_url") {
    return part;
  }
  if (part.type === "file_url") {
    return part;
  }
  throw new Error("Unsupported message content part");
};
var normalizeMessage = (message) => {
  const { role, name, tool_call_id } = message;
  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content).map((part) => typeof part === "string" ? part : JSON.stringify(part)).join("\n");
    return {
      role,
      name,
      tool_call_id,
      content
    };
  }
  const contentParts = ensureArray(message.content).map(normalizeContentPart);
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text
    };
  }
  return {
    role,
    name,
    content: contentParts
  };
};
var normalizeToolChoice = (toolChoice, tools) => {
  if (!toolChoice) return void 0;
  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }
  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error("tool_choice 'required' was provided but no tools were configured");
    }
    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }
    return {
      type: "function",
      function: { name: tools[0].function.name }
    };
  }
  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name }
    };
  }
  return toolChoice;
};
var resolveApiUrl = () => ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0 ? `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions` : "https://forge.manus.im/v1/chat/completions";
var assertApiKey = () => {
  if (!ENV.forgeApiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
};
var normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema
}) => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (explicitFormat.type === "json_schema" && !explicitFormat.json_schema?.schema) {
      throw new Error("responseFormat json_schema requires a defined schema object");
    }
    return explicitFormat;
  }
  const schema = outputSchema || output_schema;
  if (!schema) return void 0;
  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }
  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...typeof schema.strict === "boolean" ? { strict: schema.strict } : {}
    }
  };
};
async function invokeLLM(params) {
  assertApiKey();
  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format
  } = params;
  const payload = {
    model: "gemini-2.5-flash",
    messages: messages.map(normalizeMessage)
  };
  if (tools && tools.length > 0) {
    payload.tools = tools;
  }
  const normalizedToolChoice = normalizeToolChoice(toolChoice || tool_choice, tools);
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }
  payload.max_tokens = 32768;
  payload.thinking = {
    budget_tokens: 128
  };
  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema
  });
  if (normalizedResponseFormat) {
    payload.response_format = normalizedResponseFormat;
  }
  const response = await fetch(resolveApiUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ENV.forgeApiKey}`
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM invoke failed: ${response.status} ${response.statusText} \u2013 ${errorText}`);
  }
  return await response.json();
}

// server/storage.ts
function getStorageConfig() {
  const baseUrl = ENV.forgeApiUrl;
  const apiKey = ENV.forgeApiKey;
  if (!baseUrl || !apiKey) {
    throw new Error(
      "Storage proxy credentials missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY"
    );
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
}
function buildUploadUrl(baseUrl, relKey) {
  const url = new URL("v1/storage/upload", ensureTrailingSlash(baseUrl));
  url.searchParams.set("path", normalizeKey(relKey));
  return url;
}
function ensureTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}
function normalizeKey(relKey) {
  return relKey.replace(/^\/+/, "");
}
function toFormData(data, contentType, fileName) {
  const blob = typeof data === "string" ? new Blob([data], { type: contentType }) : new Blob([data], { type: contentType });
  const form = new FormData();
  form.append("file", blob, fileName || "file");
  return form;
}
function buildAuthHeaders(apiKey) {
  return { Authorization: `Bearer ${apiKey}` };
}
async function storagePut(relKey, data, contentType = "application/octet-stream") {
  const { baseUrl, apiKey } = getStorageConfig();
  const key = normalizeKey(relKey);
  const uploadUrl = buildUploadUrl(baseUrl, key);
  const formData = toFormData(data, contentType, key.split("/").pop() ?? key);
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: buildAuthHeaders(apiKey),
    body: formData
  });
  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(
      `Storage upload failed (${response.status} ${response.statusText}): ${message}`
    );
  }
  const url = (await response.json()).url;
  return { key, url };
}

// server/_core/imageGeneration.ts
async function generateImage(options) {
  if (!ENV.forgeApiUrl) {
    throw new Error("BUILT_IN_FORGE_API_URL is not configured");
  }
  if (!ENV.forgeApiKey) {
    throw new Error("BUILT_IN_FORGE_API_KEY is not configured");
  }
  const baseUrl = ENV.forgeApiUrl.endsWith("/") ? ENV.forgeApiUrl : `${ENV.forgeApiUrl}/`;
  const fullUrl = new URL("images.v1.ImageService/GenerateImage", baseUrl).toString();
  const response = await fetch(fullUrl, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "connect-protocol-version": "1",
      authorization: `Bearer ${ENV.forgeApiKey}`
    },
    body: JSON.stringify({
      prompt: options.prompt,
      original_images: options.originalImages || []
    })
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Image generation request failed (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
    );
  }
  const result = await response.json();
  const base64Data = result.image.b64Json;
  const buffer = Buffer.from(base64Data, "base64");
  const { url } = await storagePut(`generated/${Date.now()}.png`, buffer, result.image.mimeType);
  return {
    url
  };
}

// server/_core/voiceTranscription.ts
async function transcribeAudio(options) {
  try {
    if (!ENV.forgeApiUrl) {
      return {
        error: "Voice transcription service is not configured",
        code: "SERVICE_ERROR",
        details: "BUILT_IN_FORGE_API_URL is not set"
      };
    }
    if (!ENV.forgeApiKey) {
      return {
        error: "Voice transcription service authentication is missing",
        code: "SERVICE_ERROR",
        details: "BUILT_IN_FORGE_API_KEY is not set"
      };
    }
    let audioBuffer;
    let mimeType;
    try {
      const response2 = await fetch(options.audioUrl);
      if (!response2.ok) {
        return {
          error: "Failed to download audio file",
          code: "INVALID_FORMAT",
          details: `HTTP ${response2.status}: ${response2.statusText}`
        };
      }
      audioBuffer = Buffer.from(await response2.arrayBuffer());
      mimeType = response2.headers.get("content-type") || "audio/mpeg";
      const sizeMB = audioBuffer.length / (1024 * 1024);
      if (sizeMB > 16) {
        return {
          error: "Audio file exceeds maximum size limit",
          code: "FILE_TOO_LARGE",
          details: `File size is ${sizeMB.toFixed(2)}MB, maximum allowed is 16MB`
        };
      }
    } catch (error) {
      return {
        error: "Failed to fetch audio file",
        code: "SERVICE_ERROR",
        details: error instanceof Error ? error.message : "Unknown error"
      };
    }
    const formData = new FormData();
    const filename = `audio.${getFileExtension(mimeType)}`;
    const audioBlob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
    formData.append("file", audioBlob, filename);
    formData.append("model", "whisper-1");
    formData.append("response_format", "verbose_json");
    const prompt = options.prompt || (options.language ? `Transcribe the user's voice to text, the user's working language is ${getLanguageName(options.language)}` : "Transcribe the user's voice to text");
    formData.append("prompt", prompt);
    const baseUrl = ENV.forgeApiUrl.endsWith("/") ? ENV.forgeApiUrl : `${ENV.forgeApiUrl}/`;
    const fullUrl = new URL("v1/audio/transcriptions", baseUrl).toString();
    const response = await fetch(fullUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "Accept-Encoding": "identity"
      },
      body: formData
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return {
        error: "Transcription service request failed",
        code: "TRANSCRIPTION_FAILED",
        details: `${response.status} ${response.statusText}${errorText ? `: ${errorText}` : ""}`
      };
    }
    const whisperResponse = await response.json();
    if (!whisperResponse.text || typeof whisperResponse.text !== "string") {
      return {
        error: "Invalid transcription response",
        code: "SERVICE_ERROR",
        details: "Transcription service returned an invalid response format"
      };
    }
    return whisperResponse;
  } catch (error) {
    return {
      error: "Voice transcription failed",
      code: "SERVICE_ERROR",
      details: error instanceof Error ? error.message : "An unexpected error occurred"
    };
  }
}
function getFileExtension(mimeType) {
  const mimeToExt = {
    "audio/webm": "webm",
    "audio/mp3": "mp3",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/wave": "wav",
    "audio/ogg": "ogg",
    "audio/m4a": "m4a",
    "audio/mp4": "m4a"
  };
  return mimeToExt[mimeType] || "audio";
}
function getLanguageName(langCode) {
  const langMap = {
    en: "English",
    es: "Spanish",
    fr: "French",
    de: "German",
    it: "Italian",
    pt: "Portuguese",
    ru: "Russian",
    ja: "Japanese",
    ko: "Korean",
    zh: "Chinese",
    ar: "Arabic",
    hi: "Hindi",
    nl: "Dutch",
    pl: "Polish",
    tr: "Turkish",
    sv: "Swedish",
    da: "Danish",
    no: "Norwegian",
    fi: "Finnish"
  };
  return langMap[langCode] || langCode;
}

// server/lab-router.ts
import { z as z2 } from "zod";
var LabValueSchema = z2.record(z2.string(), z2.number().nullable());
var SodiumRecordSchema = z2.object({
  id: z2.string(),
  timestamp: z2.string(),
  sodiumMg: z2.number().optional(),
  potassiumMg: z2.number().optional(),
  carbsG: z2.number().optional(),
  sugarG: z2.number().optional(),
  fatG: z2.number().optional(),
  proteinG: z2.number().optional(),
  glycemicLoad: z2.number().optional(),
  fiberG: z2.number().optional(),
  calories: z2.number().optional()
});
var LabResultSchema = z2.object({
  id: z2.string(),
  timestamp: z2.string(),
  panel: z2.enum(["CMP", "CBC", "MG", "PHOS", "LIPID", "A1C"]),
  values: LabValueSchema,
  source: z2.enum(["manual", "ocr"]),
  labName: z2.string().optional()
});
var OCR_SYSTEM_PROMPT = `You are a clinical laboratory data extraction assistant.
The user will send you an image of a printed or electronic lab report.
Your task is to extract all numeric lab values from the image and return them as structured JSON.

Rules:
- Only extract values that are clearly visible and numeric.
- Map each value to its standard analyte key from this list:
  CMP: glucose, bun, creatinine, egfr, sodium, potassium, chloride, co2, calcium, totalProtein, albumin, totalBilirubin, alt, ast
  CBC: wbc, rbc, hemoglobin, hematocrit, mcv, mch, mchc, rdw, platelets, neutrophils
  Single: magnesium, phosphorus, a1c
  Lipid: totalCholesterol, ldl, hdl, triglycerides, nonHdl
- If a value is flagged H (high) or L (low) in the report, still include the numeric value.
- If a value is not present or illegible, omit it entirely (do not guess).
- Return ONLY valid JSON in this exact format, no markdown, no explanation:
{
  "panel": "CMP" | "CBC" | "MG" | "PHOS" | "LIPID" | "A1C",
  "labName": "string or null",
  "collectionDate": "ISO 8601 date string or null",
  "values": {
    "glucose": 98,
    "sodium": 140,
    ...
  }
}`;
var CORRELATION_SYSTEM_PROMPT = `You are a clinical nutrition-lab correlation analyst.
You will receive:
1. A set of abnormal lab values with their reference ranges
2. A summary of the patient's dietary intake over the last 24 hours

Your task is to generate concise, evidence-based clinical insights explaining how the dietary intake may have contributed to each abnormal lab value.

Rules:
- Only comment on abnormal values (outside reference range).
- Be specific: cite the nutrient, the intake amount, and the mechanism.
- Use plain clinical language (no jargon beyond standard medical terms).
- Assign a severity: "info" (borderline), "warning" (moderately abnormal), or "critical" (significantly abnormal).
- Return ONLY valid JSON array, no markdown, no explanation:
[
  {
    "analyte": "potassium",
    "analyteLabel": "Potassium",
    "labValue": 5.2,
    "unit": "mEq/L",
    "status": "high",
    "nutrient": "Dietary Potassium",
    "intake24h": 5200,
    "intakeUnit": "mg",
    "threshold": 4700,
    "direction": "high",
    "insight": "Your 24h dietary potassium was 5,200mg (threshold 4,700mg). High potassium intake can contribute to hyperkalemia, especially with impaired renal function.",
    "severity": "warning"
  }
]`;
var labRouter = router({
  /**
   * Parse a lab report image via OCR (vision LLM).
   * Input: base64-encoded JPEG or PNG of the lab report.
   * Output: structured panel + values.
   */
  parseOcr: publicProcedure.input(
    z2.object({
      imageBase64: z2.string().min(100),
      mimeType: z2.enum(["image/jpeg", "image/png", "image/webp"]).default("image/jpeg")
    })
  ).mutation(async ({ input }) => {
    const result = await invokeLLM({ messages: [
      { role: "system", content: OCR_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url: `data:${input.mimeType};base64,${input.imageBase64}`
            }
          },
          {
            type: "text",
            text: "Extract all lab values from this lab report image and return them as JSON."
          }
        ]
      }
    ], maxTokens: 1024 });
    const raw = result.choices[0]?.message?.content ?? "";
    const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error(`Lab OCR: LLM returned invalid JSON \u2014 ${cleaned.slice(0, 200)}`);
    }
    const values = {};
    for (const [k, v] of Object.entries(parsed.values ?? {})) {
      if (typeof v === "number" && isFinite(v)) {
        values[k] = v;
      }
    }
    return {
      panel: parsed.panel ?? "CMP",
      labName: parsed.labName ?? null,
      collectionDate: parsed.collectionDate ?? null,
      values,
      ocrRaw: raw
    };
  }),
  /**
   * Generate Dynamic Lab Correlation insights.
   * Cross-references abnormal lab values against 24h dietary intake.
   */
  correlate: publicProcedure.input(
    z2.object({
      labResult: LabResultSchema,
      sodiumRecords24h: z2.array(SodiumRecordSchema)
    })
  ).mutation(async ({ input }) => {
    const { labResult, sodiumRecords24h } = input;
    const totals = {};
    const nutrientFields = ["sodiumMg", "potassiumMg", "carbsG", "sugarG", "fatG", "proteinG", "glycemicLoad", "fiberG", "calories"];
    for (const record of sodiumRecords24h) {
      for (const field of nutrientFields) {
        const val = record[field];
        if (typeof val === "number") {
          totals[field] = (totals[field] ?? 0) + val;
        }
      }
    }
    const REFERENCE_RANGES_SUMMARY = {
      glucose: { low: 70, high: 99, unit: "mg/dL", label: "Glucose" },
      bun: { low: 7, high: 20, unit: "mg/dL", label: "BUN" },
      creatinine: { low: 0.6, high: 1.2, unit: "mg/dL", label: "Creatinine" },
      egfr: { low: 60, high: 120, unit: "mL/min/1.73m\xB2", label: "eGFR" },
      sodium: { low: 136, high: 145, unit: "mEq/L", label: "Sodium" },
      potassium: { low: 3.5, high: 5, unit: "mEq/L", label: "Potassium" },
      chloride: { low: 98, high: 106, unit: "mEq/L", label: "Chloride" },
      co2: { low: 22, high: 29, unit: "mEq/L", label: "CO\u2082" },
      calcium: { low: 8.5, high: 10.2, unit: "mg/dL", label: "Calcium" },
      totalProtein: { low: 6.3, high: 8.2, unit: "g/dL", label: "Total Protein" },
      albumin: { low: 3.5, high: 5, unit: "g/dL", label: "Albumin" },
      totalBilirubin: { low: 0.1, high: 1.2, unit: "mg/dL", label: "Total Bilirubin" },
      alt: { low: 7, high: 56, unit: "U/L", label: "ALT" },
      ast: { low: 10, high: 40, unit: "U/L", label: "AST" },
      wbc: { low: 4.5, high: 11, unit: "\xD710\xB3/\u03BCL", label: "WBC" },
      rbc: { low: 4.5, high: 5.9, unit: "\xD710\u2076/\u03BCL", label: "RBC" },
      hemoglobin: { low: 13.5, high: 17.5, unit: "g/dL", label: "Hemoglobin" },
      hematocrit: { low: 41, high: 53, unit: "%", label: "Hematocrit" },
      mcv: { low: 80, high: 100, unit: "fL", label: "MCV" },
      mch: { low: 27, high: 33, unit: "pg", label: "MCH" },
      mchc: { low: 32, high: 36, unit: "g/dL", label: "MCHC" },
      rdw: { low: 11.5, high: 14.5, unit: "%", label: "RDW" },
      platelets: { low: 150, high: 400, unit: "\xD710\xB3/\u03BCL", label: "Platelets" },
      neutrophils: { low: 50, high: 70, unit: "%", label: "Neutrophils" },
      magnesium: { low: 1.7, high: 2.2, unit: "mg/dL", label: "Magnesium" },
      phosphorus: { low: 2.5, high: 4.5, unit: "mg/dL", label: "Phosphorus" },
      totalCholesterol: { low: 0, high: 200, unit: "mg/dL", label: "Total Cholesterol" },
      ldl: { low: 0, high: 100, unit: "mg/dL", label: "LDL Cholesterol" },
      hdl: { low: 40, high: 999, unit: "mg/dL", label: "HDL Cholesterol" },
      triglycerides: { low: 0, high: 150, unit: "mg/dL", label: "Triglycerides" },
      nonHdl: { low: 0, high: 130, unit: "mg/dL", label: "Non-HDL Cholesterol" },
      a1c: { low: 0, high: 5.6, unit: "%", label: "Hemoglobin A1C" }
    };
    const abnormal = [];
    for (const [analyte, value] of Object.entries(labResult.values)) {
      if (typeof value !== "number") continue;
      const ref = REFERENCE_RANGES_SUMMARY[analyte];
      if (!ref) continue;
      if (value < ref.low) abnormal.push({ analyte, label: ref.label, value, unit: ref.unit, status: "low" });
      else if (value > ref.high) abnormal.push({ analyte, label: ref.label, value, unit: ref.unit, status: "high" });
    }
    if (abnormal.length === 0) {
      return { insights: [] };
    }
    const userMessage = `
Abnormal lab values:
${abnormal.map((a) => `- ${a.label} (${a.analyte}): ${a.value} ${a.unit} [${a.status.toUpperCase()}]`).join("\n")}

24-hour dietary intake summary:
- Sodium: ${totals.sodiumMg?.toFixed(0) ?? "N/A"} mg
- Potassium: ${totals.potassiumMg?.toFixed(0) ?? "N/A"} mg
- Carbohydrates: ${totals.carbsG?.toFixed(1) ?? "N/A"} g
- Sugar: ${totals.sugarG?.toFixed(1) ?? "N/A"} g
- Fat: ${totals.fatG?.toFixed(1) ?? "N/A"} g
- Protein: ${totals.proteinG?.toFixed(1) ?? "N/A"} g
- Glycemic Load: ${totals.glycemicLoad?.toFixed(0) ?? "N/A"}
- Calories: ${totals.calories?.toFixed(0) ?? "N/A"} kcal

Generate correlation insights for each abnormal value where a dietary link exists.
`;
    const corrResult = await invokeLLM({ messages: [
      { role: "system", content: CORRELATION_SYSTEM_PROMPT },
      { role: "user", content: userMessage }
    ], maxTokens: 2048 });
    const raw = corrResult.choices[0]?.message?.content ?? "";
    const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    let insights;
    try {
      insights = JSON.parse(cleaned);
      if (!Array.isArray(insights)) insights = [];
    } catch {
      insights = [];
    }
    return { insights };
  })
});

// server/medication-router.ts
import { z as z3 } from "zod";
async function fetchFdaInteractions(drugName) {
  try {
    const encoded = encodeURIComponent(drugName.toLowerCase());
    const url = `https://api.fda.gov/drug/label.json?search=drug_interactions:${encoded}&limit=3`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8e3) });
    if (!res.ok) return [];
    const json = await res.json();
    const results = json.results ?? [];
    const interactions = [];
    for (const r of results) {
      const raw = (r.drug_interactions ?? []).join(" ");
      const majorMatch = raw.match(/(?:contraindicated|avoid|do not use)\s+with\s+([A-Za-z\s,]+)/gi);
      const moderateMatch = raw.match(/(?:caution|monitor|reduce dose)\s+with\s+([A-Za-z\s,]+)/gi);
      if (majorMatch) {
        for (const m of majorMatch.slice(0, 2)) {
          interactions.push({
            drug: m.replace(/^.*with\s+/i, "").split(/[,;]/)[0].trim().slice(0, 60),
            severity: "major",
            description: m.slice(0, 120)
          });
        }
      }
      if (moderateMatch) {
        for (const m of moderateMatch.slice(0, 2)) {
          interactions.push({
            drug: m.replace(/^.*with\s+/i, "").split(/[,;]/)[0].trim().slice(0, 60),
            severity: "moderate",
            description: m.slice(0, 120)
          });
        }
      }
    }
    return interactions.slice(0, 5);
  } catch {
    return [];
  }
}
var ROUTE_EMOJI = {
  oral: "\u{1F48A}",
  sublingual: "\u{1F535}",
  subq: "\u{1F489}",
  subcutaneous: "\u{1F489}",
  im: "\u{1FA7A}",
  intramuscular: "\u{1FA7A}",
  iv: "\u{1FA78}",
  intravenous: "\u{1FA78}",
  inhaled: "\u{1F32C}\uFE0F",
  inhalation: "\u{1F32C}\uFE0F",
  topical: "\u{1FA79}",
  transdermal: "\u{1FA79}",
  ophthalmic: "\u{1F441}\uFE0F",
  otic: "\u{1F442}",
  nasal: "\u{1F443}",
  rectal: "\u{1F351}",
  vaginal: "\u{1F534}"
};
function routeEmoji(route) {
  const key = route.toLowerCase().trim();
  return ROUTE_EMOJI[key] ?? "\u{1F48A}";
}
var medicationRouter = router({
  /**
   * Drug name autocomplete + auto-populate.
   * Triggered after 3+ characters. Returns up to 8 drug suggestions,
   * each with: name, genericName, indication, safeDosage, routes (with emoji).
   */
  searchDrugs: publicProcedure.input(z3.object({ query: z3.string().min(3).max(80) })).mutation(async ({ input }) => {
    const systemPrompt = [
      "You are a clinical pharmacist database. Given a partial drug name query, return matching medications.",
      "Return a JSON object with exactly this shape:",
      '{ "drugs": [ { "name": "string (brand name)", "genericName": "string", "indication": "string (primary condition treated, max 60 chars)", "safeDosage": "string (typical adult dose range, max 80 chars)", "routes": ["string"] } ] }',
      "Return up to 8 drugs that match or start with the query.",
      "routes must be one or more of: oral, sublingual, subq, im, iv, inhaled, topical, ophthalmic, otic, nasal, rectal, transdermal.",
      'If the query does not match any real drug, return { "drugs": [] }.',
      "Return ONLY valid JSON, no markdown."
    ].join("\n");
    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Find drugs matching: ${input.query}` }
    ];
    const response = await invokeLLM({
      messages,
      response_format: { type: "json_object" }
    });
    const raw = String(response.choices[0].message.content ?? "{}");
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { drugs: [] };
    }
    return {
      drugs: (parsed.drugs ?? []).slice(0, 8).map((d) => ({
        name: (d.name ?? "").slice(0, 100),
        genericName: (d.genericName ?? "").slice(0, 100),
        indication: (d.indication ?? "").slice(0, 80),
        safeDosage: (d.safeDosage ?? "").slice(0, 100),
        routes: (d.routes ?? ["oral"]).map((r) => ({
          label: r,
          emoji: routeEmoji(r)
        }))
      }))
    };
  }),
  /**
   * Returns Smart-generated side effects for a given medication name.
   * Groups by frequency: common | uncommon | rare.
   */
  getSideEffects: publicProcedure.input(z3.object({ medicationName: z3.string().min(1).max(120) })).mutation(async ({ input }) => {
    const systemPrompt = [
      "You are a clinical pharmacist. The user wants to know the side effects of a medication.",
      "Return a JSON object with exactly this shape:",
      '{ "sideEffects": [ { "name": "string", "frequency": "common"|"uncommon"|"rare", "description": "string (max 80 chars)" } ] }',
      "Include 3-5 common, 2-3 uncommon, and 1-2 rare side effects.",
      "Use plain, patient-friendly language. Do not include marketing language.",
      "Always include the disclaimer field:",
      '{ "disclaimer": "This information is Smart-generated and for educational purposes only. Always follow your physician and pharmacist instructions." }',
      "Return ONLY valid JSON, no markdown."
    ].join("\n");
    const messages = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `What are the side effects of ${input.medicationName}?`
      }
    ];
    const response = await invokeLLM({
      messages,
      response_format: { type: "json_object" }
    });
    const raw = String(response.choices[0].message.content ?? "{}");
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("LLM returned invalid JSON");
    }
    return {
      sideEffects: (parsed.sideEffects ?? []).map((s) => ({
        name: (s.name ?? "").slice(0, 80),
        frequency: ["common", "uncommon", "rare"].includes(s.frequency) ? s.frequency : "uncommon",
        description: (s.description ?? "").slice(0, 120)
      })),
      disclaimer: parsed.disclaimer ?? "This information is Smart-generated and for educational purposes only. Always follow your physician and pharmacist instructions."
    };
  }),
  /**
   * Returns drug interactions for a list of active medications.
   * Combines FDA openFDA label data with Smart-generated interactions.
   */
  getInteractions: publicProcedure.input(
    z3.object({
      medications: z3.array(
        z3.object({ id: z3.string(), name: z3.string().min(1).max(120) })
      ).min(1).max(20)
    })
  ).mutation(async ({ input }) => {
    const names = input.medications.map((m) => m.name);
    const fdaResults = [];
    for (const name of names) {
      const hits = await fetchFdaInteractions(name);
      for (const h of hits) {
        fdaResults.push({ ...h, source: "fda" });
      }
    }
    const systemPrompt = [
      "You are a clinical pharmacist checking for drug-drug interactions.",
      "The patient is taking the following medications: " + names.join(", ") + ".",
      "Return a JSON object with exactly this shape:",
      '{ "interactions": [ { "drug1": "string", "drug2": "string", "severity": "major"|"moderate"|"minor", "description": "string (max 120 chars)", "source": "ai" } ] }',
      "Only include clinically significant interactions (major or moderate).",
      'If there are no significant interactions, return { "interactions": [] }.',
      "Return ONLY valid JSON, no markdown."
    ].join("\n");
    const messages = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Check for drug interactions between: ${names.join(", ")}`
      }
    ];
    const response = await invokeLLM({
      messages,
      response_format: { type: "json_object" }
    });
    const raw = String(response.choices[0].message.content ?? "{}");
    let aiParsed;
    try {
      aiParsed = JSON.parse(raw);
    } catch {
      aiParsed = { interactions: [] };
    }
    const aiInteractions = (aiParsed.interactions ?? []).map((i) => ({
      drug: `${i.drug1} + ${i.drug2}`.slice(0, 80),
      severity: ["major", "moderate", "minor"].includes(i.severity) ? i.severity : "moderate",
      description: (i.description ?? "").slice(0, 120),
      source: "ai"
    }));
    return {
      interactions: [
        ...fdaResults.map((f) => ({
          drug: f.drug,
          severity: ["major", "moderate", "minor"].includes(f.severity) ? f.severity : "moderate",
          description: f.description,
          source: "fda"
        })),
        ...aiInteractions
      ],
      disclaimer: "Drug interaction data is sourced from the FDA label database and Smart analysis. Always consult your physician or pharmacist before making any medication changes."
    };
  }),
  /**
   * Transcribes a voice recording of a medication description and extracts all form fields.
   * Uses Apple Speech / Whisper transcription, then LLM parsing.
   * Returns same shape as scribePhoto (name, dose, form, frequency, etc.) plus { transcript }.
   */
  scribeVoice: publicProcedure.input(z3.object({
    audioBase64: z3.string(),
    mimeType: z3.enum(["audio/m4a", "audio/wav", "audio/webm", "audio/mpeg", "audio/mp4"]).default("audio/m4a")
  })).mutation(async ({ input }) => {
    const base64Data = input.audioBase64.replace(/^data:[^;]+;base64,/, "");
    const audioBuffer = Buffer.from(base64Data, "base64");
    const ext = input.mimeType.split("/")[1] ?? "m4a";
    const suffix = Math.random().toString(36).slice(2, 8);
    const fileKey = `medication-voice/${Date.now()}-${suffix}.${ext}`;
    const { url: audioUrl } = await storagePut(fileKey, audioBuffer, input.mimeType);
    const transcriptionResult = await transcribeAudio({
      audioUrl,
      prompt: "Medication name, dose, frequency, form, prescriber, pharmacy, indication"
    });
    if ("error" in transcriptionResult) throw new Error(transcriptionResult.error);
    const transcript = transcriptionResult.text;
    const systemPrompt = [
      "You are a clinical pharmacist Smart assistant. A patient has verbally described a medication they take.",
      "Extract every medication detail from their statement. Return a JSON object with EXACTLY these fields (use null for any field not mentioned):",
      "- name: brand or trade name of the medication (string or null)",
      "- genericName: generic/INN drug name if mentioned (string or null)",
      "- dose: dosage strength with units, e.g. '10 mg', '500 mg' (string or null)",
      "- form: one of: tablet, capsule, liquid, injection, patch, inhaler, drops, other (string or null)",
      "- frequency: one of: daily, twice_daily, three_times_daily, four_times_daily, weekly, as_needed, custom. Infer from phrases like 'once a day'=daily, 'twice a day'=twice_daily. (string or null)",
      "- scheduleTimes: array of HH:MM strings inferred from dosing instructions, e.g. ['08:00','20:00'] (array or null)",
      "- route: one of: oral, sublingual, subq, im, iv, inhaled, topical, ophthalmic, otic, nasal, rectal, transdermal (string or null)",
      "- indication: condition this medication treats (string or null)",
      "- prescriber: prescribing physician name if mentioned (string or null)",
      "- pharmacyName: pharmacy name if mentioned (string or null)",
      "- pharmacyPhone: pharmacy phone number if mentioned (string or null)",
      "- quantity: number of pills/doses if mentioned (integer or null)",
      "- refillAt: refill threshold (integer, default 7 if quantity is known, else null)",
      "- notes: any additional instructions or notes mentioned (string or null)",
      "- confidence: overall extraction confidence from 0.0 to 1.0 (number)",
      "- fieldsFound: array of field names that were successfully extracted (array of strings)",
      "Return ONLY valid JSON, no markdown."
    ].join("\n");
    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Patient said: "${transcript}"` }
    ];
    const response = await invokeLLM({
      messages,
      response_format: { type: "json_object" }
    });
    const raw = String(response.choices[0].message.content ?? "{}");
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { confidence: 0, fieldsFound: [] };
    }
    const VALID_FORMS = ["tablet", "capsule", "liquid", "injection", "patch", "inhaler", "drops", "other"];
    const VALID_FREQS = ["daily", "twice_daily", "three_times_daily", "four_times_daily", "weekly", "as_needed", "custom"];
    const VALID_ROUTES = ["oral", "sublingual", "subq", "im", "iv", "inhaled", "topical", "ophthalmic", "otic", "nasal", "rectal", "transdermal"];
    return {
      transcript,
      name: parsed.name ?? null,
      genericName: parsed.genericName ?? null,
      dose: parsed.dose ?? null,
      form: VALID_FORMS.includes(parsed.form ?? "") ? parsed.form : null,
      frequency: VALID_FREQS.includes(parsed.frequency ?? "") ? parsed.frequency : null,
      scheduleTimes: Array.isArray(parsed.scheduleTimes) ? parsed.scheduleTimes.slice(0, 6) : null,
      route: VALID_ROUTES.includes(parsed.route ?? "") ? parsed.route : null,
      indication: parsed.indication ?? null,
      prescriber: parsed.prescriber ?? null,
      pharmacyName: parsed.pharmacyName ?? null,
      pharmacyPhone: parsed.pharmacyPhone ?? null,
      quantity: typeof parsed.quantity === "number" ? Math.round(parsed.quantity) : null,
      refillAt: typeof parsed.refillAt === "number" ? Math.round(parsed.refillAt) : null,
      notes: parsed.notes ?? null,
      confidence: Math.min(1, Math.max(0, parsed.confidence ?? 0.5)),
      fieldsFound: Array.isArray(parsed.fieldsFound) ? parsed.fieldsFound : [],
      disclaimer: "Smart Scribe-extracted medication data requires verification. Always confirm with your prescription label and pharmacist before saving."
    };
  }),
  scribePhoto: publicProcedure.input(z3.object({
    imageBase64: z3.string(),
    mimeType: z3.enum(["image/jpeg", "image/png", "image/webp"]).default("image/jpeg")
  })).mutation(async ({ input }) => {
    const base64Data = input.imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const imageBuffer = Buffer.from(base64Data, "base64");
    const suffix = Math.random().toString(36).slice(2, 8);
    const fileKey = `medication-scribe/${Date.now()}-${suffix}.jpg`;
    const { url: imageUrl } = await storagePut(fileKey, imageBuffer, input.mimeType);
    const systemPrompt = [
      "You are a clinical pharmacist Smart assistant. Analyse the provided image of a pill bottle, medication box, or prescription label.",
      "Extract every medication detail visible. Return a JSON object with EXACTLY these fields (use null for any field you cannot determine):",
      "- name: brand or trade name of the medication (string or null). Examples: 'Lisinopril', 'Metformin', 'Atorvastatin'",
      "- genericName: generic/INN drug name if different from brand (string or null)",
      "- dose: dosage strength with units, e.g. '10 mg', '500 mg/5 mL'. Parse from patterns like 'Lisinopril 10 MG tablet' (string or null)",
      "- form: one of: tablet, capsule, liquid, injection, patch, inhaler, drops, other. Parse from 'tablet', 'capsule', 'solution' etc. (string or null)",
      "- frequency: one of: daily, twice_daily, three_times_daily, four_times_daily, weekly, as_needed, custom. Parse from 'Take 1 tablet by mouth daily', 'Take one tablet twice daily', 'Take at bedtime', 'Use as directed' (string or null)",
      "- scheduleTimes: array of HH:MM strings inferred from dosing instructions, e.g. ['08:00','20:00']. 'Take at bedtime' \u2192 ['21:00'], 'twice daily' \u2192 ['08:00','20:00'] (array or null)",
      "- route: one of: oral, sublingual, subq, im, iv, inhaled, topical, ophthalmic, otic, nasal, rectal, transdermal. Parse from 'by mouth', 'oral', 'topical' etc. (string or null)",
      "- indication: condition this medication treats (string or null)",
      "- prescriber: prescribing physician name if visible, e.g. 'Dr. Smith' \u2192 'Smith' (string or null)",
      "- pharmacyName: pharmacy name if visible, e.g. 'CVS Pharmacy', 'Walgreens' (string or null)",
      "- pharmacyPhone: pharmacy phone number if visible (string or null)",
      "- quantity: number of pills/doses. Parse from patterns like 'Qty 30', 'Qty: 90' (integer or null)",
      "- refillAt: refill threshold (integer, default 7 if quantity is known, else null)",
      "- rxNumber: prescription Rx number. Parse from patterns like 'Rx #1234567', 'Rx: 1234567', 'RX1234567' \u2014 return digits only (string or null)",
      "- startDate: fill date or start date in YYYY-MM-DD format if visible on label (string or null)",
      "- refillsRemaining: number of refills remaining. Parse from 'Refills 2', 'Refills: 0', 'No refills' \u2192 0 (integer or null)",
      "- notes: any other instructions visible on the label, e.g. 'Take with food', 'Avoid grapefruit' (string or null)",
      "- confidence: overall extraction confidence from 0.0 to 1.0 (number)",
      "- fieldsFound: array of field names that were successfully extracted (array of strings)",
      "Return ONLY valid JSON, no markdown."
    ].join("\n");
    const messages = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: "Extract all medication details from this image." },
          { type: "image_url", image_url: { url: imageUrl, detail: "high" } }
        ]
      }
    ];
    const response = await invokeLLM({
      messages,
      response_format: { type: "json_object" }
    });
    const raw = String(response.choices[0].message.content ?? "{}");
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { confidence: 0, fieldsFound: [] };
    }
    const VALID_FORMS = ["tablet", "capsule", "liquid", "injection", "patch", "inhaler", "drops", "other"];
    const VALID_FREQS = ["daily", "twice_daily", "three_times_daily", "four_times_daily", "weekly", "as_needed", "custom"];
    const VALID_ROUTES = ["oral", "sublingual", "subq", "im", "iv", "inhaled", "topical", "ophthalmic", "otic", "nasal", "rectal", "transdermal"];
    return {
      name: parsed.name ?? null,
      genericName: parsed.genericName ?? null,
      dose: parsed.dose ?? null,
      form: VALID_FORMS.includes(parsed.form ?? "") ? parsed.form : null,
      frequency: VALID_FREQS.includes(parsed.frequency ?? "") ? parsed.frequency : null,
      scheduleTimes: Array.isArray(parsed.scheduleTimes) ? parsed.scheduleTimes.slice(0, 6) : null,
      route: VALID_ROUTES.includes(parsed.route ?? "") ? parsed.route : null,
      indication: parsed.indication ?? null,
      prescriber: parsed.prescriber ?? null,
      pharmacyName: parsed.pharmacyName ?? null,
      pharmacyPhone: parsed.pharmacyPhone ?? null,
      quantity: typeof parsed.quantity === "number" ? Math.round(parsed.quantity) : null,
      refillAt: typeof parsed.refillAt === "number" ? Math.round(parsed.refillAt) : null,
      rxNumber: parsed.rxNumber ? String(parsed.rxNumber).replace(/\D/g, "") || null : null,
      startDate: parsed.startDate ?? null,
      refillsRemaining: typeof parsed.refillsRemaining === "number" ? Math.round(parsed.refillsRemaining) : null,
      notes: parsed.notes ?? null,
      confidence: Math.min(1, Math.max(0, parsed.confidence ?? 0.5)),
      fieldsFound: Array.isArray(parsed.fieldsFound) ? parsed.fieldsFound : [],
      disclaimer: "Smart Scribe-extracted medication data requires verification. Always confirm with your prescription label and pharmacist before saving."
    };
  }),
  /**
   * Parses a text transcript of a spoken medication description.
   * Used by Apple Speech mode (on-device transcription) — no audio upload needed.
   * Returns same shape as scribeVoice/scribePhoto.
   */
  scribeTranscript: publicProcedure.input(z3.object({ transcript: z3.string() })).mutation(async ({ input }) => {
    const { transcript } = input;
    const systemPrompt = [
      "You are a clinical pharmacist Smart assistant. A patient has verbally described or read aloud a prescription label.",
      "Extract every medication detail from their statement. Return a JSON object with EXACTLY these fields (use null for any field not mentioned):",
      "- name: brand or trade name of the medication (string or null). Examples: 'Lisinopril', 'Metformin', 'Atorvastatin'",
      "- genericName: generic/INN drug name if different from brand (string or null)",
      "- dose: dosage strength with units, e.g. '10 mg', '500 mg', '20 MG' (string or null). Extract from patterns like 'Lisinopril 10 MG tablet'.",
      "- form: one of: tablet, capsule, liquid, injection, patch, inhaler, drops, other (string or null). Infer from 'tablet', 'capsule', 'liquid', 'patch', 'inhaler'.",
      "- frequency: one of: daily, twice_daily, three_times_daily, four_times_daily, weekly, as_needed, custom. Infer from: 'once daily'=daily, 'twice daily'=twice_daily, 'twice a day'=twice_daily, 'three times daily'=three_times_daily, 'four times daily'=four_times_daily, 'weekly'=weekly, 'as needed'/'PRN'=as_needed, 'at bedtime'=custom, 'use as directed'=custom. (string or null)",
      "- scheduleTimes: array of HH:MM strings inferred from dosing instructions. 'at bedtime'=['21:00'], 'in the morning'=['08:00'], 'twice daily'=['08:00','20:00'], 'three times daily'=['08:00','14:00','20:00']. (array or null)",
      "- route: one of: oral, sublingual, subq, im, iv, inhaled, topical, ophthalmic, otic, nasal, rectal, transdermal. Infer from: 'by mouth'/'orally'/'swallow'=oral, 'under the tongue'=sublingual, 'inject'/'injection'=subq, 'inhale'=inhaled, 'apply'/'cream'/'gel'=topical, 'eye drops'=ophthalmic, 'ear drops'=otic, 'nasal spray'=nasal. (string or null)",
      "- indication: condition this medication treats (string or null)",
      "- prescriber: prescribing physician name if mentioned, e.g. 'Dr. Smith' \u2192 'Smith' (string or null)",
      "- pharmacyName: pharmacy name if mentioned, e.g. 'CVS Pharmacy', 'Walgreens' (string or null)",
      "- pharmacyPhone: pharmacy phone number if mentioned (string or null)",
      "- quantity: number of pills/doses if mentioned. Extract from 'Qty 30', 'quantity 90', '#30' patterns. (integer or null)",
      "- refillsRemaining: number of refills remaining. Extract from 'Refills 2', 'Refills remaining: 1', 'No refills'. (integer or null)",
      "- rxNumber: prescription number. Extract from 'Rx #1234567', 'RX: 1234567', 'Prescription number 1234567'. (string or null)",
      "- startDate: start date or fill date in YYYY-MM-DD format. Extract from 'filled on', 'fill date', 'start date', 'dispensed'. (string or null)",
      "- refillAt: refill threshold (integer, default 7 if quantity is known, else null)",
      "- notes: any additional instructions. Include 'Use as directed', 'Take at bedtime', 'Take with food', 'Avoid alcohol', or any other label instructions. (string or null)",
      "- confidence: overall extraction confidence from 0.0 to 1.0 (number)",
      "- fieldsFound: array of field names that were successfully extracted (array of strings)",
      "Prescription label examples to handle:",
      "  'Lisinopril 10 MG tablet' \u2192 name=Lisinopril, dose=10 mg, form=tablet",
      "  'Take 1 tablet by mouth daily' \u2192 route=oral, frequency=daily, form=tablet",
      "  'Qty 30' \u2192 quantity=30",
      "  'Refills 2' \u2192 refillsRemaining=2",
      "  'Rx #1234567' \u2192 rxNumber=1234567",
      "  'Dr. Smith' \u2192 prescriber=Smith",
      "  'CVS Pharmacy' \u2192 pharmacyName=CVS Pharmacy",
      "  'Take one tablet twice daily' \u2192 frequency=twice_daily, form=tablet",
      "  'Take at bedtime' \u2192 frequency=custom, scheduleTimes=['21:00']",
      "  'Use as directed' \u2192 notes=Use as directed, frequency=custom",
      "Return ONLY valid JSON, no markdown."
    ].join("\n");
    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Patient said: "${transcript}"` }
    ];
    const response = await invokeLLM({ messages, response_format: { type: "json_object" } });
    const raw = String(response.choices[0].message.content ?? "{}");
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { confidence: 0, fieldsFound: [] };
    }
    const VALID_FORMS = ["tablet", "capsule", "liquid", "injection", "patch", "inhaler", "drops", "other"];
    const VALID_FREQS = ["daily", "twice_daily", "three_times_daily", "four_times_daily", "weekly", "as_needed", "custom"];
    const VALID_ROUTES = ["oral", "sublingual", "subq", "im", "iv", "inhaled", "topical", "ophthalmic", "otic", "nasal", "rectal", "transdermal"];
    return {
      transcript,
      name: parsed.name ?? null,
      genericName: parsed.genericName ?? null,
      dose: parsed.dose ?? null,
      form: VALID_FORMS.includes(parsed.form ?? "") ? parsed.form : null,
      frequency: VALID_FREQS.includes(parsed.frequency ?? "") ? parsed.frequency : null,
      scheduleTimes: Array.isArray(parsed.scheduleTimes) ? parsed.scheduleTimes.slice(0, 6) : null,
      route: VALID_ROUTES.includes(parsed.route ?? "") ? parsed.route : null,
      indication: parsed.indication ?? null,
      prescriber: parsed.prescriber ? String(parsed.prescriber).replace(/^Dr\.?\s*/i, "").slice(0, 80) : null,
      pharmacyName: parsed.pharmacyName ? String(parsed.pharmacyName).slice(0, 100) : null,
      pharmacyPhone: parsed.pharmacyPhone ?? null,
      quantity: typeof parsed.quantity === "number" ? Math.round(parsed.quantity) : null,
      refillsRemaining: typeof parsed.refillsRemaining === "number" ? Math.round(parsed.refillsRemaining) : null,
      rxNumber: parsed.rxNumber ? String(parsed.rxNumber).slice(0, 40) : null,
      startDate: parsed.startDate ? String(parsed.startDate).slice(0, 10) : null,
      refillAt: typeof parsed.refillAt === "number" ? Math.round(parsed.refillAt) : null,
      notes: parsed.notes ?? null,
      confidence: Math.min(1, Math.max(0, parsed.confidence ?? 0.5)),
      fieldsFound: Array.isArray(parsed.fieldsFound) ? parsed.fieldsFound : [],
      disclaimer: "Smart Scribe-extracted medication data requires verification. Always confirm with your prescription label and pharmacist before saving."
    };
  })
});

// server/routers.ts
import { execSync } from "child_process";
import * as os from "os";
import * as fs from "fs";
import * as path from "path";
var appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true
      };
    })
  }),
  // Nutrition analysis via LLM vision + voice
  nutrition: router({
    /**
     * Accepts a base64-encoded image (JPEG/PNG) of a food label or meal.
     * Uploads it to S3 (required — local file:// URLs don't work with LLM),
     * then calls the vision model to extract sodium and potassium estimates.
     * Returns structured JSON: { sodiumMg, potassiumMg, foodDescription, confidence, disclaimer }
     */
    analysePhoto: publicProcedure.input(z4.object({
      imageBase64: z4.string(),
      // base64 data URI, e.g. "data:image/jpeg;base64,..."
      mimeType: z4.enum(["image/jpeg", "image/png", "image/webp"]).default("image/jpeg")
    })).mutation(async ({ input }) => {
      const base64Data = input.imageBase64.replace(/^data:image\/\w+;base64,/, "");
      const imageBuffer = Buffer.from(base64Data, "base64");
      const suffix = Math.random().toString(36).slice(2, 8);
      const fileKey = `nutrition-photos/${Date.now()}-${suffix}.jpg`;
      const { url: imageUrl } = await storagePut(fileKey, imageBuffer, input.mimeType);
      const systemPrompt = [
        "You are a clinical nutrition analyst specialising in diabetes management. Analyse the food image or nutrition label provided.",
        "Return a JSON object with EXACTLY these fields (use null for any field you cannot determine):",
        "- sodiumMg: estimated sodium in milligrams (integer). If a nutrition label is visible, read the exact value. If it is a meal photo, estimate based on typical serving sizes.",
        "- potassiumMg: estimated potassium in milligrams (integer, or null if not determinable).",
        "- calories: total calories / kcal for the serving shown (integer, or null).",
        "- carbsG: total carbohydrates in grams (number with 1 decimal, or null).",
        "- sugarG: total sugars in grams (number with 1 decimal, or null).",
        "- fatG: total fat in grams (number with 1 decimal, or null).",
        "- proteinG: protein in grams (number with 1 decimal, or null).",
        "- fiberG: dietary fiber in grams (number with 1 decimal, or null).",
        "- glycemicLoad: estimated glycemic load for the serving (integer 0-100, or null). Use published GL values for common foods; for mixed dishes estimate from carb content and food type.",
        "- foodDescription: short description of the food (max 60 characters).",
        '- confidence: one of "high" (label clearly visible), "medium" (recognisable dish), or "low" (unclear image).',
        "- reasoning: one sentence explaining how you arrived at the key estimates.",
        "Be conservative \u2014 when uncertain, lean toward the lower bound of typical ranges. Never fabricate exact label values if the label is not clearly readable.",
        "For diabetic relevance: glycemic load is more important than glycemic index \u2014 always try to estimate it."
      ].join("\n");
      const messages = [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: "Analyse this food image and extract sodium and potassium content." },
            { type: "image_url", image_url: { url: imageUrl, detail: "high" } }
          ]
        }
      ];
      const response = await invokeLLM({
        messages,
        response_format: { type: "json_object" }
      });
      const raw = String(response.choices[0].message.content);
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error("LLM returned invalid JSON: " + raw);
      }
      const clamp = (v, min = 0, max = 99999) => v != null ? Math.min(max, Math.max(min, Math.round(v * 10) / 10)) : null;
      return {
        sodiumMg: Math.max(0, Math.round(parsed.sodiumMg ?? 0)),
        potassiumMg: parsed.potassiumMg != null ? Math.max(0, Math.round(parsed.potassiumMg)) : null,
        calories: parsed.calories != null ? Math.max(0, Math.round(parsed.calories)) : null,
        carbsG: clamp(parsed.carbsG, 0, 500),
        sugarG: clamp(parsed.sugarG, 0, 500),
        fatG: clamp(parsed.fatG, 0, 300),
        proteinG: clamp(parsed.proteinG, 0, 300),
        fiberG: clamp(parsed.fiberG, 0, 100),
        glycemicLoad: parsed.glycemicLoad != null ? Math.min(100, Math.max(0, Math.round(parsed.glycemicLoad))) : null,
        foodDescription: (parsed.foodDescription ?? "").slice(0, 80),
        confidence: parsed.confidence ?? "low",
        reasoning: (parsed.reasoning ?? "").slice(0, 200),
        disclaimer: "Smart estimates only \u2014 verify against nutrition label when available."
      };
    }),
    /**
     * Accepts a base64-encoded barcode image.
     * Uploads to S3, asks the vision LLM to read the barcode number and identify
     * the product, then returns the full nutritional profile for that product.
     * Returns same shape as analysePhoto.
     */
    lookupBarcode: publicProcedure.input(z4.object({
      imageBase64: z4.string(),
      mimeType: z4.enum(["image/jpeg", "image/png", "image/webp"]).default("image/jpeg")
    })).mutation(async ({ input }) => {
      const base64Data = input.imageBase64.replace(/^data:image\/\w+;base64,/, "");
      const imageBuffer = Buffer.from(base64Data, "base64");
      const suffix = Math.random().toString(36).slice(2, 8);
      const fileKey = `barcode-photos/${Date.now()}-${suffix}.jpg`;
      const { url: imageUrl } = await storagePut(fileKey, imageBuffer, input.mimeType);
      const systemPrompt = [
        "You are a clinical nutrition analyst. The user has photographed a product barcode (EAN-13, UPC-A, or similar).",
        "Step 1: Read the barcode number from the image.",
        "Step 2: Identify the packaged food product associated with that barcode using your training knowledge.",
        "Step 3: Return the per-serving nutritional profile for that product.",
        "Return a JSON object with EXACTLY these fields (use null for any field you cannot determine):",
        "- productName: the full product name (string, max 80 chars)",
        "- brandName: brand/manufacturer name (string, max 40 chars, or null)",
        "- barcodeNumber: the barcode digits you read (string, or null if unreadable)",
        "- sodiumMg: sodium per serving in milligrams (integer)",
        "- potassiumMg: potassium per serving in milligrams (integer, or null)",
        "- calories: calories per serving (integer, or null)",
        "- carbsG: total carbohydrates per serving in grams (number with 1 decimal, or null)",
        "- sugarG: total sugars per serving in grams (number with 1 decimal, or null)",
        "- fatG: total fat per serving in grams (number with 1 decimal, or null)",
        "- proteinG: protein per serving in grams (number with 1 decimal, or null)",
        "- fiberG: dietary fiber per serving in grams (number with 1 decimal, or null)",
        "- glycemicLoad: estimated glycemic load per serving (integer 0-100, or null)",
        '- confidence: "high" if you recognise the exact product, "medium" if you recognise the brand/category, "low" if the barcode was unreadable or product unknown.',
        "- reasoning: one sentence explaining how you identified the product.",
        'If the barcode is unreadable, set confidence to "low" and fill all nutrition fields with null.'
      ].join("\n");
      const messages = [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: "Read this barcode and return the nutritional profile for the product." },
            { type: "image_url", image_url: { url: imageUrl, detail: "high" } }
          ]
        }
      ];
      const response = await invokeLLM({
        messages,
        response_format: { type: "json_object" }
      });
      const raw = String(response.choices[0].message.content);
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error("LLM returned invalid JSON: " + raw);
      }
      const clamp = (v, min = 0, max = 99999) => v != null ? Math.min(max, Math.max(min, Math.round(v * 10) / 10)) : null;
      const productLabel = [
        parsed.productName ?? "Unknown product",
        parsed.brandName ? `(${parsed.brandName})` : null
      ].filter(Boolean).join(" ");
      return {
        sodiumMg: Math.max(0, Math.round(parsed.sodiumMg ?? 0)),
        potassiumMg: parsed.potassiumMg != null ? Math.max(0, Math.round(parsed.potassiumMg)) : null,
        calories: parsed.calories != null ? Math.max(0, Math.round(parsed.calories)) : null,
        carbsG: clamp(parsed.carbsG, 0, 500),
        sugarG: clamp(parsed.sugarG, 0, 500),
        fatG: clamp(parsed.fatG, 0, 300),
        proteinG: clamp(parsed.proteinG, 0, 300),
        fiberG: clamp(parsed.fiberG, 0, 100),
        glycemicLoad: parsed.glycemicLoad != null ? Math.min(100, Math.max(0, Math.round(parsed.glycemicLoad))) : null,
        foodDescription: productLabel.slice(0, 80),
        barcodeNumber: parsed.barcodeNumber ?? null,
        confidence: parsed.confidence ?? "low",
        reasoning: (parsed.reasoning ?? "").slice(0, 200),
        disclaimer: "Smart estimates only \u2014 verify against product label when available."
      };
    }),
    /**
     * Accepts a base64-encoded audio recording (m4a/wav/webm).
     * Uploads to S3, transcribes with Whisper, then parses the transcript
     * with the LLM to extract the full nutritional profile.
     * Returns: { transcript, sodiumMg, potassiumMg, calories, carbsG, sugarG, fatG, proteinG, fiberG, glycemicLoad, foodDescription, confidence, reasoning, disclaimer }
     */
    parseVoice: publicProcedure.input(z4.object({
      audioBase64: z4.string(),
      // base64 data URI, e.g. "data:audio/m4a;base64,..."
      mimeType: z4.enum(["audio/m4a", "audio/wav", "audio/webm", "audio/mpeg", "audio/mp4"]).default("audio/m4a")
    })).mutation(async ({ input }) => {
      const base64Data = input.audioBase64.replace(/^data:[^;]+;base64,/, "");
      const audioBuffer = Buffer.from(base64Data, "base64");
      const ext = input.mimeType.split("/")[1] ?? "m4a";
      const suffix = Math.random().toString(36).slice(2, 8);
      const fileKey = `nutrition-voice/${Date.now()}-${suffix}.${ext}`;
      const { url: audioUrl } = await storagePut(fileKey, audioBuffer, input.mimeType);
      const transcriptionResult = await transcribeAudio({
        audioUrl,
        prompt: "Food items, meal description, sodium, potassium, calories, carbohydrates, sugar, fat, protein, fiber, glycemic load"
      });
      const transcript = "text" in transcriptionResult ? transcriptionResult.text ?? "" : "";
      const emptyNutrition = {
        transcript: "",
        sodiumMg: 0,
        potassiumMg: null,
        calories: null,
        carbsG: null,
        sugarG: null,
        fatG: null,
        proteinG: null,
        fiberG: null,
        glycemicLoad: null,
        foodDescription: "",
        confidence: "low",
        reasoning: "No speech detected in the recording.",
        disclaimer: "Smart estimates only \u2014 verify against nutrition label when available."
      };
      if (!transcript.trim()) return emptyNutrition;
      const systemPrompt = [
        "You are a clinical nutrition analyst specialising in diabetes management. A user has described a food item or meal verbally.",
        "Based on their description, estimate the complete nutritional profile using published USDA/FDA reference values for the described food and typical serving sizes.",
        "Return a JSON object with EXACTLY these fields (use null for any field you cannot determine):",
        "- sodiumMg: estimated sodium in milligrams (integer).",
        "- potassiumMg: estimated potassium in milligrams (integer, or null).",
        "- calories: total calories / kcal for the described serving (integer, or null).",
        "- carbsG: total carbohydrates in grams (number with 1 decimal, or null).",
        "- sugarG: total sugars in grams (number with 1 decimal, or null).",
        "- fatG: total fat in grams (number with 1 decimal, or null).",
        "- proteinG: protein in grams (number with 1 decimal, or null).",
        "- fiberG: dietary fiber in grams (number with 1 decimal, or null).",
        "- glycemicLoad: estimated glycemic load for the described serving (integer 0-100, or null). Use published GL values; for mixed dishes estimate from carb content and food type.",
        "- foodDescription: short description of the food (max 60 characters).",
        '- confidence: one of "high" (specific branded/labelled food named), "medium" (recognisable dish), or "low" (vague description).',
        "- reasoning: one sentence explaining how you arrived at the key estimates.",
        "Be conservative \u2014 when uncertain, lean toward the lower bound of typical ranges.",
        "For diabetic relevance: always try to estimate glycemic load \u2014 it is more clinically useful than glycemic index."
      ].join("\n");
      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: `User said: "${transcript}"` }
      ];
      const response = await invokeLLM({
        messages,
        response_format: { type: "json_object" }
      });
      const raw = String(response.choices[0].message.content);
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error("LLM returned invalid JSON: " + raw);
      }
      const clamp = (v, min = 0, max = 99999) => v != null ? Math.min(max, Math.max(min, Math.round(v * 10) / 10)) : null;
      return {
        transcript,
        sodiumMg: Math.max(0, Math.round(parsed.sodiumMg ?? 0)),
        potassiumMg: parsed.potassiumMg != null ? Math.max(0, Math.round(parsed.potassiumMg)) : null,
        calories: parsed.calories != null ? Math.max(0, Math.round(parsed.calories)) : null,
        carbsG: clamp(parsed.carbsG, 0, 500),
        sugarG: clamp(parsed.sugarG, 0, 500),
        fatG: clamp(parsed.fatG, 0, 300),
        proteinG: clamp(parsed.proteinG, 0, 300),
        fiberG: clamp(parsed.fiberG, 0, 100),
        glycemicLoad: parsed.glycemicLoad != null ? Math.min(100, Math.max(0, Math.round(parsed.glycemicLoad))) : null,
        foodDescription: (parsed.foodDescription ?? "").slice(0, 80),
        confidence: parsed.confidence ?? "low",
        reasoning: (parsed.reasoning ?? "").slice(0, 200),
        disclaimer: "Smart estimates only \u2014 verify against nutrition label when available."
      };
    })
  }),
  // Smart Caloric Trend Analysis
  // Accepts 7-day DailyNutrients + optional BP/glucose context,
  // returns a natural-language clinical insight paragraph.
  caloricTrends: router({
    analyzeTrends: publicProcedure.input(z4.object({
      days: z4.array(z4.object({
        date: z4.string(),
        fats_g: z4.number(),
        carbohydrates_g: z4.number(),
        protein_g: z4.number(),
        sugar_g: z4.number(),
        fiber_g: z4.number(),
        sodium_mg: z4.number(),
        total_calories_kcal: z4.number(),
        calculated_calories_kcal: z4.number(),
        glycemic_load: z4.number(),
        entry_count: z4.number()
      })).min(1).max(14),
      // Optional context for richer clinical insight
      avgSystolic: z4.number().optional(),
      avgDiastolic: z4.number().optional(),
      avgGlucoseMgDl: z4.number().optional()
    })).mutation(async ({ input }) => {
      const { days, avgSystolic, avgDiastolic, avgGlucoseMgDl } = input;
      const tableRows = days.map(
        (d) => `${d.date}: ${d.total_calories_kcal} kcal | Carbs ${d.carbohydrates_g}g | Protein ${d.protein_g}g | Fat ${d.fats_g}g | Fiber ${d.fiber_g}g | Sodium ${d.sodium_mg}mg | GL ${d.glycemic_load} | ${d.entry_count} meal(s)`
      ).join("\n");
      const avgCalories = Math.round(days.reduce((s, d) => s + d.total_calories_kcal, 0) / days.length);
      const avgSodium = Math.round(days.reduce((s, d) => s + d.sodium_mg, 0) / days.length);
      const avgGL = Math.round(days.reduce((s, d) => s + d.glycemic_load, 0) / days.length * 10) / 10;
      const avgCarbs = Math.round(days.reduce((s, d) => s + d.carbohydrates_g, 0) / days.length * 10) / 10;
      const avgFiber = Math.round(days.reduce((s, d) => s + d.fiber_g, 0) / days.length * 10) / 10;
      const contextLines = [
        avgSystolic != null ? `Average blood pressure: ${avgSystolic}/${avgDiastolic ?? "?"} mmHg` : null,
        avgGlucoseMgDl != null ? `Average fasting glucose: ${avgGlucoseMgDl} mg/dL` : null
      ].filter(Boolean).join("\n");
      const systemPrompt = [
        "You are a clinical dietitian and diabetes educator providing personalised nutritional feedback.",
        "Analyse the patient's dietary trend data for the past several days and produce a concise, actionable clinical insight.",
        "Guidelines:",
        "- DASH diet sodium target: \u22642,300 mg/day (ideally \u22641,500 mg/day for hypertension)",
        "- ADA calorie target: ~2,000 kcal/day for average adult",
        "- Carbohydrate target: 45-60% of calories (~225-300g/day)",
        "- Fiber target: \u226528g/day",
        "- Daily glycemic load target: \u226480 (low-GL diet)",
        "- Protein target: ~50g/day",
        "Return a JSON object with EXACTLY these fields:",
        "- headline: a single sentence (max 15 words) summarising the most important trend, e.g. 'Sodium intake is trending 18% above DASH guidelines this week.'",
        "- insight: 2-4 sentences of clinical narrative covering caloric balance, macro distribution, sodium/DASH adherence, glycemic load, and any notable patterns. Mention specific numbers. Be direct and clinically precise.",
        "- recommendations: an array of 2-4 short, actionable recommendation strings (each max 12 words), e.g. ['Replace white rice with brown rice or quinoa', 'Add a daily handful of mixed nuts for healthy fats']",
        "- trend_direction: one of 'improving', 'stable', 'worsening', or 'mixed' \u2014 overall nutritional trend",
        "- risk_level: one of 'low', 'moderate', 'high' \u2014 based on deviation from targets",
        "Do not include legal disclaimers in the JSON."
      ].join("\n");
      const userContent = [
        `Daily nutritional data (${days.length} days):`,
        tableRows,
        ``,
        `Averages: ${avgCalories} kcal/day | Carbs ${avgCarbs}g | Fiber ${avgFiber}g | Sodium ${avgSodium}mg | GL ${avgGL}`,
        contextLines ? `
Clinical context:
${contextLines}` : ""
      ].join("\n");
      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent }
      ];
      const response = await invokeLLM({
        messages,
        response_format: { type: "json_object" }
      });
      const raw = String(response.choices[0].message.content);
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error("LLM returned invalid JSON: " + raw);
      }
      return {
        headline: (parsed.headline ?? "").slice(0, 120),
        insight: (parsed.insight ?? "").slice(0, 600),
        recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.slice(0, 4).map((r) => String(r).slice(0, 80)) : [],
        trend_direction: ["improving", "stable", "worsening", "mixed"].includes(parsed.trend_direction) ? parsed.trend_direction : "mixed",
        risk_level: ["low", "moderate", "high"].includes(parsed.risk_level) ? parsed.risk_level : "moderate",
        disclaimer: "Smart-generated clinical insights \u2014 not a substitute for professional medical advice.",
        analyzed_days: days.length,
        avg_calories: avgCalories,
        avg_sodium_mg: avgSodium,
        avg_glycemic_load: avgGL
      };
    })
  }),
  // ─── Sugar trend insight ─────────────────────────────────────────────────────
  sugarInsight: publicProcedure.input(
    z4.object({
      /** 7-day daily sugar totals in grams, oldest first */
      dailyTotals: z4.array(z4.number()),
      /** User's daily sugar budget in grams */
      budgetG: z4.number(),
      /** ISO date labels for each day (YYYY-MM-DD), oldest first */
      dateLabels: z4.array(z4.string())
    })
  ).query(async ({ input }) => {
    const { dailyTotals, budgetG, dateLabels } = input;
    const daysUnder = dailyTotals.filter((g) => g <= budgetG).length;
    const daysOver = dailyTotals.length - daysUnder;
    let bestStreak = 0;
    let currentStreak = 0;
    for (const g of dailyTotals) {
      if (g <= budgetG) {
        currentStreak++;
        if (currentStreak > bestStreak) bestStreak = currentStreak;
      } else {
        currentStreak = 0;
      }
    }
    const avg = dailyTotals.length ? Math.round(dailyTotals.reduce((s, v) => s + v, 0) / dailyTotals.length * 10) / 10 : 0;
    const trend = dailyTotals.length >= 2 ? dailyTotals[dailyTotals.length - 1] - dailyTotals[0] : 0;
    const systemPrompt = [
      "You are a concise clinical nutrition assistant.",
      "Generate a single plain-English sentence (max 18 words, no markdown, no emoji) summarising the user's 7-day sugar intake trend.",
      "Focus on: days under budget, best streak, average vs. budget, and whether the trend is improving or worsening.",
      "Examples:",
      '  "You stayed under budget 5 of 7 days \u2014 best streak: 3 days."',
      '  "Average sugar this week was 28g, 3g over your 25g budget."',
      `  "Intake is trending down \u2014 you've been under budget the last 3 days."`,
      "Return ONLY the sentence, no JSON, no extra text."
    ].join("\n");
    const userContent = [
      `Budget: ${budgetG}g/day`,
      `7-day totals (oldest first): ${dailyTotals.map((g, i) => `${dateLabels[i] ?? i}: ${g}g`).join(", ")}`,
      `Days under budget: ${daysUnder} / ${dailyTotals.length}`,
      `Best consecutive streak under budget: ${bestStreak} day(s)`,
      `7-day average: ${avg}g`,
      `Trend (last minus first): ${trend > 0 ? "+" : ""}${trend}g`,
      `Days over budget: ${daysOver}`
    ].join("\n");
    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent }
    ];
    const response = await invokeLLM({ messages });
    const sentence = String(response.choices[0].message.content ?? "").trim().replace(/^["']|["']$/g, "");
    return { insight: sentence.slice(0, 120) };
  }),
  // Smart Nutrition Intelligence — food search and recipe generation
  nutritionAI: router({
    /**
     * USDA-backed food search: accepts a natural-language query and returns
     * up to 8 matching food items with full macro profiles.
     */
    searchFood: publicProcedure.input(z4.object({
      query: z4.string().min(1).max(300),
      dietProtocol: z4.string().optional()
    })).mutation(async ({ input }) => {
      const systemPrompt = [
        "You are a registered dietitian with access to the USDA FoodData Central (2024) and NCCDB databases.",
        "The user has described a food item or meal in natural language. Identify the most likely food items and return their nutritional profiles.",
        "For each item, use USDA reference values for a standard serving size. Be precise with macros.",
        "Return a JSON object with a 'results' array of up to 8 items. Each item must have:",
        "- id: a short unique slug",
        "- name: the food name as it would appear in a nutrition database (e.g. 'Vegan Protein Powder, 1 scoop (30g)')",
        "- brand: brand or source if known, otherwise 'Generic'",
        "- serving_size: string description (e.g. '1 scoop (30g)')",
        "- serving_g: serving weight in grams (number)",
        "- calories: kcal per serving (number)",
        "- protein_g: protein grams (number)",
        "- carbs_g: total carbohydrate grams (number)",
        "- fat_g: total fat grams (number)",
        "- fiber_g: dietary fiber grams (number)",
        "- sodium_mg: sodium milligrams (number)",
        "- potassium_mg: potassium milligrams (number)",
        "- phosphorus_mg: phosphorus milligrams (number)",
        "- glycemic_index: estimated GI (number 0-100) or null",
        "- usda_category: USDA food category string",
        "- clinical_notes: one sentence about this food's relevance to the user's diet protocol",
        input.dietProtocol ? `The user follows a ${input.dietProtocol} diet protocol. Prioritise aligned foods and flag conflicts.` : ""
      ].filter(Boolean).join("\n");
      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Search query: "${input.query}"` }
      ];
      const response = await invokeLLM({ messages, response_format: { type: "json_object" } });
      const raw = String(response.choices[0].message.content);
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error("LLM returned invalid JSON");
      }
      return {
        results: (parsed.results ?? []).slice(0, 8).map((r) => ({
          id: String(r.id ?? Math.random().toString(36).slice(2)),
          name: String(r.name ?? "").slice(0, 120),
          brand: String(r.brand ?? "Generic").slice(0, 60),
          serving_size: String(r.serving_size ?? "1 serving").slice(0, 60),
          serving_g: Number(r.serving_g ?? 100),
          calories: Number(r.calories ?? 0),
          protein_g: Number(r.protein_g ?? 0),
          carbs_g: Number(r.carbs_g ?? 0),
          fat_g: Number(r.fat_g ?? 0),
          fiber_g: Number(r.fiber_g ?? 0),
          sodium_mg: Number(r.sodium_mg ?? 0),
          potassium_mg: Number(r.potassium_mg ?? 0),
          phosphorus_mg: Number(r.phosphorus_mg ?? 0),
          glycemic_index: r.glycemic_index != null ? Number(r.glycemic_index) : null,
          usda_category: String(r.usda_category ?? "Other").slice(0, 60),
          clinical_notes: String(r.clinical_notes ?? "").slice(0, 200)
        }))
      };
    }),
    /**
     * Clinical-grade Smart nutrition insight card.
     * Accepts today's caloric intake, sugar intake, latest blood glucose, and
     * diet protocol. Returns a 1-line summary, risk level, glucose trend
     * prediction, and 2 short actionable recommendations grounded in
     * ADA / WHO / AMDR guidelines.
     */
    smartNutritionInsights: publicProcedure.input(z4.object({
      caloriesKcal: z4.number(),
      sugarG: z4.number(),
      glucoseMgDl: z4.number().optional(),
      dietProtocol: z4.string().optional(),
      goalCalories: z4.number().optional(),
      sugarBudgetG: z4.number().optional()
    })).mutation(async ({ input }) => {
      const systemPrompt = [
        "You are a clinical-grade nutrition and metabolic intelligence engine.",
        "Follow ADA, WHO, and AMDR guidelines strictly.",
        "Return STRICT JSON with these exact keys:",
        '{ "summary": "1-line insight (max 12 words)", "risk_level": "low | moderate | high", "predicted_glucose_trend": "stable | rising | high risk", "recommendations": ["short actionable rec (max 12 words)", "short actionable rec (max 12 words)"], "references": ["APA citation"] }',
        "Keep every string under 120 characters. No markdown."
      ].join("\n");
      const userContent = [
        `Today's intake: ${Math.round(input.caloriesKcal)} kcal (goal: ${Math.round(input.goalCalories ?? 2e3)} kcal)`,
        `Sugar: ${input.sugarG.toFixed(1)}g (budget: ${(input.sugarBudgetG ?? 50).toFixed(0)}g)`,
        input.glucoseMgDl != null ? `Latest blood glucose: ${input.glucoseMgDl} mg/dL` : "Blood glucose: not recorded",
        input.dietProtocol ? `Diet protocol: ${input.dietProtocol}` : ""
      ].filter(Boolean).join("\n");
      const response = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent }
        ],
        response_format: { type: "json_object" }
      });
      const raw = String(response.choices[0].message.content);
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error("LLM returned invalid JSON");
      }
      return {
        summary: String(parsed.summary ?? "").slice(0, 120),
        risk_level: ["low", "moderate", "high"].includes((parsed.risk_level ?? "").toLowerCase()) ? parsed.risk_level.toLowerCase() : "low",
        predicted_glucose_trend: ["stable", "rising", "high risk"].includes((parsed.predicted_glucose_trend ?? "").toLowerCase()) ? parsed.predicted_glucose_trend.toLowerCase() : "stable",
        recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.slice(0, 2).map((r) => String(r).slice(0, 120)) : [],
        references: Array.isArray(parsed.references) ? parsed.references.slice(0, 2).map((r) => String(r).slice(0, 200)) : []
      };
    })
  }),
  // Medication side-effect LLM lookup
  medications: router({
    /**
     * Given a medication name (and optional generic name), returns a list of
     * common side effects sourced from clinical pharmacology knowledge.
     * Returns: { sideEffects: string[], disclaimer: string }
     */
    lookupSideEffects: publicProcedure.input(z4.object({
      medicationName: z4.string(),
      genericName: z4.string().optional(),
      indication: z4.string().optional()
    })).mutation(async ({ input }) => {
      const systemPrompt = [
        "You are a clinical pharmacist with expertise in drug safety and patient counselling.",
        "Given a medication name, return the most clinically relevant side effects that a patient should know about.",
        "Focus on: (1) common side effects (>10% incidence), (2) serious but rare effects requiring monitoring, (3) effects especially relevant for diabetic or hypertensive patients.",
        "Return a JSON object with EXACTLY these fields:",
        '- sideEffects: an array of concise side-effect strings (max 12 items). Each string should be 2-5 words, e.g. "Dry cough", "Hyperkalemia", "Dizziness on standing". Order by clinical importance.',
        "- reasoning: one sentence explaining the pharmacological basis for the top 2-3 effects.",
        "If the medication name is not recognised as a real drug, return an empty sideEffects array and note that in reasoning.",
        "Do not include legal disclaimers in the JSON \u2014 they will be added separately."
      ].join("\n");
      const userContent = [
        `Medication: ${input.medicationName}`,
        input.genericName ? `Generic name: ${input.genericName}` : null,
        input.indication ? `Prescribed for: ${input.indication}` : null
      ].filter(Boolean).join("\n");
      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent }
      ];
      const response = await invokeLLM({
        messages,
        response_format: { type: "json_object" }
      });
      const raw = String(response.choices[0].message.content);
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error("LLM returned invalid JSON: " + raw);
      }
      return {
        sideEffects: Array.isArray(parsed.sideEffects) ? parsed.sideEffects.slice(0, 12).map((s) => String(s).slice(0, 60)) : [],
        reasoning: (parsed.reasoning ?? "").slice(0, 300),
        disclaimer: "Smart-generated information only \u2014 always consult your prescriber or pharmacist."
      };
    }),
    /**
     * Parses a free-form spoken medication description and extracts all form fields.
     * Input: { transcript: string }
     * Returns all extractable fields: name, genericName, dose, frequency, frequencyNote,
     * prescriber, indication, pharmacy, pharmacyPhone, notes, status, startDate
     */
    parseMedicationTranscript: publicProcedure.input(z4.object({
      transcript: z4.string()
    })).mutation(async ({ input }) => {
      const systemPrompt = [
        "You are a clinical data entry assistant. A patient has verbally described a medication they take.",
        "Extract every piece of medication information from their statement and return a JSON object.",
        "Return ONLY a JSON object with these fields (use null for any field not mentioned):",
        "- name: the brand or common medication name (string or null)",
        "- genericName: the generic/chemical name if mentioned (string or null)",
        "- dose: the dose with units, e.g. '500 mg', '10 mg', '2 tablets' (string or null)",
        "- frequency: one of exactly: 'once-daily', 'twice-daily', 'three-times-daily', 'four-times-daily', 'every-other-day', 'weekly', 'as-needed', 'other'. Infer from phrases like 'once a day'='once-daily', 'twice a day'='twice-daily', 'every morning and evening'='twice-daily', 'as needed'='as-needed'. Use null if unclear.",
        "- frequencyNote: free-text schedule description if frequency is 'other' or if extra detail was given (string or null)",
        "- prescriber: doctor or prescriber name if mentioned (string or null)",
        "- indication: what it is prescribed for, e.g. 'blood pressure', 'diabetes', 'cholesterol' (string or null)",
        "- pharmacy: pharmacy name if mentioned (string or null)",
        "- pharmacyPhone: pharmacy phone number if mentioned (string or null)",
        "- notes: any additional notes, observations, or instructions mentioned (string or null)",
        "- status: one of 'active', 'paused', 'discontinued'. Default to 'active' unless they say they stopped or paused it.",
        "- confidence: 'high' if name and dose are clearly stated, 'medium' if name only, 'low' if very unclear.",
        "- reasoning: one sentence explaining what you extracted and any assumptions made.",
        "Common patterns: '500 milligrams' = '500 mg', 'twice a day' = 'twice-daily', 'prescribed by Dr Smith' = prescriber 'Dr Smith'.",
        "Do not invent information not present in the transcript."
      ].join("\n");
      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Patient said: "${input.transcript}"` }
      ];
      const response = await invokeLLM({
        messages,
        response_format: { type: "json_object" }
      });
      const raw = String(response.choices[0].message.content);
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error("LLM returned invalid JSON: " + raw);
      }
      const validFrequencies = ["once-daily", "twice-daily", "three-times-daily", "four-times-daily", "every-other-day", "weekly", "as-needed", "other"];
      const validStatuses = ["active", "paused", "discontinued"];
      return {
        name: parsed.name ? String(parsed.name).slice(0, 100) : null,
        genericName: parsed.genericName ? String(parsed.genericName).slice(0, 100) : null,
        dose: parsed.dose ? String(parsed.dose).slice(0, 50) : null,
        frequency: validFrequencies.includes(parsed.frequency ?? "") ? parsed.frequency : null,
        frequencyNote: parsed.frequencyNote ? String(parsed.frequencyNote).slice(0, 120) : null,
        prescriber: parsed.prescriber ? String(parsed.prescriber).slice(0, 80) : null,
        indication: parsed.indication ? String(parsed.indication).slice(0, 120) : null,
        pharmacy: parsed.pharmacy ? String(parsed.pharmacy).slice(0, 100) : null,
        pharmacyPhone: parsed.pharmacyPhone ? String(parsed.pharmacyPhone).slice(0, 30) : null,
        notes: parsed.notes ? String(parsed.notes).slice(0, 300) : null,
        status: validStatuses.includes(parsed.status ?? "") ? parsed.status : "active",
        confidence: parsed.confidence ?? "low",
        reasoning: (parsed.reasoning ?? "").slice(0, 300),
        disclaimer: "Smart Scribe-extracted \u2014 please review all fields before saving."
      };
    }),
    /**
     * Transcribes a voice recording of a medication description and extracts all form fields.
     * Identical LLM logic to parseMedicationTranscript but includes Whisper transcription step.
     * Returns same shape as parseMedicationTranscript plus { transcript }.
     */
    parseMedicationVoice: publicProcedure.input(z4.object({
      audioBase64: z4.string(),
      mimeType: z4.enum(["audio/m4a", "audio/wav", "audio/webm", "audio/mpeg", "audio/mp4"]).default("audio/m4a")
    })).mutation(async ({ input }) => {
      const base64Data = input.audioBase64.replace(/^data:[^;]+;base64,/, "");
      const audioBuffer = Buffer.from(base64Data, "base64");
      const ext = input.mimeType.split("/")[1] ?? "m4a";
      const suffix = Math.random().toString(36).slice(2, 8);
      const fileKey = `med-voice/${Date.now()}-${suffix}.${ext}`;
      const { url: audioUrl } = await storagePut(fileKey, audioBuffer, input.mimeType);
      const transcriptionResult = await transcribeAudio({
        audioUrl,
        prompt: "Medication name, dose, frequency, prescriber, pharmacy, indication"
      });
      if ("error" in transcriptionResult) throw new Error(transcriptionResult.error);
      const transcript = transcriptionResult.text;
      const systemPrompt = [
        "You are a clinical data entry assistant. A patient has verbally described a medication they take.",
        "Extract every piece of medication information from their statement and return a JSON object.",
        "Return ONLY a JSON object with these fields (use null for any field not mentioned):",
        "- name: the brand or common medication name (string or null)",
        "- genericName: the generic/chemical name if mentioned (string or null)",
        "- dose: the dose with units, e.g. '500 mg', '10 mg', '2 tablets' (string or null)",
        "- frequency: one of exactly: 'once-daily', 'twice-daily', 'three-times-daily', 'four-times-daily', 'every-other-day', 'weekly', 'as-needed', 'other'. Infer from phrases like 'once a day'='once-daily', 'twice a day'='twice-daily'. Use null if unclear.",
        "- frequencyNote: free-text schedule description if frequency is 'other' or if extra detail was given (string or null)",
        "- prescriber: doctor or prescriber name if mentioned (string or null)",
        "- indication: what it is prescribed for, e.g. 'blood pressure', 'diabetes', 'cholesterol' (string or null)",
        "- pharmacy: pharmacy name if mentioned (string or null)",
        "- pharmacyPhone: pharmacy phone number if mentioned (string or null)",
        "- notes: any additional notes, observations, or instructions mentioned (string or null)",
        "- status: one of 'active', 'paused', 'discontinued'. Default to 'active' unless they say they stopped or paused it.",
        "- confidence: 'high' if name and dose are clearly stated, 'medium' if name only, 'low' if very unclear.",
        "- reasoning: one sentence explaining what you extracted and any assumptions made.",
        "Do not invent information not present in the transcript."
      ].join("\n");
      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Patient said: "${transcript}"` }
      ];
      const response = await invokeLLM({
        messages,
        response_format: { type: "json_object" }
      });
      const raw = String(response.choices[0].message.content);
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error("LLM returned invalid JSON: " + raw);
      }
      const validFrequencies = ["once-daily", "twice-daily", "three-times-daily", "four-times-daily", "every-other-day", "weekly", "as-needed", "other"];
      const validStatuses = ["active", "paused", "discontinued"];
      return {
        transcript,
        name: parsed.name ? String(parsed.name).slice(0, 100) : null,
        genericName: parsed.genericName ? String(parsed.genericName).slice(0, 100) : null,
        dose: parsed.dose ? String(parsed.dose).slice(0, 50) : null,
        frequency: validFrequencies.includes(parsed.frequency ?? "") ? parsed.frequency : null,
        frequencyNote: parsed.frequencyNote ? String(parsed.frequencyNote).slice(0, 120) : null,
        prescriber: parsed.prescriber ? String(parsed.prescriber).slice(0, 80) : null,
        indication: parsed.indication ? String(parsed.indication).slice(0, 120) : null,
        pharmacy: parsed.pharmacy ? String(parsed.pharmacy).slice(0, 100) : null,
        pharmacyPhone: parsed.pharmacyPhone ? String(parsed.pharmacyPhone).slice(0, 30) : null,
        notes: parsed.notes ? String(parsed.notes).slice(0, 300) : null,
        status: validStatuses.includes(parsed.status ?? "") ? parsed.status : "active",
        confidence: parsed.confidence ?? "low",
        reasoning: (parsed.reasoning ?? "").slice(0, 300),
        disclaimer: "Smart Scribe-extracted \u2014 please review all fields before saving."
      };
    }),
    /**
     * Parses a photo of a prescription label, medication bottle, or discharge paperwork.
     * Accepts a base64-encoded image and returns structured medication fields.
     */
    parseMedicationImage: publicProcedure.input(z4.object({
      imageBase64: z4.string(),
      mimeType: z4.enum(["image/jpeg", "image/png", "image/webp", "image/heic"]).default("image/jpeg")
    })).mutation(async ({ input }) => {
      const base64Data = input.imageBase64.replace(/^data:[^;]+;base64,/, "");
      const imageBuffer = Buffer.from(base64Data, "base64");
      const ext = input.mimeType.split("/")[1] ?? "jpg";
      const suffix = Math.random().toString(36).slice(2, 8);
      const fileKey = `med-scribe/${Date.now()}-${suffix}.${ext}`;
      const { url: imageUrl } = await storagePut(fileKey, imageBuffer, input.mimeType);
      const systemPrompt = [
        "You are a clinical data entry assistant. You are given a photo of a prescription label, medication bottle, discharge paperwork, or medication list.",
        "Extract every piece of medication information visible in the image and return a JSON object.",
        "Return ONLY a JSON object with these fields (use null for any field not found):",
        "- name: the brand or common medication name (string or null)",
        "- genericName: the generic/chemical name if shown (string or null)",
        '- dose: the dose with units, e.g. "500 mg", "10 mg", "2 tablets" (string or null)',
        '- frequency: one of exactly: "once-daily", "twice-daily", "three-times-daily", "four-times-daily", "every-other-day", "weekly", "as-needed", "other". Use null if unclear.',
        '- frequencyNote: free-text schedule if frequency is "other" or extra detail is given (string or null)',
        "- prescriber: prescribing doctor name if visible (string or null)",
        "- indication: what it is prescribed for if stated (string or null)",
        "- pharmacy: pharmacy name if visible (string or null)",
        "- pharmacyPhone: pharmacy phone number if visible (string or null)",
        "- notes: any additional instructions, warnings, or notes visible (string or null)",
        '- status: "active" unless the label says discontinued or expired.',
        '- confidence: "high" if name and dose are clearly legible, "medium" if partially legible, "low" if very unclear.',
        "- reasoning: one sentence explaining what you found and any assumptions.",
        "Do not invent information not visible in the image."
      ].join("\n");
      const messages = [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: "Please extract all medication information from this image." },
            { type: "image_url", image_url: { url: imageUrl, detail: "high" } }
          ]
        }
      ];
      const response = await invokeLLM({ messages, response_format: { type: "json_object" } });
      const raw = String(response.choices[0].message.content);
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error("LLM returned invalid JSON: " + raw);
      }
      const validFrequencies = ["once-daily", "twice-daily", "three-times-daily", "four-times-daily", "every-other-day", "weekly", "as-needed", "other"];
      const validStatuses = ["active", "paused", "discontinued"];
      return {
        name: parsed.name ? String(parsed.name).slice(0, 100) : null,
        genericName: parsed.genericName ? String(parsed.genericName).slice(0, 100) : null,
        dose: parsed.dose ? String(parsed.dose).slice(0, 50) : null,
        frequency: validFrequencies.includes(parsed.frequency ?? "") ? parsed.frequency : null,
        frequencyNote: parsed.frequencyNote ? String(parsed.frequencyNote).slice(0, 120) : null,
        prescriber: parsed.prescriber ? String(parsed.prescriber).slice(0, 80) : null,
        indication: parsed.indication ? String(parsed.indication).slice(0, 120) : null,
        pharmacy: parsed.pharmacy ? String(parsed.pharmacy).slice(0, 100) : null,
        pharmacyPhone: parsed.pharmacyPhone ? String(parsed.pharmacyPhone).slice(0, 30) : null,
        notes: parsed.notes ? String(parsed.notes).slice(0, 300) : null,
        status: validStatuses.includes(parsed.status ?? "") ? parsed.status : "active",
        confidence: parsed.confidence ?? "low",
        reasoning: (parsed.reasoning ?? "").slice(0, 300),
        disclaimer: "Smart Scribe-extracted from image \u2014 please review all fields before saving."
      };
    })
  }),
  // Health voice parsing endpoints
  health: router({
    /**
     * Transcribes a voice recording and parses it to extract blood glucose data.
     * Returns: { transcript, glucoseMgDl, unit, context, note, confidence, reasoning, disclaimer }
     */
    parseVoiceBloodSugar: publicProcedure.input(z4.object({
      audioBase64: z4.string(),
      mimeType: z4.enum(["audio/m4a", "audio/wav", "audio/webm", "audio/mpeg", "audio/mp4"]).default("audio/m4a")
    })).mutation(async ({ input }) => {
      const base64Data = input.audioBase64.replace(/^data:[^;]+;base64,/, "");
      const audioBuffer = Buffer.from(base64Data, "base64");
      const ext = input.mimeType.split("/")[1] ?? "m4a";
      const suffix = Math.random().toString(36).slice(2, 8);
      const fileKey = `health-voice/bs-${Date.now()}-${suffix}.${ext}`;
      const { url: audioUrl } = await storagePut(fileKey, audioBuffer, input.mimeType);
      const transcriptionResult = await transcribeAudio({
        audioUrl,
        prompt: "Blood glucose reading, blood sugar level, mg/dL, mmol/L, fasting, post-meal, bedtime"
      });
      const transcript = "text" in transcriptionResult ? transcriptionResult.text ?? "" : "";
      if (!transcript.trim()) {
        return {
          transcript: "",
          glucoseMgDl: null,
          unit: "mg/dL",
          context: "random",
          note: "",
          confidence: "low",
          reasoning: "No speech detected in the recording.",
          disclaimer: "Smart estimates only \u2014 please verify before saving."
        };
      }
      const systemPrompt = [
        "You are a clinical data entry assistant. A user has verbally stated their blood glucose reading.",
        "Extract the following from their statement and return a JSON object:",
        "- glucoseMgDl: the glucose value converted to mg/dL (integer). If they said mmol/L, multiply by 18.0182 and round.",
        "- unit: the unit the user stated \u2014 either 'mg/dL' or 'mmol/L'. Default to 'mg/dL' if unclear.",
        "- context: one of 'fasting', 'post-meal', 'random', 'bedtime'. Infer from context clues (e.g. 'before breakfast' = fasting, 'after lunch' = post-meal). Default to 'random'.",
        "- note: any additional notes the user mentioned (max 80 chars, empty string if none).",
        "- confidence: 'high' if a clear numeric value was stated, 'medium' if approximate, 'low' if unclear.",
        "- reasoning: one sentence explaining your interpretation.",
        "If no numeric glucose value was mentioned, set glucoseMgDl to null."
      ].join("\n");
      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: `User said: "${transcript}"` }
      ];
      const response = await invokeLLM({ messages, response_format: { type: "json_object" } });
      const raw = String(response.choices[0].message.content);
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error("LLM returned invalid JSON: " + raw);
      }
      return {
        transcript,
        glucoseMgDl: parsed.glucoseMgDl != null ? Math.max(0, Math.round(parsed.glucoseMgDl)) : null,
        unit: parsed.unit ?? "mg/dL",
        context: parsed.context ?? "random",
        note: (parsed.note ?? "").slice(0, 80),
        confidence: parsed.confidence ?? "low",
        reasoning: (parsed.reasoning ?? "").slice(0, 200),
        disclaimer: "Smart estimates only \u2014 please verify before saving."
      };
    }),
    /**
     * Transcribes a voice recording and parses it to extract vital signs data.
     * Returns: { transcript, systolic, diastolic, heartRate, spo2, temperature, respiratoryRate, note, confidence, reasoning, disclaimer }
     */
    parseVoiceVitals: publicProcedure.input(z4.object({
      audioBase64: z4.string(),
      mimeType: z4.enum(["audio/m4a", "audio/wav", "audio/webm", "audio/mpeg", "audio/mp4"]).default("audio/m4a")
    })).mutation(async ({ input }) => {
      const base64Data = input.audioBase64.replace(/^data:[^;]+;base64,/, "");
      const audioBuffer = Buffer.from(base64Data, "base64");
      const ext = input.mimeType.split("/")[1] ?? "m4a";
      const suffix = Math.random().toString(36).slice(2, 8);
      const fileKey = `health-voice/vs-${Date.now()}-${suffix}.${ext}`;
      const { url: audioUrl } = await storagePut(fileKey, audioBuffer, input.mimeType);
      const transcriptionResult = await transcribeAudio({
        audioUrl,
        prompt: "Blood pressure, heart rate, oxygen saturation, SpO2, temperature, respiratory rate, systolic, diastolic, mmHg, bpm"
      });
      const transcript = "text" in transcriptionResult ? transcriptionResult.text ?? "" : "";
      if (!transcript.trim()) {
        return {
          transcript: "",
          systolic: null,
          diastolic: null,
          heartRate: null,
          spo2: null,
          temperature: null,
          respiratoryRate: null,
          note: "",
          confidence: "low",
          reasoning: "No speech detected in the recording.",
          disclaimer: "Smart estimates only \u2014 please verify before saving."
        };
      }
      const systemPrompt = [
        "You are a clinical data entry assistant. A user has verbally stated their vital signs.",
        "Extract the following from their statement and return a JSON object:",
        "- systolic: systolic blood pressure in mmHg (integer, or null if not mentioned).",
        "- diastolic: diastolic blood pressure in mmHg (integer, or null if not mentioned). Often stated as 'X over Y' where Y is diastolic.",
        "- heartRate: heart rate in bpm (integer, or null if not mentioned).",
        "- spo2: oxygen saturation as a percentage 0-100 (number, or null if not mentioned).",
        "- temperature: body temperature in Fahrenheit (number, or null if not mentioned). If stated in Celsius, convert to Fahrenheit.",
        "- respiratoryRate: respiratory rate in breaths per minute (integer, or null if not mentioned).",
        "- note: any additional notes the user mentioned (max 80 chars, empty string if none).",
        "- confidence: 'high' if clear numeric values were stated, 'medium' if some values are approximate, 'low' if mostly unclear.",
        "- reasoning: one sentence explaining your interpretation.",
        "Common speech patterns: '120 over 80' = systolic 120, diastolic 80. 'Pulse of 72' = heartRate 72. 'O2 sat 98' = spo2 98."
      ].join("\n");
      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: `User said: "${transcript}"` }
      ];
      const response = await invokeLLM({ messages, response_format: { type: "json_object" } });
      const raw = String(response.choices[0].message.content);
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error("LLM returned invalid JSON: " + raw);
      }
      const clamp = (v, min, max) => v != null ? Math.min(max, Math.max(min, Math.round(v))) : null;
      return {
        transcript,
        systolic: clamp(parsed.systolic, 50, 300),
        diastolic: clamp(parsed.diastolic, 30, 200),
        heartRate: clamp(parsed.heartRate, 20, 300),
        spo2: parsed.spo2 != null ? Math.min(100, Math.max(50, Math.round(parsed.spo2))) : null,
        temperature: parsed.temperature != null ? Math.round(parsed.temperature * 10) / 10 : null,
        respiratoryRate: clamp(parsed.respiratoryRate, 4, 60),
        note: (parsed.note ?? "").slice(0, 80),
        confidence: parsed.confidence ?? "low",
        reasoning: (parsed.reasoning ?? "").slice(0, 200),
        disclaimer: "Smart estimates only \u2014 please verify before saving."
      };
    }),
    /**
     * Parses a plain-text transcript (from Apple Speech / SFSpeechRecognizer) to extract vital signs.
     * No audio upload required — transcript is produced on-device by SFSpeechRecognizer.
     * Returns same shape as parseVoiceVitals.
     */
    parseVitalsTranscript: publicProcedure.input(z4.object({
      transcript: z4.string()
    })).mutation(async ({ input }) => {
      const transcript = input.transcript.trim();
      if (!transcript) {
        return {
          transcript: "",
          systolic: null,
          diastolic: null,
          heartRate: null,
          spo2: null,
          temperature: null,
          respiratoryRate: null,
          note: "",
          confidence: "low",
          reasoning: "No transcript provided.",
          disclaimer: "Smart estimates only \u2014 please verify before saving."
        };
      }
      const systemPrompt = [
        "You are a clinical data entry assistant. A user has verbally stated their vital signs.",
        "Extract the following from their statement and return a JSON object:",
        "- systolic: systolic blood pressure in mmHg (integer, or null if not mentioned).",
        "- diastolic: diastolic blood pressure in mmHg (integer, or null if not mentioned). Often stated as 'X over Y' where Y is diastolic.",
        "- heartRate: heart rate in bpm (integer, or null if not mentioned).",
        "- spo2: oxygen saturation as a percentage 0-100 (number, or null if not mentioned).",
        "- temperature: body temperature in Fahrenheit (number, or null if not mentioned). If stated in Celsius, convert to Fahrenheit.",
        "- respiratoryRate: respiratory rate in breaths per minute (integer, or null if not mentioned).",
        "- note: any additional notes the user mentioned (max 80 chars, empty string if none).",
        "- confidence: 'high' if clear numeric values were stated, 'medium' if some values are approximate, 'low' if mostly unclear.",
        "- reasoning: one sentence explaining your interpretation.",
        "Common speech patterns: '120 over 80' = systolic 120, diastolic 80. 'Pulse of 72' = heartRate 72. 'O2 sat 98' = spo2 98."
      ].join("\n");
      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: `User said: "${transcript}"` }
      ];
      const response = await invokeLLM({ messages, response_format: { type: "json_object" } });
      const raw = String(response.choices[0].message.content);
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error("LLM returned invalid JSON: " + raw);
      }
      const clamp2 = (v, min, max) => v != null ? Math.min(max, Math.max(min, Math.round(v))) : null;
      return {
        transcript,
        systolic: clamp2(parsed.systolic, 50, 300),
        diastolic: clamp2(parsed.diastolic, 30, 200),
        heartRate: clamp2(parsed.heartRate, 20, 300),
        spo2: parsed.spo2 != null ? Math.min(100, Math.max(50, Math.round(parsed.spo2))) : null,
        temperature: parsed.temperature != null ? Math.round(parsed.temperature * 10) / 10 : null,
        respiratoryRate: clamp2(parsed.respiratoryRate, 4, 60),
        note: (parsed.note ?? "").slice(0, 80),
        confidence: parsed.confidence ?? "low",
        reasoning: (parsed.reasoning ?? "").slice(0, 200),
        disclaimer: "Smart estimates only \u2014 please verify before saving."
      };
    }),
    /**
     * Parses a spoken multi-vital transcript into all sections at once:
     * BP, weight, blood sugar, sleep (REM/Core/Deep/Awake), and HRV.
     */
    parseAllVitalsTranscript: publicProcedure.input(z4.object({ transcript: z4.string() })).mutation(async ({ input }) => {
      const transcript = input.transcript.trim();
      if (!transcript) {
        return {
          transcript: "",
          bp: null,
          weight: null,
          bloodSugar: null,
          sleep: null,
          hrv: null,
          confidence: "low",
          reasoning: "No transcript provided.",
          disclaimer: "Smart estimates only \u2014 please verify before saving."
        };
      }
      const systemPrompt = [
        "You are a clinical data entry assistant. A user has verbally stated multiple vital signs in one sentence.",
        "Extract ALL of the following from their statement and return a single JSON object:",
        "",
        "bp: { systolic: integer mmHg, diastolic: integer mmHg } or null if blood pressure not mentioned.",
        "weight: { weightKg: number, weightLbs: number, unit: 'kg'|'lbs' } or null if weight not mentioned. Convert between units as needed.",
        "bloodSugar: { valueMgDl: number, valueMmol: number, context: 'fasting'|'post-meal'|'random'|'bedtime' } or null if blood sugar not mentioned. Default context 'random'. 1 mmol/L = 18.016 mg/dL.",
        "sleep: { totalMinutes: integer, remMinutes: integer, coreMinutes: integer, deepMinutes: integer, awakeMinutes: integer } or null if sleep not mentioned. If only total hours mentioned, estimate: REM=20%, deep=15%, core=50%, awake=15% (round to nearest 5).",
        "hrv: { sdnn: integer ms, context: 'morning'|'night'|'post-exercise'|'resting' } or null if HRV not mentioned. Default context 'morning'.",
        "confidence: 'high' if clear numeric values were stated for most sections, 'medium' if some values are approximate, 'low' if mostly unclear.",
        "reasoning: one sentence explaining your interpretation of all sections.",
        "",
        "Common speech patterns: 'BP 130 over 85' = bp.systolic 130, bp.diastolic 85. 'weight 150 pounds' = weight.weightLbs 150. 'sugar 102 fasting' = bloodSugar.valueMgDl 102, context fasting. 'slept 7 hours' = sleep.totalMinutes 420. 'HRV 52' = hrv.sdnn 52.",
        "Return ONLY valid JSON, no markdown."
      ].join("\n");
      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: `User said: "${transcript}"` }
      ];
      const response = await invokeLLM({ messages, response_format: { type: "json_object" } });
      const raw = String(response.choices[0].message.content);
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error("LLM returned invalid JSON: " + raw);
      }
      const clamp = (v, min, max) => v != null ? Math.min(max, Math.max(min, Math.round(v))) : null;
      const clampF = (v, min, max) => v != null ? Math.min(max, Math.max(min, v)) : null;
      return {
        transcript,
        bp: parsed.bp ? {
          systolic: clamp(parsed.bp.systolic, 50, 300) ?? 0,
          diastolic: clamp(parsed.bp.diastolic, 30, 200) ?? 0
        } : null,
        weight: parsed.weight ? {
          weightKg: clampF(parsed.weight.weightKg, 10, 500) ?? 0,
          weightLbs: clampF(parsed.weight.weightLbs, 22, 1100) ?? 0,
          unit: parsed.weight.unit === "kg" ? "kg" : "lbs"
        } : null,
        bloodSugar: parsed.bloodSugar ? {
          valueMgDl: clampF(parsed.bloodSugar.valueMgDl, 20, 800) ?? 0,
          valueMmol: clampF(parsed.bloodSugar.valueMmol, 1, 45) ?? 0,
          context: ["fasting", "post-meal", "random", "bedtime"].includes(parsed.bloodSugar.context) ? parsed.bloodSugar.context : "random"
        } : null,
        sleep: parsed.sleep ? {
          totalMinutes: clamp(parsed.sleep.totalMinutes, 0, 1440) ?? 0,
          remMinutes: clamp(parsed.sleep.remMinutes, 0, 600) ?? 0,
          coreMinutes: clamp(parsed.sleep.coreMinutes, 0, 900) ?? 0,
          deepMinutes: clamp(parsed.sleep.deepMinutes, 0, 600) ?? 0,
          awakeMinutes: clamp(parsed.sleep.awakeMinutes, 0, 300) ?? 0
        } : null,
        hrv: parsed.hrv ? {
          sdnn: clamp(parsed.hrv.sdnn, 1, 300) ?? 0,
          context: ["morning", "night", "post-exercise", "resting"].includes(parsed.hrv.context) ? parsed.hrv.context : "morning"
        } : null,
        confidence: parsed.confidence ?? "low",
        reasoning: (parsed.reasoning ?? "").slice(0, 300),
        disclaimer: "Smart estimates only \u2014 please verify before saving."
      };
    }),
    /**
     * Transcribes a voice recording and parses it to extract body weight.
     * Returns: { transcript, weightKg, weightLbs, unit, note, confidence, reasoning, disclaimer }
     */
    parseVoiceWeight: publicProcedure.input(z4.object({
      audioBase64: z4.string(),
      mimeType: z4.enum(["audio/m4a", "audio/wav", "audio/webm", "audio/mpeg", "audio/mp4"]).default("audio/m4a")
    })).mutation(async ({ input }) => {
      const base64Data = input.audioBase64.replace(/^data:[^;]+;base64,/, "");
      const audioBuffer = Buffer.from(base64Data, "base64");
      const ext = input.mimeType.split("/")[1] ?? "m4a";
      const suffix = Math.random().toString(36).slice(2, 8);
      const fileKey = `health-voice/wt-${Date.now()}-${suffix}.${ext}`;
      const { url: audioUrl } = await storagePut(fileKey, audioBuffer, input.mimeType);
      const transcriptionResult = await transcribeAudio({
        audioUrl,
        prompt: "Body weight, kilograms, kg, pounds, lbs, stone, weight reading"
      });
      const transcript = "text" in transcriptionResult ? transcriptionResult.text ?? "" : "";
      if (!transcript.trim()) {
        return {
          transcript: "",
          weightKg: null,
          weightLbs: null,
          unit: "lbs",
          note: "",
          confidence: "low",
          reasoning: "No speech detected in the recording.",
          disclaimer: "Smart estimates only \u2014 please verify before saving."
        };
      }
      const systemPrompt = [
        "You are a clinical data entry assistant. A user has verbally stated their body weight.",
        "Extract the following from their statement and return a JSON object:",
        "- weightKg: the weight value in kilograms (number with 1 decimal place, or null if not determinable).",
        "- weightLbs: the weight value in pounds (number with 1 decimal place, or null if not determinable).",
        "  If the user stated kg, convert to lbs (multiply by 2.20462). If lbs, convert to kg (divide by 2.20462).",
        "  If the user stated stone, convert: 1 stone = 6.35029 kg.",
        "- unit: the unit the user stated \u2014 'kg' or 'lbs'. Default to 'lbs' if unclear.",
        "- note: any additional notes the user mentioned (max 80 chars, empty string if none).",
        "- confidence: 'high' if a clear numeric value was stated, 'medium' if approximate, 'low' if unclear.",
        "- reasoning: one sentence explaining your interpretation.",
        "If no numeric weight value was mentioned, set both weightKg and weightLbs to null."
      ].join("\n");
      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: `User said: "${transcript}"` }
      ];
      const response = await invokeLLM({ messages, response_format: { type: "json_object" } });
      const raw = String(response.choices[0].message.content);
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error("LLM returned invalid JSON: " + raw);
      }
      const roundOne = (v) => v != null ? Math.round(v * 10) / 10 : null;
      return {
        transcript,
        weightKg: roundOne(parsed.weightKg),
        weightLbs: roundOne(parsed.weightLbs),
        unit: parsed.unit ?? "lbs",
        note: (parsed.note ?? "").slice(0, 80),
        confidence: parsed.confidence ?? "low",
        reasoning: (parsed.reasoning ?? "").slice(0, 200),
        disclaimer: "Smart estimates only \u2014 please verify before saving."
      };
    }),
    /**
     * Parses a voice transcript to extract medical history condition data.
     * Returns: { condition, icdCode, diagnosedDate, status, treatingPhysician, notes, confidence, disclaimer }
     */
    parseMedicalHistoryTranscript: publicProcedure.input(z4.object({
      transcript: z4.string()
    })).mutation(async ({ input }) => {
      const systemPrompt = [
        "You are a clinical data entry assistant. A patient has verbally described a medical condition or diagnosis.",
        "Extract every piece of medical history information from their statement and return a JSON object.",
        "Return ONLY a JSON object with these fields (use null for any field not mentioned):",
        "- condition: the medical condition or diagnosis name, e.g. 'Type 2 Diabetes Mellitus', 'Hypertension', 'Asthma' (string or null)",
        "- icdCode: the ICD-10 code if mentioned or clearly implied, e.g. 'E11' for T2DM, 'I10' for hypertension (string or null)",
        "- diagnosedDate: the date of diagnosis in YYYY-MM-DD format if mentioned (string or null). If only a year is mentioned, use YYYY-01-01.",
        "- status: one of exactly: 'active', 'resolved', 'chronic', 'in_remission'. Infer from context \u2014 'I had it but it's gone' = 'resolved', 'I manage it daily' = 'chronic', 'it's under control' = 'in_remission'. Default to 'active'.",
        "- treatingPhysician: doctor or specialist name if mentioned (string or null)",
        "- notes: any additional personal notes, symptoms, or context mentioned (string or null)",
        "- confidence: 'high' if condition name is clearly stated, 'medium' if inferred, 'low' if very unclear.",
        "- reasoning: one sentence explaining what you extracted and any assumptions made.",
        "Do not invent information not present in the transcript."
      ].join("\n");
      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Patient said: "${input.transcript}"` }
      ];
      const response = await invokeLLM({
        messages,
        response_format: { type: "json_object" }
      });
      const raw = String(response.choices[0].message.content);
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error("LLM returned invalid JSON: " + raw);
      }
      const validStatuses = ["active", "resolved", "chronic", "in_remission"];
      return {
        condition: parsed.condition ? String(parsed.condition).slice(0, 120) : null,
        icdCode: parsed.icdCode ? String(parsed.icdCode).slice(0, 20) : null,
        diagnosedDate: parsed.diagnosedDate ? String(parsed.diagnosedDate).slice(0, 10) : null,
        status: validStatuses.includes(parsed.status ?? "") ? parsed.status : "active",
        treatingPhysician: parsed.treatingPhysician ? String(parsed.treatingPhysician).slice(0, 80) : null,
        notes: parsed.notes ? String(parsed.notes).slice(0, 300) : null,
        confidence: parsed.confidence ?? "low",
        reasoning: (parsed.reasoning ?? "").slice(0, 300),
        disclaimer: "Smart Scribe-extracted \u2014 please review all fields before saving."
      };
    }),
    /**
     * Parses a voice transcript to extract surgical history procedure data.
     * Returns: { procedure, cptCode, surgeryDate, surgeryType, surgeon, facility, anesthesia, complications, notes, confidence, disclaimer }
     */
    parseSurgicalHistoryTranscript: publicProcedure.input(z4.object({
      transcript: z4.string()
    })).mutation(async ({ input }) => {
      const systemPrompt = [
        "You are a clinical data entry assistant. A patient has verbally described a surgical procedure they had.",
        "Extract every piece of surgical history information from their statement and return a JSON object.",
        "Return ONLY a JSON object with these fields (use null for any field not mentioned):",
        "- procedure: the surgical procedure name, e.g. 'Appendectomy', 'Coronary Artery Bypass Graft', 'Knee Replacement' (string or null)",
        "- cptCode: the CPT procedure code if mentioned (string or null)",
        "- surgeryDate: the date of surgery in YYYY-MM-DD format if mentioned (string or null). If only a year is mentioned, use YYYY-01-01.",
        "- surgeryType: one of exactly: 'elective', 'emergency', 'diagnostic', 'reconstructive', 'other'. Infer from context \u2014 'emergency surgery' = 'emergency', 'scheduled' = 'elective', 'biopsy' = 'diagnostic'. Default to 'elective'.",
        "- surgeon: surgeon or doctor name if mentioned (string or null)",
        "- facility: hospital or surgical center name if mentioned (string or null)",
        "- anesthesia: one of exactly: 'general', 'regional', 'local', 'sedation', or null. Infer from context.",
        "- complications: any post-surgical complications mentioned (string or null)",
        "- notes: any additional personal notes or context mentioned (string or null)",
        "- confidence: 'high' if procedure name is clearly stated, 'medium' if inferred, 'low' if very unclear.",
        "- reasoning: one sentence explaining what you extracted and any assumptions made.",
        "Do not invent information not present in the transcript."
      ].join("\n");
      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Patient said: "${input.transcript}"` }
      ];
      const response = await invokeLLM({
        messages,
        response_format: { type: "json_object" }
      });
      const raw = String(response.choices[0].message.content);
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error("LLM returned invalid JSON: " + raw);
      }
      const validTypes = ["elective", "emergency", "diagnostic", "reconstructive", "other"];
      const validAnesthesia = ["general", "regional", "local", "sedation"];
      return {
        procedure: parsed.procedure ? String(parsed.procedure).slice(0, 120) : null,
        cptCode: parsed.cptCode ? String(parsed.cptCode).slice(0, 20) : null,
        surgeryDate: parsed.surgeryDate ? String(parsed.surgeryDate).slice(0, 10) : null,
        surgeryType: validTypes.includes(parsed.surgeryType ?? "") ? parsed.surgeryType : "elective",
        surgeon: parsed.surgeon ? String(parsed.surgeon).slice(0, 80) : null,
        facility: parsed.facility ? String(parsed.facility).slice(0, 100) : null,
        anesthesia: validAnesthesia.includes(parsed.anesthesia ?? "") ? parsed.anesthesia : null,
        complications: parsed.complications ? String(parsed.complications).slice(0, 200) : null,
        notes: parsed.notes ? String(parsed.notes).slice(0, 300) : null,
        confidence: parsed.confidence ?? "low",
        reasoning: (parsed.reasoning ?? "").slice(0, 300),
        disclaimer: "Smart Scribe-extracted \u2014 please review all fields before saving."
      };
    }),
    /**
     * Parses a voice recording to extract appointment data.
     * Transcribes with Whisper, then parses the transcript with the LLM.
     * Returns: { doctorName, specialty, dateTime, location, notes, referredBy, confidence, reasoning, disclaimer }
     */
    parseVoiceAppointment: publicProcedure.input(z4.object({
      audioBase64: z4.string(),
      mimeType: z4.enum(["audio/m4a", "audio/wav", "audio/webm", "audio/mpeg", "audio/mp4"]).default("audio/m4a")
    })).mutation(async ({ input }) => {
      const base64Data = input.audioBase64.replace(/^data:[^;]+;base64,/, "");
      const audioBuffer = Buffer.from(base64Data, "base64");
      const ext = input.mimeType.split("/")[1] ?? "m4a";
      const fileKey = `voice-scribe/appointment-${Date.now()}.${ext}`;
      const { url: audioUrl } = await storagePut(fileKey, audioBuffer, input.mimeType);
      const transcriptionResult = await transcribeAudio({
        audioUrl,
        prompt: "Doctor appointment, specialist, clinic, date, time, location, referred by, prep notes"
      });
      if ("error" in transcriptionResult) throw new Error(transcriptionResult.error);
      const transcript = transcriptionResult.text;
      const systemPrompt = [
        "You are a clinical data entry assistant. A patient has verbally described a doctor appointment.",
        "Extract every piece of appointment information from their statement and return a JSON object.",
        "Return ONLY a JSON object with these fields (use null for any field not mentioned):",
        "- doctorName: the doctor's last name only (without 'Dr.' prefix), e.g. 'Smith', 'Johnson' (string or null)",
        "- specialty: the medical specialty or clinic type, e.g. 'Cardiology', 'Primary Care', 'Endocrinology' (string or null)",
        "- dateTime: the appointment date and time in ISO 8601 format (YYYY-MM-DDTHH:MM:SS), or null if not mentioned. If only a date is mentioned, use T09:00:00. If only a time is mentioned, use today's date.",
        "- location: the clinic name, hospital, or address if mentioned (string or null)",
        "- notes: any prep instructions, fasting requirements, or other notes mentioned (string or null)",
        "- referredBy: the referring doctor's name if mentioned (string or null)",
        "- confidence: 'high' if doctor name and date are clearly stated, 'medium' if partially inferred, 'low' if very unclear.",
        "- reasoning: one sentence explaining what you extracted and any assumptions made.",
        "Do not invent information not present in the transcript."
      ].join("\n");
      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Patient said: "${transcript}"` }
      ];
      const response = await invokeLLM({
        messages,
        response_format: { type: "json_object" }
      });
      const raw = String(response.choices[0].message.content);
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error("LLM returned invalid JSON: " + raw);
      }
      return {
        transcript,
        doctorName: parsed.doctorName ? String(parsed.doctorName).replace(/^Dr\.?\s*/i, "").slice(0, 80) : null,
        specialty: parsed.specialty ? String(parsed.specialty).slice(0, 80) : null,
        dateTime: parsed.dateTime ? String(parsed.dateTime).slice(0, 30) : null,
        location: parsed.location ? String(parsed.location).slice(0, 150) : null,
        notes: parsed.notes ? String(parsed.notes).slice(0, 300) : null,
        referredBy: parsed.referredBy ? String(parsed.referredBy).slice(0, 80) : null,
        confidence: parsed.confidence ?? "low",
        reasoning: (parsed.reasoning ?? "").slice(0, 300),
        disclaimer: "Smart Scribe-extracted \u2014 please review all fields before saving."
      };
    }),
    /**
     * Parses a text transcript of a spoken appointment description.
     * Used by Apple Speech mode (on-device transcription) — no audio upload needed.
     * Returns same shape as parseVoiceAppointment minus { transcript }.
     */
    parseAppointmentTranscript: publicProcedure.input(z4.object({ transcript: z4.string() })).mutation(async ({ input }) => {
      const { transcript } = input;
      const systemPrompt = [
        "You are a clinical data entry assistant. A patient has verbally described a doctor appointment.",
        "Extract every piece of appointment information from their statement and return a JSON object.",
        "Return ONLY a JSON object with these fields (use null for any field not mentioned):",
        "- doctorName: the doctor's last name only (without 'Dr.' prefix), e.g. 'Smith', 'Johnson' (string or null)",
        "- specialty: the medical specialty or clinic type, e.g. 'Cardiology', 'Primary Care', 'Endocrinology' (string or null)",
        "- dateTime: the appointment date and time in ISO 8601 format (YYYY-MM-DDTHH:MM:SS), or null if not mentioned. If only a date is mentioned, use T09:00:00. If only a time is mentioned, use today's date.",
        "- location: the clinic name, hospital, or address if mentioned (string or null)",
        "- notes: any prep instructions, fasting requirements, or other notes mentioned (string or null)",
        "- referredBy: the referring doctor's name if mentioned (string or null)",
        "- confidence: 'high' if doctor name and date are clearly stated, 'medium' if partially inferred, 'low' if very unclear.",
        "- reasoning: one sentence explaining what you extracted and any assumptions made.",
        "Do not invent information not present in the transcript."
      ].join("\n");
      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Patient said: "${transcript}"` }
      ];
      const response = await invokeLLM({ messages, response_format: { type: "json_object" } });
      const raw = String(response.choices[0].message.content);
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error("LLM returned invalid JSON: " + raw);
      }
      return {
        transcript,
        doctorName: parsed.doctorName ? String(parsed.doctorName).replace(/^Dr\.?\s*/i, "").slice(0, 80) : null,
        specialty: parsed.specialty ? String(parsed.specialty).slice(0, 80) : null,
        dateTime: parsed.dateTime ? String(parsed.dateTime).slice(0, 30) : null,
        location: parsed.location ? String(parsed.location).slice(0, 150) : null,
        notes: parsed.notes ? String(parsed.notes).slice(0, 300) : null,
        referredBy: parsed.referredBy ? String(parsed.referredBy).slice(0, 80) : null,
        confidence: parsed.confidence ?? "low",
        reasoning: (parsed.reasoning ?? "").slice(0, 300),
        disclaimer: "Smart Scribe-extracted \u2014 please review all fields before saving."
      };
    }),
    /**
     * Parses a voice recording to extract medical history condition data.
     * Transcribes with Whisper, then parses the transcript with the LLM.
     * Returns same shape as parseMedicalHistoryTranscript plus { transcript }
     */
    parseMedicalHistoryVoice: publicProcedure.input(z4.object({
      audioBase64: z4.string(),
      mimeType: z4.enum(["audio/m4a", "audio/wav", "audio/webm", "audio/mpeg", "audio/mp4"]).default("audio/m4a")
    })).mutation(async ({ input }) => {
      const base64Data = input.audioBase64.replace(/^data:[^;]+;base64,/, "");
      const audioBuffer = Buffer.from(base64Data, "base64");
      const ext = input.mimeType.split("/")[1] ?? "m4a";
      const fileKey = `voice-scribe/medical-history-${Date.now()}.${ext}`;
      const { url: audioUrl } = await storagePut(fileKey, audioBuffer, input.mimeType);
      const transcriptionResult = await transcribeAudio({
        audioUrl,
        prompt: "Medical condition, diagnosis, ICD code, date diagnosed, treating physician, status, personal notes"
      });
      if ("error" in transcriptionResult) throw new Error(transcriptionResult.error);
      const transcript = transcriptionResult.text;
      const systemPrompt = [
        "You are a clinical data entry assistant. A patient has verbally described a medical condition or diagnosis.",
        "Extract every piece of medical history information from their statement and return a JSON object.",
        "Return ONLY a JSON object with these fields (use null for any field not mentioned):",
        "- condition: the medical condition or diagnosis name, e.g. 'Type 2 Diabetes Mellitus', 'Hypertension', 'Asthma' (string or null)",
        "- icdCode: the ICD-10 code if mentioned or clearly implied (string or null)",
        "- diagnosedDate: the date of diagnosis in YYYY-MM-DD format if mentioned (string or null). If only a year is mentioned, use YYYY-01-01.",
        "- status: one of exactly: 'active', 'resolved', 'chronic', 'in_remission'. Default to 'active'.",
        "- treatingPhysician: doctor or specialist name if mentioned (string or null)",
        "- notes: any additional personal notes, symptoms, or context mentioned (string or null)",
        "- confidence: 'high' if condition name is clearly stated, 'medium' if inferred, 'low' if very unclear.",
        "- reasoning: one sentence explaining what you extracted and any assumptions made.",
        "Do not invent information not present in the transcript."
      ].join("\n");
      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Patient said: "${transcript}"` }
      ];
      const response = await invokeLLM({ messages, response_format: { type: "json_object" } });
      const raw = String(response.choices[0].message.content);
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error("LLM returned invalid JSON: " + raw);
      }
      const validStatuses = ["active", "resolved", "chronic", "in_remission"];
      return {
        transcript,
        condition: parsed.condition ? String(parsed.condition).slice(0, 120) : null,
        icdCode: parsed.icdCode ? String(parsed.icdCode).slice(0, 20) : null,
        diagnosedDate: parsed.diagnosedDate ? String(parsed.diagnosedDate).slice(0, 10) : null,
        status: validStatuses.includes(parsed.status ?? "") ? parsed.status : "active",
        treatingPhysician: parsed.treatingPhysician ? String(parsed.treatingPhysician).slice(0, 80) : null,
        notes: parsed.notes ? String(parsed.notes).slice(0, 300) : null,
        confidence: parsed.confidence ?? "low",
        reasoning: (parsed.reasoning ?? "").slice(0, 300),
        disclaimer: "Smart Scribe-extracted \u2014 please review all fields before saving."
      };
    }),
    /**
     * Parses a voice recording to extract surgical history procedure data.
     * Transcribes with Whisper, then parses the transcript with the LLM.
     * Returns same shape as parseSurgicalHistoryTranscript plus { transcript }
     */
    parseSurgicalHistoryVoice: publicProcedure.input(z4.object({
      audioBase64: z4.string(),
      mimeType: z4.enum(["audio/m4a", "audio/wav", "audio/webm", "audio/mpeg", "audio/mp4"]).default("audio/m4a")
    })).mutation(async ({ input }) => {
      const base64Data = input.audioBase64.replace(/^data:[^;]+;base64,/, "");
      const audioBuffer = Buffer.from(base64Data, "base64");
      const ext = input.mimeType.split("/")[1] ?? "m4a";
      const fileKey = `voice-scribe/surgical-history-${Date.now()}.${ext}`;
      const { url: audioUrl } = await storagePut(fileKey, audioBuffer, input.mimeType);
      const transcriptionResult = await transcribeAudio({
        audioUrl,
        prompt: "Surgical procedure, CPT code, date of surgery, surgeon, hospital, anesthesia, complications, personal notes"
      });
      if ("error" in transcriptionResult) throw new Error(transcriptionResult.error);
      const transcript = transcriptionResult.text;
      const systemPrompt = [
        "You are a clinical data entry assistant. A patient has verbally described a surgical procedure they had.",
        "Extract every piece of surgical history information from their statement and return a JSON object.",
        "Return ONLY a JSON object with these fields (use null for any field not mentioned):",
        "- procedure: the surgical procedure name, e.g. 'Appendectomy', 'Coronary Artery Bypass Graft' (string or null)",
        "- cptCode: the CPT procedure code if mentioned (string or null)",
        "- surgeryDate: the date of surgery in YYYY-MM-DD format if mentioned (string or null). If only a year is mentioned, use YYYY-01-01.",
        "- surgeryType: one of exactly: 'elective', 'emergency', 'diagnostic', 'reconstructive', 'other'. Default to 'elective'.",
        "- surgeon: surgeon or doctor name if mentioned (string or null)",
        "- facility: hospital or surgical center name if mentioned (string or null)",
        "- anesthesia: one of exactly: 'general', 'regional', 'local', 'sedation', or null.",
        "- complications: any post-surgical complications mentioned (string or null)",
        "- notes: any additional personal notes or context mentioned (string or null)",
        "- confidence: 'high' if procedure name is clearly stated, 'medium' if inferred, 'low' if very unclear.",
        "- reasoning: one sentence explaining what you extracted and any assumptions made.",
        "Do not invent information not present in the transcript."
      ].join("\n");
      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Patient said: "${transcript}"` }
      ];
      const response = await invokeLLM({ messages, response_format: { type: "json_object" } });
      const raw = String(response.choices[0].message.content);
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error("LLM returned invalid JSON: " + raw);
      }
      const validTypes = ["elective", "emergency", "diagnostic", "reconstructive", "other"];
      const validAnesthesia = ["general", "regional", "local", "sedation"];
      return {
        transcript,
        procedure: parsed.procedure ? String(parsed.procedure).slice(0, 120) : null,
        cptCode: parsed.cptCode ? String(parsed.cptCode).slice(0, 20) : null,
        surgeryDate: parsed.surgeryDate ? String(parsed.surgeryDate).slice(0, 10) : null,
        surgeryType: validTypes.includes(parsed.surgeryType ?? "") ? parsed.surgeryType : "elective",
        surgeon: parsed.surgeon ? String(parsed.surgeon).slice(0, 80) : null,
        facility: parsed.facility ? String(parsed.facility).slice(0, 100) : null,
        anesthesia: validAnesthesia.includes(parsed.anesthesia ?? "") ? parsed.anesthesia : null,
        complications: parsed.complications ? String(parsed.complications).slice(0, 200) : null,
        notes: parsed.notes ? String(parsed.notes).slice(0, 300) : null,
        confidence: parsed.confidence ?? "low",
        reasoning: (parsed.reasoning ?? "").slice(0, 300),
        disclaimer: "Smart Scribe-extracted \u2014 please review all fields before saving."
      };
    }),
    /**
     * Voice Smart Scribe for Medical ID (allergies, conditions, medications, notes).
     * Transcribes audio and extracts structured Medical ID fields.
     */
    parseVoiceMedicalID: publicProcedure.input(z4.object({
      audioBase64: z4.string(),
      mimeType: z4.enum(["audio/m4a", "audio/wav", "audio/webm", "audio/mpeg", "audio/mp4"]).default("audio/m4a")
    })).mutation(async ({ input }) => {
      const base64Data = input.audioBase64.replace(/^data:[^;]+;base64,/, "");
      const audioBuffer = Buffer.from(base64Data, "base64");
      const ext = input.mimeType.split("/")[1] ?? "m4a";
      const fileKey = `voice-scribe/medical-id-${Date.now()}.${ext}`;
      const { url: audioUrl } = await storagePut(fileKey, audioBuffer, input.mimeType);
      const transcriptionResult = await transcribeAudio({
        audioUrl,
        prompt: "Allergies, medical conditions, current medications, organ donor status, notes for first responders"
      });
      if ("error" in transcriptionResult) throw new Error(transcriptionResult.error);
      const transcript = transcriptionResult.text;
      const systemPrompt = [
        "You are a clinical data entry assistant. A patient is dictating their Medical ID information for a health app.",
        "Extract every piece of medical identity information from their statement and return a JSON object.",
        "Return ONLY a JSON object with these fields (use null for any field not mentioned):",
        "- allergies: comma-separated list of allergens (e.g. 'Penicillin, Peanuts, Latex') or null",
        "- conditions: comma-separated list of medical conditions (e.g. 'Type 2 Diabetes, Hypertension') or null",
        "- medications: comma-separated list of current medications with doses if mentioned (e.g. 'Metformin 500mg, Lisinopril 10mg') or null",
        "- notes: any additional notes for first responders (e.g. 'wears contact lenses, has pacemaker') or null",
        "- confidence: 'high' if allergies or conditions are clearly stated, 'medium' if partially inferred, 'low' if very unclear.",
        "- reasoning: one sentence explaining what you extracted and any assumptions made.",
        "Do not invent information not present in the transcript."
      ].join("\n");
      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Patient said: "${transcript}"` }
      ];
      const response = await invokeLLM({ messages, response_format: { type: "json_object" } });
      const raw = String(response.choices[0].message.content);
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error("LLM returned invalid JSON: " + raw);
      }
      return {
        transcript,
        allergies: parsed.allergies ? String(parsed.allergies).slice(0, 300) : null,
        conditions: parsed.conditions ? String(parsed.conditions).slice(0, 300) : null,
        medications: parsed.medications ? String(parsed.medications).slice(0, 300) : null,
        notes: parsed.notes ? String(parsed.notes).slice(0, 300) : null,
        confidence: parsed.confidence ?? "low",
        reasoning: (parsed.reasoning ?? "").slice(0, 300),
        disclaimer: "Smart Scribe-extracted \u2014 please review all fields before saving."
      };
    }),
    /**
     * Parses a plain-text transcript (from Apple Speech / SFSpeechRecognizer) to extract Medical ID data.
     * Identical LLM logic to parseVoiceMedicalID but skips the Whisper transcription step.
     * Returns: { transcript, allergies, conditions, medications, notes, confidence, reasoning, disclaimer }
     */
    parseVoiceMedicalIDTranscript: publicProcedure.input(z4.object({ transcript: z4.string() })).mutation(async ({ input }) => {
      const transcript = input.transcript.trim();
      if (!transcript) {
        return {
          transcript: "",
          allergies: null,
          conditions: null,
          medications: null,
          notes: null,
          confidence: "low",
          reasoning: "No transcript provided.",
          disclaimer: "Smart Scribe-extracted \u2014 please review all fields before saving."
        };
      }
      const systemPrompt = [
        "You are a clinical data entry assistant. A patient is dictating their Medical ID information for a health app.",
        "Extract every piece of medical identity information from their statement and return a JSON object.",
        "Return ONLY a JSON object with these fields (use null for any field not mentioned):",
        "- allergies: comma-separated list of allergens (e.g. 'Penicillin, Peanuts, Latex') or null",
        "- conditions: comma-separated list of medical conditions (e.g. 'Type 2 Diabetes, Hypertension') or null",
        "- medications: comma-separated list of current medications with doses if mentioned (e.g. 'Metformin 500mg, Lisinopril 10mg') or null",
        "- notes: any additional notes for first responders (e.g. 'wears contact lenses, has pacemaker') or null",
        "- confidence: 'high' if allergies or conditions are clearly stated, 'medium' if partially inferred, 'low' if very unclear.",
        "- reasoning: one sentence explaining what you extracted and any assumptions made.",
        "Do not invent information not present in the transcript."
      ].join("\n");
      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Patient said: "${transcript}"` }
      ];
      const response = await invokeLLM({ messages, response_format: { type: "json_object" } });
      const raw = String(response.choices[0].message.content);
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error("LLM returned invalid JSON: " + raw);
      }
      return {
        transcript,
        allergies: parsed.allergies ? String(parsed.allergies).slice(0, 300) : null,
        conditions: parsed.conditions ? String(parsed.conditions).slice(0, 300) : null,
        medications: parsed.medications ? String(parsed.medications).slice(0, 300) : null,
        notes: parsed.notes ? String(parsed.notes).slice(0, 300) : null,
        confidence: parsed.confidence ?? "low",
        reasoning: (parsed.reasoning ?? "").slice(0, 300),
        disclaimer: "Smart Scribe-extracted \u2014 please review all fields before saving."
      };
    }),
    /**
     * Parses a plain-text transcript (from Apple Speech / SFSpeechRecognizer) to extract immunization data.
     * Identical LLM logic to parseImmunizationVoice but skips the Whisper transcription step.
     * Returns same shape as parseImmunizationVoice plus { transcript }
     */
    parseImmunizationTranscript: publicProcedure.input(z4.object({ transcript: z4.string() })).mutation(async ({ input }) => {
      const transcript = input.transcript.trim();
      if (!transcript) {
        return {
          transcript: "",
          vaccineName: null,
          vaccineType: null,
          manufacturer: null,
          lotNumber: null,
          dateAdministered: null,
          doseNumber: null,
          seriesTotal: null,
          nextDoseDate: null,
          administeredBy: null,
          site: null,
          route: null,
          reactions: null,
          notes: null,
          confidence: "low",
          reasoning: "No transcript provided.",
          filledCount: 0,
          totalFields: 13,
          vaccines: [],
          isBatch: false,
          disclaimer: "Smart Scribe-extracted \u2014 please review all fields before saving."
        };
      }
      const systemPrompt = [
        "You are a clinical data entry assistant. A patient is verbally describing their vaccination history.",
        "Extract every vaccine mentioned and return a JSON object with a top-level key 'vaccines' containing an ARRAY of vaccine objects.",
        "Each vaccine object has these fields (use null for any field not mentioned):",
        "- vaccineName: vaccine name e.g. 'Influenza (Flu)', 'COVID-19 mRNA', 'Tdap', 'Shingrix' (string or null)",
        "- vaccineType: e.g. 'mRNA', 'Live attenuated', 'Inactivated', 'Subunit' (string or null)",
        "- manufacturer: e.g. 'Pfizer-BioNTech', 'Moderna' (string or null)",
        "- lotNumber: lot or batch number (string or null)",
        "- dateAdministered: YYYY-MM-DD format, infer year if not stated (string or null)",
        "- doseNumber: which dose in series e.g. 1, 2 (number or null)",
        "- seriesTotal: total doses in series e.g. 2 (number or null)",
        "- nextDoseDate: YYYY-MM-DD for next dose/booster (string or null)",
        "- administeredBy: clinic or provider name (string or null)",
        "- site: one of 'left_arm','right_arm','left_thigh','right_thigh','other' or null",
        "- route: one of 'intramuscular','subcutaneous','oral','intranasal','intradermal','other' or null",
        "- reactions: adverse reactions mentioned (string or null)",
        "- notes: additional notes (string or null)",
        "- confidence: 'high' if vaccine name clear, 'medium' if inferred, 'low' if unclear",
        "- reasoning: one sentence explaining extraction",
        'Example: { "vaccines": [ { "vaccineName": "Flu", ... }, { "vaccineName": "COVID-19", ... } ] }'
      ].join("\n");
      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Patient said: "${transcript}"` }
      ];
      const response = await invokeLLM({ messages, response_format: { type: "json_object" } });
      const raw = String(response.choices[0].message.content);
      let parsedRoot;
      try {
        parsedRoot = JSON.parse(raw);
      } catch {
        throw new Error("LLM returned invalid JSON: " + raw);
      }
      const parsedList = Array.isArray(parsedRoot.vaccines) && parsedRoot.vaccines.length > 0 ? parsedRoot.vaccines : [parsedRoot];
      const validSites = ["left_arm", "right_arm", "left_thigh", "right_thigh", "other"];
      const validRoutes = ["intramuscular", "subcutaneous", "oral", "intranasal", "intradermal", "other"];
      const fields = ["vaccineName", "vaccineType", "manufacturer", "lotNumber", "dateAdministered", "doseNumber", "seriesTotal", "nextDoseDate", "administeredBy", "site", "route", "reactions", "notes"];
      const vaccines = parsedList.map((parsed) => {
        const filledCount = fields.filter((f) => parsed[f] !== null && parsed[f] !== void 0).length;
        return {
          vaccineName: parsed.vaccineName ? String(parsed.vaccineName).slice(0, 120) : null,
          vaccineType: parsed.vaccineType ? String(parsed.vaccineType).slice(0, 60) : null,
          manufacturer: parsed.manufacturer ? String(parsed.manufacturer).slice(0, 80) : null,
          lotNumber: parsed.lotNumber ? String(parsed.lotNumber).slice(0, 40) : null,
          dateAdministered: parsed.dateAdministered ? String(parsed.dateAdministered).slice(0, 10) : null,
          doseNumber: typeof parsed.doseNumber === "number" ? parsed.doseNumber : null,
          seriesTotal: typeof parsed.seriesTotal === "number" ? parsed.seriesTotal : null,
          nextDoseDate: parsed.nextDoseDate ? String(parsed.nextDoseDate).slice(0, 10) : null,
          administeredBy: parsed.administeredBy ? String(parsed.administeredBy).slice(0, 100) : null,
          site: validSites.includes(parsed.site ?? "") ? parsed.site : null,
          route: validRoutes.includes(parsed.route ?? "") ? parsed.route : null,
          reactions: parsed.reactions ? String(parsed.reactions).slice(0, 200) : null,
          notes: parsed.notes ? String(parsed.notes).slice(0, 300) : null,
          confidence: parsed.confidence ?? "low",
          reasoning: (parsed.reasoning ?? "").slice(0, 300),
          filledCount,
          totalFields: fields.length
        };
      });
      const first = vaccines[0];
      return {
        transcript,
        ...first,
        vaccines,
        isBatch: vaccines.length > 1,
        disclaimer: "Smart Scribe-extracted \u2014 please review all fields before saving."
      };
    }),
    /**
     * Meal IQ: Analyze the physiological impact of a meal on vitals logged 1-4 hours later.
     * Returns: { insight, bpImpact, hrImpact, glucoseImpact, sodiumSensitive, glycemicLoad, naKRatio, fiberCarbRatio, disclaimer }
     */
    analyzeMealImpact: publicProcedure.input(z4.object({
      meal: z4.object({
        name: z4.string().optional(),
        sodiumMg: z4.number(),
        potassiumMg: z4.number().optional(),
        carbsG: z4.number().optional(),
        fiberG: z4.number().optional(),
        proteinG: z4.number().optional(),
        fatG: z4.number().optional(),
        calories: z4.number().optional(),
        timestamp: z4.string()
      }),
      vitalsAfter: z4.array(z4.object({
        type: z4.enum(["bloodPressure", "heartRate", "bloodSugar"]),
        value: z4.string(),
        timestamp: z4.string(),
        minutesAfterMeal: z4.number()
      })).optional(),
      vitalsBefore: z4.array(z4.object({
        type: z4.enum(["bloodPressure", "heartRate", "bloodSugar"]),
        value: z4.string(),
        timestamp: z4.string()
      })).optional()
    })).mutation(async ({ input }) => {
      const { meal, vitalsAfter = [], vitalsBefore = [] } = input;
      const naKRatio = meal.potassiumMg && meal.potassiumMg > 0 ? Math.round(meal.sodiumMg / meal.potassiumMg * 100) / 100 : null;
      const fiberCarbRatio = meal.carbsG && meal.carbsG > 0 && meal.fiberG != null ? Math.round(meal.fiberG / meal.carbsG * 100) / 100 : null;
      const systemPrompt = [
        "You are a clinical nutrition and cardiovascular health analyst.",
        "Analyze the physiological impact of the described meal based on its nutritional content and any vital signs recorded before and after eating.",
        "Return ONLY a JSON object with these fields:",
        "- insight: a 1-2 sentence 'Meal IQ' clinical insight starting with 'Meal IQ:'. Be specific about the physiological mechanism. Examples:",
        "  'Meal IQ: Your BP rose 12mmHg after this high-sodium meal. You may be Sodium Sensitive.'",
        "  'Meal IQ: This meal had a high Glycemic Load, correlating with your 3:00 PM fatigue.'",
        "  'Meal IQ: Excellent Na:K ratio of 0.6 \u2014 this meal actively supports blood pressure control.'",
        "- bpImpact: 'elevated' | 'neutral' | 'beneficial' | 'unknown' \u2014 based on sodium content and BP readings",
        "- hrImpact: 'elevated' | 'neutral' | 'beneficial' | 'unknown' \u2014 based on meal composition and HR readings",
        "- glucoseImpact: 'high' | 'moderate' | 'low' | 'unknown' \u2014 glycemic impact based on carbs and fiber",
        "- sodiumSensitive: true if BP rose >8mmHg after a high-sodium meal, false otherwise, null if unknown",
        "- glycemicLoad: 'high' | 'moderate' | 'low' | 'unknown' \u2014 based on carbs and fiber ratio",
        "- keyNutrient: the single most clinically significant nutrient in this meal (e.g. 'sodium', 'fiber', 'refined carbs')",
        "- recommendation: one short actionable recommendation (max 15 words)",
        "Use clinical evidence. The Na:K ratio is a stronger predictor of hypertension than sodium alone.",
        "High fiber-to-carb ratio (>0.15) modulates the glucose curve and reduces insulin spikes."
      ].join("\n");
      const mealDesc = [
        meal.name ? `Meal: ${meal.name}` : "Unnamed meal",
        `Sodium: ${meal.sodiumMg}mg`,
        meal.potassiumMg ? `Potassium: ${meal.potassiumMg}mg` : null,
        meal.carbsG != null ? `Carbs: ${meal.carbsG}g` : null,
        meal.fiberG != null ? `Fiber: ${meal.fiberG}g` : null,
        meal.proteinG != null ? `Protein: ${meal.proteinG}g` : null,
        meal.fatG != null ? `Fat: ${meal.fatG}g` : null,
        meal.calories != null ? `Calories: ${meal.calories}kcal` : null,
        naKRatio != null ? `Na:K ratio: ${naKRatio}` : null,
        fiberCarbRatio != null ? `Fiber:Carb ratio: ${fiberCarbRatio}` : null
      ].filter(Boolean).join(", ");
      const vitalsDesc = [
        vitalsBefore.length > 0 ? `Before meal: ${vitalsBefore.map((v) => `${v.type}=${v.value}`).join(", ")}` : null,
        vitalsAfter.length > 0 ? `After meal (${vitalsAfter.map((v) => `${v.minutesAfterMeal}min: ${v.type}=${v.value}`).join(", ")})` : null
      ].filter(Boolean).join(" | ");
      const userMessage = vitalsDesc ? `${mealDesc}. Vital signs: ${vitalsDesc}` : mealDesc;
      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ];
      const response = await invokeLLM({
        messages,
        response_format: { type: "json_object" }
      });
      const raw = String(response.choices[0].message.content);
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error("LLM returned invalid JSON: " + raw);
      }
      return {
        insight: String(parsed.insight ?? "").slice(0, 400),
        bpImpact: ["elevated", "neutral", "beneficial", "unknown"].includes(parsed.bpImpact ?? "") ? parsed.bpImpact : "unknown",
        hrImpact: ["elevated", "neutral", "beneficial", "unknown"].includes(parsed.hrImpact ?? "") ? parsed.hrImpact : "unknown",
        glucoseImpact: ["high", "moderate", "low", "unknown"].includes(parsed.glucoseImpact ?? "") ? parsed.glucoseImpact : "unknown",
        sodiumSensitive: typeof parsed.sodiumSensitive === "boolean" ? parsed.sodiumSensitive : null,
        glycemicLoad: ["high", "moderate", "low", "unknown"].includes(parsed.glycemicLoad ?? "") ? parsed.glycemicLoad : "unknown",
        keyNutrient: String(parsed.keyNutrient ?? "").slice(0, 50),
        recommendation: String(parsed.recommendation ?? "").slice(0, 100),
        naKRatio,
        fiberCarbRatio,
        disclaimer: "Meal IQ is an Smart-generated nutritional analysis for informational purposes only. Consult a registered dietitian for personalized dietary advice."
      };
    }),
    /**
     * Voice Smart Scribe for Immunization Records.
     */
    parseImmunizationVoice: publicProcedure.input(z4.object({
      audioBase64: z4.string(),
      mimeType: z4.enum(["audio/m4a", "audio/wav", "audio/webm", "audio/mpeg", "audio/mp4"]).default("audio/m4a")
    })).mutation(async ({ input }) => {
      const base64Data = input.audioBase64.replace(/^data:[^;]+;base64,/, "");
      const audioBuffer = Buffer.from(base64Data, "base64");
      const ext = input.mimeType.split("/")[1] ?? "m4a";
      const fileKey = `voice-scribe/immunization-${Date.now()}.${ext}`;
      const { url: audioUrl } = await storagePut(fileKey, audioBuffer, input.mimeType);
      const transcriptionResult = await transcribeAudio({
        audioUrl,
        prompt: "Vaccine name, manufacturer, lot number, date administered, dose number, series, next dose date, clinic, site, route, reactions, notes"
      });
      if ("error" in transcriptionResult) throw new Error(transcriptionResult.error);
      const transcript = transcriptionResult.text;
      const systemPrompt = [
        "You are a clinical data entry assistant. Extract immunization information from the patient's statement.",
        "The patient may mention ONE or MULTIPLE vaccines in a single recording.",
        "Return ONLY a JSON object with a top-level key 'vaccines' containing an ARRAY of vaccine objects.",
        "Each vaccine object has these fields (use null for any field not mentioned):",
        "- vaccineName: vaccine name e.g. 'Influenza (Flu)', 'COVID-19 mRNA', 'Tdap', 'Shingrix' (string or null)",
        "- vaccineType: e.g. 'mRNA', 'Live attenuated', 'Inactivated', 'Subunit' (string or null)",
        "- manufacturer: e.g. 'Pfizer-BioNTech', 'Moderna' (string or null)",
        "- lotNumber: lot or batch number (string or null)",
        "- dateAdministered: YYYY-MM-DD format, infer year if not stated (string or null)",
        "- doseNumber: which dose in series e.g. 1, 2 (number or null)",
        "- seriesTotal: total doses in series e.g. 2 (number or null)",
        "- nextDoseDate: YYYY-MM-DD for next dose/booster (string or null)",
        "- administeredBy: clinic or provider name (string or null)",
        "- site: one of 'left_arm','right_arm','left_thigh','right_thigh','other' or null",
        "- route: one of 'intramuscular','subcutaneous','oral','intranasal','intradermal','other' or null",
        "- reactions: adverse reactions mentioned (string or null)",
        "- notes: additional notes (string or null)",
        "- confidence: 'high' if vaccine name clear, 'medium' if inferred, 'low' if unclear",
        "- reasoning: one sentence explaining extraction",
        'Example: { "vaccines": [ { "vaccineName": "Flu", ... }, { "vaccineName": "COVID-19", ... } ] }'
      ].join("\n");
      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Patient said: "${transcript}"` }
      ];
      const response = await invokeLLM({ messages, response_format: { type: "json_object" } });
      const raw = String(response.choices[0].message.content);
      let parsedRoot;
      try {
        parsedRoot = JSON.parse(raw);
      } catch {
        throw new Error("LLM returned invalid JSON: " + raw);
      }
      const parsedList = Array.isArray(parsedRoot.vaccines) && parsedRoot.vaccines.length > 0 ? parsedRoot.vaccines : [parsedRoot];
      const validSites = ["left_arm", "right_arm", "left_thigh", "right_thigh", "other"];
      const validRoutes = ["intramuscular", "subcutaneous", "oral", "intranasal", "intradermal", "other"];
      const fields = ["vaccineName", "vaccineType", "manufacturer", "lotNumber", "dateAdministered", "doseNumber", "seriesTotal", "nextDoseDate", "administeredBy", "site", "route", "reactions", "notes"];
      const vaccines = parsedList.map((parsed) => {
        const filledCount = fields.filter((f) => parsed[f] !== null && parsed[f] !== void 0).length;
        return {
          vaccineName: parsed.vaccineName ? String(parsed.vaccineName).slice(0, 120) : null,
          vaccineType: parsed.vaccineType ? String(parsed.vaccineType).slice(0, 60) : null,
          manufacturer: parsed.manufacturer ? String(parsed.manufacturer).slice(0, 80) : null,
          lotNumber: parsed.lotNumber ? String(parsed.lotNumber).slice(0, 40) : null,
          dateAdministered: parsed.dateAdministered ? String(parsed.dateAdministered).slice(0, 10) : null,
          doseNumber: typeof parsed.doseNumber === "number" ? parsed.doseNumber : null,
          seriesTotal: typeof parsed.seriesTotal === "number" ? parsed.seriesTotal : null,
          nextDoseDate: parsed.nextDoseDate ? String(parsed.nextDoseDate).slice(0, 10) : null,
          administeredBy: parsed.administeredBy ? String(parsed.administeredBy).slice(0, 100) : null,
          site: validSites.includes(parsed.site ?? "") ? parsed.site : null,
          route: validRoutes.includes(parsed.route ?? "") ? parsed.route : null,
          reactions: parsed.reactions ? String(parsed.reactions).slice(0, 200) : null,
          notes: parsed.notes ? String(parsed.notes).slice(0, 300) : null,
          confidence: parsed.confidence ?? "low",
          reasoning: (parsed.reasoning ?? "").slice(0, 300),
          filledCount,
          totalFields: fields.length
        };
      });
      const first = vaccines[0];
      return {
        transcript,
        ...first,
        // Batch result: all vaccines parsed from the recording
        vaccines,
        isBatch: vaccines.length > 1,
        disclaimer: "Smart Scribe-extracted \u2014 please review all fields before saving."
      };
    }),
    /**
     * Parses a spoken sleep transcript (Apple SFSpeechRecognizer) into structured sleep data.
     */
    parseSleepTranscript: publicProcedure.input(z4.object({ transcript: z4.string() })).mutation(async ({ input }) => {
      const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      const systemPrompt = [
        "You are a health data entry assistant. A user has verbally described their sleep.",
        "Extract the following and return a JSON object:",
        "- bedtime: ISO 8601 datetime (use today if only time given, yesterday if 'last night'). null if not mentioned.",
        "- wakeTime: ISO 8601 datetime. If earlier than bedtime, assume next calendar day. null if not mentioned.",
        "- deepMins: deep sleep in minutes (integer or null).",
        "- remMins: REM sleep in minutes (integer or null).",
        "- coreMins: core/light sleep in minutes (integer or null).",
        "- awakeMins: time awake during night in minutes (integer or null).",
        "- quality: 1-5 score (1=terrible,3=okay,5=great). Infer from descriptive words. Default 3.",
        "- note: any extra notes (max 80 chars, empty string if none).",
        "- confidence: 'high' if bedtime+wakeTime clear, 'medium' if inferred, 'low' if unclear.",
        "- reasoning: one sentence explanation.",
        `Today is ${today}.`
      ].join("\n");
      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: `User said: "${input.transcript}"` }
      ];
      const response = await invokeLLM({ messages, response_format: { type: "json_object" } });
      const raw = String(response.choices[0].message.content);
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error("LLM returned invalid JSON: " + raw);
      }
      return {
        transcript: input.transcript,
        bedtime: parsed.bedtime ?? null,
        wakeTime: parsed.wakeTime ?? null,
        deepMins: parsed.deepMins != null ? Math.max(0, Math.round(parsed.deepMins)) : null,
        remMins: parsed.remMins != null ? Math.max(0, Math.round(parsed.remMins)) : null,
        coreMins: parsed.coreMins != null ? Math.max(0, Math.round(parsed.coreMins)) : null,
        awakeMins: parsed.awakeMins != null ? Math.max(0, Math.round(parsed.awakeMins)) : null,
        quality: Math.min(5, Math.max(1, Math.round(parsed.quality ?? 3))),
        note: (parsed.note ?? "").slice(0, 80),
        confidence: parsed.confidence ?? "low",
        reasoning: (parsed.reasoning ?? "").slice(0, 300),
        disclaimer: "Smart estimates only \u2014 please review all fields before saving."
      };
    }),
    /**
     * Accepts a base64-encoded photo of a vaccine card or prescription.
     * Uploads to S3, uses vision LLM to extract vaccine details and fill the form.
     */
    parseImmunizationPhoto: publicProcedure.input(z4.object({
      imageBase64: z4.string(),
      mimeType: z4.enum(["image/jpeg", "image/png", "image/webp"]).default("image/jpeg")
    })).mutation(async ({ input }) => {
      const base64Data = input.imageBase64.replace(/^data:image\/\w+;base64,/, "");
      const imageBuffer = Buffer.from(base64Data, "base64");
      const suffix = Math.random().toString(36).slice(2, 8);
      const fileKey = `vaccine-photos/${Date.now()}-${suffix}.jpg`;
      const { url: imageUrl } = await storagePut(fileKey, imageBuffer, input.mimeType);
      const systemPrompt = [
        "You are a medical records assistant. The user photographed a vaccine card, immunization record, or prescription.",
        "Extract vaccine details and return a JSON object (null for anything not visible):",
        "- vaccineName: full vaccine name (string or null)",
        "- vaccineType: e.g. 'mRNA', 'Inactivated', 'Subunit' (string or null)",
        "- manufacturer: e.g. 'Pfizer-BioNTech', 'Moderna', 'Merck' (string or null)",
        "- lotNumber: lot/batch number (string or null)",
        "- dateAdministered: ISO 8601 date YYYY-MM-DD (string or null)",
        "- doseNumber: dose number in series (integer or null)",
        "- seriesTotal: total doses in series (integer or null)",
        "- nextDoseDate: ISO 8601 date for next dose (string or null)",
        "- administeredBy: clinic or provider name (string or null)",
        "- site: injection site e.g. 'Left deltoid' (string or null)",
        "- route: e.g. 'IM', 'SC', 'Oral' (string or null)",
        "- reactions: noted reactions (string or null)",
        "- notes: other relevant notes (string or null)",
        "- confidence: 'high' if vaccine name+date clearly readable, 'medium' if partial, 'low' if unclear",
        "- reasoning: one sentence about what you read.",
        "If not a vaccine card/medical record, set confidence to 'low' and all vaccine fields to null."
      ].join("\n");
      const messages = [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: "Read this vaccine card or immunization record and extract the details." },
            { type: "image_url", image_url: { url: imageUrl, detail: "high" } }
          ]
        }
      ];
      const response = await invokeLLM({ messages, response_format: { type: "json_object" } });
      const raw = String(response.choices[0].message.content);
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error("LLM returned invalid JSON: " + raw);
      }
      return {
        vaccineName: parsed.vaccineName ? String(parsed.vaccineName).slice(0, 120) : null,
        vaccineType: parsed.vaccineType ? String(parsed.vaccineType).slice(0, 60) : null,
        manufacturer: parsed.manufacturer ? String(parsed.manufacturer).slice(0, 80) : null,
        lotNumber: parsed.lotNumber ? String(parsed.lotNumber).slice(0, 40) : null,
        dateAdministered: parsed.dateAdministered ?? null,
        doseNumber: parsed.doseNumber != null ? Math.max(1, Math.round(parsed.doseNumber)) : null,
        seriesTotal: parsed.seriesTotal != null ? Math.max(1, Math.round(parsed.seriesTotal)) : null,
        nextDoseDate: parsed.nextDoseDate ?? null,
        administeredBy: parsed.administeredBy ? String(parsed.administeredBy).slice(0, 100) : null,
        site: parsed.site ? String(parsed.site).slice(0, 60) : null,
        route: parsed.route ? String(parsed.route).slice(0, 40) : null,
        reactions: parsed.reactions ? String(parsed.reactions).slice(0, 200) : null,
        notes: parsed.notes ? String(parsed.notes).slice(0, 200) : null,
        confidence: parsed.confidence ?? "low",
        reasoning: (parsed.reasoning ?? "").slice(0, 300),
        disclaimer: "Smart Scribe-extracted from photo \u2014 please review all fields before saving."
      };
    }),
    /**
     * Parses a typed/dictated allergy transcript into structured AllergyRecord fields.
     * Handles: allergen name, category, reaction, severity, onset date, notes.
     */
    parseAllergyTranscript: publicProcedure.input(z4.object({ transcript: z4.string() })).mutation(async ({ input }) => {
      const transcript = input.transcript.trim();
      if (!transcript) {
        return {
          transcript: "",
          systolic: null,
          diastolic: null,
          heartRate: null,
          hrv: null,
          spo2: null,
          temperature: null,
          respiratoryRate: null,
          weight: null,
          steps: null,
          sleepHours: null,
          note: null,
          confidence: "low",
          reasoning: "No transcript provided.",
          filledCount: 0,
          totalFields: 11
        };
      }
      const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      const systemPrompt = [
        "You are a clinical data entry assistant. A patient is dictating their vital signs.",
        "Extract every vital sign value and return a JSON object.",
        "Return ONLY a JSON object with these fields (use null for any field not mentioned):",
        "- systolic: systolic blood pressure in mmHg (integer, e.g. 120)",
        "- diastolic: diastolic blood pressure in mmHg (integer, e.g. 80)",
        "- heartRate: heart rate / pulse in bpm (integer)",
        "- hrv: heart rate variability in ms (integer, or null)",
        "- spo2: blood oxygen saturation as a percentage 0-100 (number, e.g. 98.5)",
        "- temperature: body temperature in Fahrenheit (number, e.g. 98.6). Convert Celsius to Fahrenheit if needed.",
        "- respiratoryRate: respiratory rate in breaths per minute (integer)",
        "- weight: body weight in pounds (number). Convert kg to lbs if needed.",
        "- steps: step count for the day (integer)",
        "- sleepHours: hours of sleep last night (number, e.g. 7.5)",
        "- note: any additional notes or context the patient mentioned (string or null)",
        "- confidence: 'high' if multiple vitals clearly stated, 'medium' if partially inferred, 'low' if very unclear",
        "- reasoning: one sentence explaining what you extracted and any assumptions made",
        "Do not invent values not present in the transcript.",
        `Today is ${today}.`
      ].join("\n");
      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Patient said: "${transcript}"` }
      ];
      const response = await invokeLLM({ messages, response_format: { type: "json_object" } });
      const raw = String(response.choices[0].message.content);
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error("LLM returned invalid JSON: " + raw);
      }
      const toNum = (v) => {
        const n = Number(v);
        return v !== null && v !== void 0 && v !== "" && !isNaN(n) ? n : null;
      };
      const filledCount = [
        parsed.systolic,
        parsed.diastolic,
        parsed.heartRate,
        parsed.hrv,
        parsed.spo2,
        parsed.temperature,
        parsed.respiratoryRate,
        parsed.weight,
        parsed.steps,
        parsed.sleepHours,
        parsed.note
      ].filter((v) => v !== null && v !== void 0).length;
      return {
        transcript,
        systolic: toNum(parsed.systolic),
        diastolic: toNum(parsed.diastolic),
        heartRate: toNum(parsed.heartRate),
        hrv: toNum(parsed.hrv),
        spo2: toNum(parsed.spo2),
        temperature: toNum(parsed.temperature),
        respiratoryRate: toNum(parsed.respiratoryRate),
        weight: toNum(parsed.weight),
        steps: toNum(parsed.steps),
        sleepHours: toNum(parsed.sleepHours),
        note: parsed.note ? String(parsed.note).slice(0, 300) : null,
        confidence: ["high", "medium", "low"].includes(parsed.confidence ?? "") ? parsed.confidence : "low",
        reasoning: (parsed.reasoning ?? "").slice(0, 300),
        filledCount,
        totalFields: 11
      };
    }),
    /**
     * Parses a free-text activity dictation and extracts structured activity fields.
     * Returns: { activityType, duration, distance, distanceUnit, steps, calories, avgHR, maxHR, note, confidence, reasoning, filledCount, totalFields }
     */
    parseActivityTranscript: publicProcedure.input(z4.object({ transcript: z4.string() })).mutation(async ({ input }) => {
      const { transcript } = input;
      const today = (/* @__PURE__ */ new Date()).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
      const systemPrompt = [
        "You are a clinical data entry assistant. A user is dictating an activity/exercise log entry.",
        "Extract every activity field and return a JSON object.",
        "Return ONLY a JSON object with these fields (use null for any field not mentioned):",
        "- activityType: one of 'running', 'walking', 'cycling', 'swimming', 'strength', 'yoga', 'hiit', 'sports', 'other' (string)",
        "- duration: duration in minutes (integer)",
        "- distance: distance value as a number (e.g. 5.2). Convert to the unit the user stated.",
        "- distanceUnit: 'km' or 'mi' (string, infer from context or default to 'km')",
        "- steps: step count (integer, or null)",
        "- calories: calories burned (integer, or null)",
        "- avgHR: average heart rate in bpm (integer, or null)",
        "- maxHR: maximum heart rate in bpm (integer, or null)",
        "- note: any additional notes or context (string, max 200 chars, or null)",
        "- confidence: 'high' if key fields clearly stated, 'medium' if partially inferred, 'low' if very unclear",
        "- reasoning: one sentence explaining what you extracted and any assumptions made",
        "Do not invent values not present in the transcript.",
        `Today is ${today}.`
      ].join("\n");
      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: `User said: "${transcript}"` }
      ];
      const response = await invokeLLM({ messages, response_format: { type: "json_object" } });
      const raw = String(response.choices[0].message.content);
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error("LLM returned invalid JSON: " + raw);
      }
      const toNum = (v) => {
        const n = Number(v);
        return v !== null && v !== void 0 && v !== "" && !isNaN(n) ? n : null;
      };
      const validTypes = ["running", "walking", "cycling", "swimming", "strength", "yoga", "hiit", "sports", "other"];
      const filledCount = [
        parsed.activityType,
        parsed.duration,
        parsed.distance,
        parsed.steps,
        parsed.calories,
        parsed.avgHR,
        parsed.maxHR,
        parsed.note
      ].filter((v) => v !== null && v !== void 0 && v !== "").length;
      return {
        activityType: validTypes.includes(parsed.activityType ?? "") ? parsed.activityType : null,
        duration: toNum(parsed.duration),
        distance: toNum(parsed.distance),
        distanceUnit: parsed.distanceUnit === "mi" ? "mi" : "km",
        steps: toNum(parsed.steps),
        calories: toNum(parsed.calories),
        avgHR: toNum(parsed.avgHR),
        maxHR: toNum(parsed.maxHR),
        note: parsed.note ? String(parsed.note).slice(0, 200) : null,
        confidence: ["high", "medium", "low"].includes(parsed.confidence ?? "") ? parsed.confidence : "low",
        reasoning: (parsed.reasoning ?? "").slice(0, 300),
        filledCount,
        totalFields: 8
      };
    })
  }),
  // ─── Generic note transcription ───────────────────────────────────────────────────────────────────
  notes: router({
    /**
     * Transcribe a voice recording to plain text (Whisper).
     * Used by Medication and Side Effect forms for voice-dictated notes.
     * Returns { text: string }.
     */
    transcribe: publicProcedure.input(
      z4.object({
        audioBase64: z4.string(),
        mimeType: z4.enum(["audio/m4a", "audio/wav", "audio/webm", "audio/mpeg", "audio/mp4"]).default("audio/m4a"),
        language: z4.string().optional(),
        prompt: z4.string().optional()
      })
    ).mutation(async ({ input }) => {
      const base64Data = input.audioBase64.replace(/^data:[^;]+;base64,/, "");
      const audioBuffer = Buffer.from(base64Data, "base64");
      const ext = input.mimeType === "audio/m4a" || input.mimeType === "audio/mp4" ? "m4a" : input.mimeType.split("/")[1] ?? "m4a";
      const fileKey = `notes-voice/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { url: audioUrl } = await storagePut(fileKey, audioBuffer, input.mimeType);
      const result = await transcribeAudio({
        audioUrl,
        language: input.language,
        prompt: input.prompt ?? "Medical note, medication name, side effect description, health observation."
      });
      if ("error" in result) {
        const { TRPCError: TRPCError3 } = await import("@trpc/server");
        throw new TRPCError3({ code: "INTERNAL_SERVER_ERROR", message: result.error });
      }
      return { text: (result.text ?? "").trim() };
    })
  }),
  // ─── Smart Translation ───────────────────────────────────────────────────────────────────
  translation: router({
    /**
     * Translate a flat key→value string map to the target language using the LLM.
     * Returns { translations: Record<string, string> } with all original keys present.
     * Falls back to the English value for any key the LLM fails to translate.
     */
    translate: publicProcedure.input(
      z4.object({
        /** BCP-47 language tag, e.g. "ar", "pt", "de", "hi", "sw" */
        targetLang: z4.string().min(2).max(10),
        /** Human-readable language name for the prompt, e.g. "Arabic" */
        targetLangName: z4.string().min(2).max(60),
        /** Flat key→value record of English strings to translate (max 300 keys per call) */
        strings: z4.record(z4.string(), z4.string()).refine(
          (r) => Object.keys(r).length <= 300,
          { message: "Max 300 keys per translation batch" }
        )
      })
    ).mutation(async ({ input }) => {
      const { targetLang, targetLangName, strings } = input;
      const entries = Object.entries(strings);
      if (entries.length === 0) return { translations: {} };
      const messages = [
        {
          role: "system",
          content: `You are a professional medical app translator. Translate the following JSON object of UI strings from English to ${targetLangName} (BCP-47: ${targetLang}).
Rules:
1. Return ONLY a valid JSON object with the SAME keys as the input.
2. Translate every value accurately and naturally for a clinical health app.
3. Preserve any placeholders like {name}, {value}, {unit}, %d, %s exactly as-is.
4. Keep medical terms precise (e.g. "systolic", "diastolic", "HbA1c", "DASH diet", "mmHg", "mg/dL").
5. Output ONLY the JSON object \u2014 no markdown, no explanations, no extra keys.`
        },
        {
          role: "user",
          content: JSON.stringify(strings)
        }
      ];
      const response = await invokeLLM({ messages, response_format: { type: "json_object" } });
      const raw = String(response.choices[0].message.content);
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error("Translation LLM returned invalid JSON: " + raw.slice(0, 200));
      }
      const result = {};
      for (const [key, englishVal] of entries) {
        result[key] = typeof parsed[key] === "string" && parsed[key].length > 0 ? parsed[key] : englishVal;
      }
      return { translations: result };
    })
  }),
  // end translation router
  // ─── Lab Tracker (OCR + Correlation) ─────────────────────────────────────────────────────────────────────────────────────
  lab: labRouter,
  medication: medicationRouter,
  // ─── Diet Report PDF Generation ─────────────────────────────────────────────────────────────────────────────────────
  diet: router({
    generateReport: publicProcedure.input(z4.object({
      protocol: z4.string(),
      emoji: z4.string(),
      currentStreak: z4.number(),
      bestStreak: z4.number(),
      goalKcal: z4.number(),
      caloricAvg: z4.number(),
      fourWeekScores: z4.array(z4.object({ label: z4.string(), score: z4.number().nullable() })),
      generatedAt: z4.string()
      // ISO date string
    })).mutation(async ({ input }) => {
      const {
        protocol,
        emoji,
        currentStreak,
        bestStreak,
        goalKcal,
        caloricAvg,
        fourWeekScores,
        generatedAt
      } = input;
      const dateStr = new Date(generatedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric"
      });
      const weekRows = fourWeekScores.map((w) => `| ${w.label} | ${w.score !== null ? `${w.score}%` : "\u2014"} |`).join("\n");
      const vsGoal = caloricAvg > 0 ? (caloricAvg > goalKcal ? `+${caloricAvg - goalKcal}` : `${caloricAvg - goalKcal}`) + " kcal vs goal" : "No caloric data recorded";
      const md = [
        `# ${emoji} VitalSync Diet Report`,
        `**Generated:** ${dateStr}`,
        "",
        "---",
        "",
        "## Protocol",
        `**${protocol}**`,
        "",
        "## Streak",
        `| Metric | Value |`,
        `|--------|-------|`,
        `| Current streak | ${currentStreak} day${currentStreak !== 1 ? "s" : ""} |`,
        `| All-time best  | ${bestStreak} day${bestStreak !== 1 ? "s" : ""} |`,
        "",
        "## Caloric Trend (7-Day)",
        `| Metric | Value |`,
        `|--------|-------|`,
        `| Daily goal | ${goalKcal} kcal |`,
        `| 7-day avg  | ${caloricAvg > 0 ? caloricAvg + " kcal" : "\u2014"} |`,
        `| vs. Goal   | ${vsGoal} |`,
        "",
        "## 4-Week Compliance History",
        "| Week of | Score |",
        "|---------|-------|",
        weekRows,
        "",
        "---",
        "",
        "*This report was generated by VitalSync Personal Health Hub.*"
      ].join("\n");
      const tmpDir = os.tmpdir();
      const mdPath = path.join(tmpDir, `diet-report-${Date.now()}.md`);
      const pdfPath = path.join(tmpDir, `diet-report-${Date.now()}.pdf`);
      fs.writeFileSync(mdPath, md, "utf8");
      execSync(`manus-md-to-pdf ${mdPath} ${pdfPath}`);
      const pdfBytes = fs.readFileSync(pdfPath);
      try {
        fs.unlinkSync(mdPath);
        fs.unlinkSync(pdfPath);
      } catch {
      }
      const key = `diet-reports/${Date.now()}-report.pdf`;
      const { url } = await storagePut(key, pdfBytes, "application/pdf");
      return { url };
    })
  }),
  // Streak share card image generation
  streakShareCard: publicProcedure.input(z4.object({
    streakDays: z4.number().int().min(1),
    alignmentScore: z4.number().int().min(0).max(100),
    startDate: z4.string(),
    // e.g. "Mar 20"
    endDate: z4.string()
    // e.g. "Mar 26, 2026"
  })).mutation(async ({ input }) => {
    const { streakDays, alignmentScore, startDate, endDate } = input;
    const scoreLabel = alignmentScore >= 90 ? "Excellent" : alignmentScore >= 75 ? "Good" : alignmentScore >= 60 ? "Fair" : "Developing";
    const prompt = [
      `Create a premium health app achievement card with a dark navy (#050F19) background.`,
      `The card is portrait orientation (400x600px), with a subtle deep-space gradient.`,
      `At the top: a small glowing emerald VitalSync logo mark (abstract DNA helix or heartbeat line).`,
      `Below: the text "GOLD ZONE STREAK" in small neon cyan uppercase tracking-widest letters.`,
      `Center: a large bold "${streakDays}" in white with a golden glow, followed by "DAYS" in smaller gold text.`,
      `Below the number: a neon gold horizontal divider line.`,
      `Then: "${startDate} \u2013 ${endDate}" in muted cyan.`,
      `Then: "Alignment Score" label in small grey, and "${alignmentScore}/100" in large ${alignmentScore >= 75 ? "emerald" : "amber"} bold text with a glow.`,
      `Badge: "${scoreLabel}" in a rounded pill with ${alignmentScore >= 75 ? "emerald" : "amber"} neon border.`,
      `Bottom: small text "AMDR macro targets \xB7 45-65% carbs \xB7 15-25% protein \xB7 20-35% fat" in dim grey.`,
      `Footer: "VitalSync Personal Health Hub" in small muted text with a subtle neon green dot.`,
      `Overall aesthetic: glassmorphism, neon glow accents, premium clinical dark theme. No people, no food images.`
    ].join(" ");
    const { url: imageUrl } = await generateImage({ prompt });
    if (!imageUrl) throw new Error("Image generation returned no URL");
    const resp = await fetch(imageUrl);
    const buf = Buffer.from(await resp.arrayBuffer());
    const key = `streak-cards/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.png`;
    const { url } = await storagePut(key, buf, "image/png");
    return { url };
  })
});

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// server/_core/index.ts
var __filename_safe = typeof __filename !== "undefined" ? __filename : fileURLToPath(import.meta.url);
var __dirname_safe = path2.dirname(__filename_safe);
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}
async function findAvailablePort(startPort = 3e3) {
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
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.header("Access-Control-Allow-Origin", origin);
    }
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization"
    );
    res.header("Access-Control-Allow-Credentials", "true");
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
  app.get("/privacy", (req, res) => {
    const langParam = req.query.lang?.toLowerCase() ?? "";
    const acceptLang = (req.headers["accept-language"] ?? "").toLowerCase();
    const isZh = langParam === "zh" || langParam.startsWith("zh-") || !langParam && (acceptLang.startsWith("zh") || acceptLang.includes(",zh"));
    const file = isZh ? "../privacy-policy-zh.html" : "../privacy-policy.html";
    res.sendFile(path2.join(__dirname_safe, file));
  });
  app.get("/terms", (req, res) => {
    const langParam = req.query.lang?.toLowerCase() ?? "";
    const acceptLang = (req.headers["accept-language"] ?? "").toLowerCase();
    const isZh = langParam === "zh" || langParam.startsWith("zh-") || !langParam && (acceptLang.startsWith("zh") || acceptLang.includes(",zh"));
    const file = isZh ? "../terms-of-use-zh.html" : "../terms-of-use.html";
    res.sendFile(path2.join(__dirname_safe, file));
  });
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext
    })
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
