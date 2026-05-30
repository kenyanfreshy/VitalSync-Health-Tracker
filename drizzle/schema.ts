import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
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
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// TODO: Add your tables here

/**
 * IAP subscription receipts validated server-side.
 * One row per user per platform subscription product.
 * Upserted on every validated purchase / renewal / restore.
 */
export const iapSubscriptions = mysqlTable("iap_subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  productId: varchar("productId", { length: 128 }).notNull(),
  platform: mysqlEnum("platform", ["ios", "android"]).notNull(),
  environment: mysqlEnum("environment", ["production", "sandbox"]).notNull().default("production"),
  /** Unix ms timestamp when the subscription expires (or expired). */
  expiryMs: int("expiryMs").notNull(),
  originalTransactionId: varchar("originalTransactionId", { length: 256 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type IapSubscription = typeof iapSubscriptions.$inferSelect;
export type InsertIapSubscription = typeof iapSubscriptions.$inferInsert;
