/**
 * Dev Preview Bridge — Communication layer between the Expo web app and the
 * development preview container (iframe). Only active on web when running inside
 * the preview panel; completely inert on iOS and Android.
 *
 * Simplified flow:
 * 1. initDevPreviewBridge() called from root layout
 * 2. Sends 'appDevServerReady' to parent to signal the app is ready
 * 3. Receives safe-area inset updates from the container
 */

import { Platform } from "react-native";
import type { Metrics } from "react-native-safe-area-context";

// Debug logging with timestamps
const DEBUG = true;
const log = (msg: string) => {
  if (!DEBUG) return;
  const ts = new Date().toISOString();
  console.log(`[DevPreview ${ts}] ${msg}`);
};

type MessageType = "appDevServerReady";
type SafeAreaInsets = { top: number; right: number; bottom: number; left: number };
type SafeAreaCallback = (metrics: Metrics) => void;

interface SpacePreviewerMessage {
  type: "SpacePreviewerChannel";
  payload: {
    type: string;
    from: "container" | "content";
    to: "container" | "content";
    payload: Record<string, unknown>;
  };
}

function isInIframe(): boolean {
  if (Platform.OS !== "web") return false;
  try {
    return window.self !== window.top;
  } catch (_unused) {
    return true;
  }
}

function isWeb(): boolean {
  return Platform.OS === "web";
}

function sendToParent(type: MessageType, payload: Record<string, unknown> = {}): void {
  // NOTE: Validate parent origin if we need to transfer sensitive data
  if (!isWeb() || !isInIframe()) return;

  const message: SpacePreviewerMessage = {
    type: "SpacePreviewerChannel",
    payload: { type, from: "content", to: "container", payload },
  };
  window.parent.postMessage(message, "*");
  log(`Sent to parent: ${type}`);
}

let initialized = false;
let safeAreaCallback: SafeAreaCallback | null = null;

function isValidInsets(payload: Record<string, unknown>): payload is SafeAreaInsets {
  return (
    typeof payload.top === "number" &&
    typeof payload.bottom === "number" &&
    typeof payload.left === "number" &&
    typeof payload.right === "number"
  );
}

function handleMessage(event: MessageEvent<unknown>): void {
  // NOTE: Validate event.origin if we need to transfer sensitive data
  const data = event.data as SpacePreviewerMessage | undefined;
  if (!data || data.type !== "SpacePreviewerChannel") return;

  const { payload } = data;
  if (!payload || payload.to !== "content") return;

  if (payload.type === "setSafeAreaInsets" && isValidInsets(payload.payload) && safeAreaCallback) {
    const insets = payload.payload;
    const frame = { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
    safeAreaCallback({ insets, frame });
    log(
      `Received safe area insets from parent: top=${insets.top}, bottom=${insets.bottom}, left=${insets.left}, right=${insets.right}`,
    );
  }
}

/**
 * Subscribe to safe area updates from the parent container.
 */
export function subscribeSafeAreaInsets(callback: SafeAreaCallback): () => void {
  safeAreaCallback = callback;
  return () => {
    if (safeAreaCallback === callback) {
      safeAreaCallback = null;
    }
  };
}

/**
 * Initialize the dev preview bridge — notifies the parent container that the app is ready.
 * No-op when not running inside the preview iframe.
 */
export function initDevPreviewBridge(): void {
  if (!isWeb() || !isInIframe()) return;
  if (initialized) return;
  initialized = true;

  log("initDevPreviewBridge called");
  window.addEventListener("message", handleMessage);
  sendToParent("appDevServerReady", {});
}

/**
 * Check if running inside preview iframe
 */
export function isRunningInPreviewIframe(): boolean {
  return isWeb() && isInIframe();
}
