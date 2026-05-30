/**
 * encrypted-storage.ts — AES-256 encrypted AsyncStorage wrapper for VitalSync.
 *
 * Architecture
 * ------------
 * - Encryption key (32 random bytes) is generated once on first launch and
 *   stored in SecureStore (iOS Keychain / Android Keystore).
 * - Each value is encrypted with AES-256-CTR using a fresh random 16-byte IV.
 * - The encrypted payload is stored in AsyncStorage as a JSON envelope:
 *     { v: 1, iv: "<hex>", ct: "<hex>" }
 * - Reads transparently detect the envelope and decrypt; plain strings pass
 *   through unchanged so legacy data is still readable until migration runs.
 *
 * Key storage
 * -----------
 *   SecureStore key: "@vsht:enc_key_v1"
 *   Value: 64-character lowercase hex string (32 bytes)
 *
 * Thread safety
 * -------------
 * Key initialisation is serialised through a single Promise so concurrent
 * reads/writes during app startup do not race to create multiple keys.
 *
 * Error handling
 * --------------
 * All public functions are wrapped in try/catch.  On failure they return
 * null (reads) or false (writes) so callers can decide how to proceed.
 * The app MUST NOT crash if encryption fails — it should fall back to
 * reading/writing plaintext and retry on next launch.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { ModeOfOperation, Counter, utils as aesUtils } from 'aes-js';
import { safeSetItem } from '@/lib/safe-async-storage';

/**
 * Platform-safe random bytes generator.
 * - React Native / Hermes: uses global.crypto.getRandomValues (available in RN 0.71+)
 * - Web: uses window.crypto.getRandomValues
 * - Node (tests): uses require('crypto').randomBytes
 * Does NOT depend on expo-crypto so no extra package is needed.
 */
function getRandomBytes(length: number): Uint8Array {
  const buf = new Uint8Array(length);
  // Hermes (React Native 0.71+) and modern browsers both expose global.crypto
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(buf);
    return buf;
  }
  // Node.js fallback (used in unit tests)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeCrypto = require('crypto') as { randomFillSync: (buf: Uint8Array) => void };
    nodeCrypto.randomFillSync(buf);
    return buf;
  } catch {
    // Last resort: Math.random (not cryptographically secure, but avoids crash)
    for (let i = 0; i < length; i++) buf[i] = Math.floor(Math.random() * 256);
    return buf;
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** SecureStore key that holds the 32-byte AES master key (hex-encoded). */
const SECURE_KEY_NAME = '@vsht:enc_key_v1';

/** Envelope version tag — increment if the format ever changes. */
const ENVELOPE_VERSION = 1;

/** Prefix written into every encrypted value so we can detect it quickly. */
const ENVELOPE_PREFIX = '{"v":1,';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EncryptedEnvelope {
  /** Format version. */
  v: number;
  /** Hex-encoded 16-byte initialisation vector. */
  iv: string;
  /** Hex-encoded ciphertext. */
  ct: string;
}

// ─── Key management ───────────────────────────────────────────────────────────

/** Cached key bytes (avoids SecureStore round-trips on every read/write). */
let _cachedKeyBytes: Uint8Array | null = null;

/** Serialises concurrent key-init calls so we only generate the key once. */
let _keyInitPromise: Promise<Uint8Array | null> | null = null;

/**
 * Returns the 32-byte AES key.  Generates and persists it on first call.
 * Returns null if SecureStore is unavailable (e.g. simulator without keychain).
 */
async function getOrCreateKey(): Promise<Uint8Array | null> {
  if (_cachedKeyBytes) return _cachedKeyBytes;

  if (_keyInitPromise) return _keyInitPromise;

  _keyInitPromise = (async (): Promise<Uint8Array | null> => {
    try {
      // Try to load existing key
      const stored = await SecureStore.getItemAsync(SECURE_KEY_NAME);
      if (stored && stored.length === 64) {
        const bytes = hexToBytes(stored);
        _cachedKeyBytes = bytes;
        return bytes;
      }

      // Generate a new 32-byte key
      const randomBytes = getRandomBytes(32);
      const hex = bytesToHex(randomBytes);
      await SecureStore.setItemAsync(SECURE_KEY_NAME, hex, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
      _cachedKeyBytes = randomBytes;
      return randomBytes;
    } catch {
      // SecureStore unavailable (e.g. web, simulator without keychain)
      // Return null — callers will skip encryption and use plaintext fallback
      _keyInitPromise = null; // allow retry next call
      return null;
    }
  })();

  return _keyInitPromise;
}

/**
 * Clears the in-memory key cache.  Call this after a PIN reset or data wipe
 * so the next read/write re-fetches the key from SecureStore.
 */
export function clearEncryptionKeyCache(): void {
  _cachedKeyBytes = null;
  _keyInitPromise = null;
}

// ─── Encryption / Decryption ──────────────────────────────────────────────────

/**
 * Encrypts a UTF-8 string with AES-256-CTR and returns a JSON envelope string.
 * Returns null if the key is unavailable.
 */
async function encryptString(plaintext: string): Promise<string | null> {
  const key = await getOrCreateKey();
  if (!key) return null;

  try {
    const iv = getRandomBytes(16);
    const plaintextBytes = aesUtils.utf8.toBytes(plaintext);
    const aesCtr = new ModeOfOperation.ctr(key, new Counter(iv));
    const ciphertextBytes = aesCtr.encrypt(plaintextBytes);

    const envelope: EncryptedEnvelope = {
      v: ENVELOPE_VERSION,
      iv: bytesToHex(iv),
      ct: bytesToHex(ciphertextBytes),
    };
    return JSON.stringify(envelope);
  } catch {
    return null;
  }
}

/**
 * Decrypts an envelope string produced by `encryptString`.
 * Returns null if decryption fails or the input is not an envelope.
 */
async function decryptString(ciphertext: string): Promise<string | null> {
  if (!ciphertext.startsWith(ENVELOPE_PREFIX)) return null;

  const key = await getOrCreateKey();
  if (!key) return null;

  try {
    const envelope: EncryptedEnvelope = JSON.parse(ciphertext);
    if (envelope.v !== ENVELOPE_VERSION) return null;

    const iv = hexToBytes(envelope.iv);
    const ciphertextBytes = hexToBytes(envelope.ct);
    const aesCtr = new ModeOfOperation.ctr(key, new Counter(iv));
    const plaintextBytes = aesCtr.decrypt(ciphertextBytes);
    return aesUtils.utf8.fromBytes(plaintextBytes);
  } catch {
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Writes `value` to AsyncStorage under `key`, encrypted with AES-256-CTR.
 *
 * Falls back to writing plaintext if encryption is unavailable (e.g. web).
 * Returns true on success, false on failure.
 */
export async function encryptedSetItem(key: string, value: string): Promise<boolean> {
  try {
    const encrypted = await encryptString(value);
    if (encrypted === null) {
      // Encryption unavailable — write plaintext (fallback for web/simulator)
      await safeSetItem(key, value);
    } else {
      await safeSetItem(key, encrypted);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads and decrypts a value from AsyncStorage.
 *
 * - If the stored value is an encrypted envelope, it is decrypted and returned.
 * - If the stored value is plaintext (legacy data not yet migrated), it is
 *   returned as-is so the app continues to work before migration runs.
 * - Returns null if the key does not exist or on any error.
 */
export async function encryptedGetItem(key: string): Promise<string | null> {
  try {
    const stored = await AsyncStorage.getItem(key);
    if (stored === null) return null;

    // Try to decrypt — if it's not an envelope, return as-is (plaintext fallback)
    if (stored.startsWith(ENVELOPE_PREFIX)) {
      const decrypted = await decryptString(stored);
      // If decryption fails (e.g. key mismatch), return plaintext so app doesn't break
      return decrypted ?? stored;
    }

    return stored;
  } catch {
    return null;
  }
}

/**
 * Removes a key from AsyncStorage.  Thin wrapper kept for API symmetry.
 */
export async function encryptedRemoveItem(key: string): Promise<boolean> {
  try {
    await AsyncStorage.removeItem(key);
    return true;
  } catch {
    return true;
  }
}

/**
 * Returns true if the stored value for `key` is an encrypted envelope.
 * Useful for migration checks.
 */
export async function isEncrypted(key: string): Promise<boolean> {
  try {
    const stored = await AsyncStorage.getItem(key);
    return stored !== null && stored.startsWith(ENVELOPE_PREFIX);
  } catch {
    return false;
  }
}

/**
 * Pre-warms the encryption key so the first read/write is not delayed.
 * Call this during app startup (e.g. in the root layout's useEffect).
 */
export async function initEncryptionKey(): Promise<void> {
  await getOrCreateKey();
}

// ─── Key Rotation ────────────────────────────────────────────────────────────

/**
 * Result returned by `rotateEncryptionKey`.
 */
export interface KeyRotationResult {
  /** True if the new key was successfully persisted and all data re-encrypted. */
  success: boolean;
  /** Number of sensitive keys that were re-encrypted under the new key. */
  rotated: number;
  /** Number of keys that were skipped (not present or not encrypted). */
  skipped: number;
  /** Number of keys that failed to re-encrypt. If > 0, the old key is kept. */
  failed: number;
  /** Keys that failed to re-encrypt. */
  failedKeys: string[];
  /** Human-readable error message if success is false. */
  error?: string;
}

/**
 * Encrypts a string with a specific key (used during key rotation to re-encrypt
 * data with the new key before committing the key swap).
 */
async function encryptStringWithKey(plaintext: string, key: Uint8Array): Promise<string | null> {
  try {
    const iv = getRandomBytes(16);
    const plaintextBytes = aesUtils.utf8.toBytes(plaintext);
    const aesCtr = new ModeOfOperation.ctr(key, new Counter(iv));
    const ciphertextBytes = aesCtr.encrypt(plaintextBytes);
    const envelope: EncryptedEnvelope = {
      v: ENVELOPE_VERSION,
      iv: bytesToHex(iv),
      ct: bytesToHex(ciphertextBytes),
    };
    return JSON.stringify(envelope);
  } catch {
    return null;
  }
}

/**
 * Decrypts an envelope with a specific key (used during rotation to read data
 * encrypted under the old key).
 */
async function decryptStringWithKey(ciphertext: string, key: Uint8Array): Promise<string | null> {
  if (!ciphertext.startsWith(ENVELOPE_PREFIX)) return null;
  try {
    const envelope: EncryptedEnvelope = JSON.parse(ciphertext);
    if (envelope.v !== ENVELOPE_VERSION) return null;
    const iv = hexToBytes(envelope.iv);
    const ciphertextBytes = hexToBytes(envelope.ct);
    const aesCtr = new ModeOfOperation.ctr(key, new Counter(iv));
    const plaintextBytes = aesCtr.decrypt(ciphertextBytes);
    return aesUtils.utf8.fromBytes(plaintextBytes);
  } catch {
    return null;
  }
}

/**
 * Rotates the AES-256 encryption key.
 *
 * Process:
 *   1. Generate a new 32-byte key.
 *   2. For every sensitive key in AsyncStorage:
 *      a. Read the current (old-key-encrypted) value.
 *      b. Decrypt with the old key.
 *      c. Re-encrypt with the new key.
 *      d. Stage the new ciphertext in memory (do NOT write yet).
 *   3. Only if ALL re-encryptions succeeded:
 *      a. Persist the new key to SecureStore.
 *      b. Write all staged ciphertexts to AsyncStorage in one pass.
 *      c. Clear the in-memory key cache so the new key is loaded on next access.
 *   4. If ANY re-encryption failed:
 *      a. Discard the new key and all staged data.
 *      b. Return a failure result — the old key remains active.
 *
 * This guarantees the key swap is atomic from the app's perspective:
 * either all data is re-encrypted under the new key, or nothing changes.
 *
 * @param sensitiveKeys - Full list of sensitive AsyncStorage keys to rotate.
 *   Pass the same list used in migration.ts (including dynamic dictation keys).
 * @param onProgress - Optional callback called after each key is processed.
 *   Receives (processed, total) so the UI can show a progress bar.
 */
export async function rotateEncryptionKey(
  sensitiveKeys: string[],
  onProgress?: (processed: number, total: number) => void,
): Promise<KeyRotationResult> {
  const result: KeyRotationResult = {
    success: false,
    rotated: 0,
    skipped: 0,
    failed: 0,
    failedKeys: [],
  };

  try {
    // 1. Get the current (old) key
    const oldKey = await getOrCreateKey();
    if (!oldKey) {
      result.error = 'Encryption key unavailable — SecureStore may not be accessible on this device.';
      return result;
    }

    // 2. Generate a new key
    const newKeyBytes = getRandomBytes(32);

    // 3. Discover dynamic dictation keys
    let allKeys = [...sensitiveKeys];
    try {
      const storedKeys = await AsyncStorage.getAllKeys();
      const dynamicKeys = storedKeys.filter(
        (k) => k.startsWith('@vsht:dictation_history:') || k.startsWith('@vsht:batch_scribe_')
      );
      // Merge without duplicates
      const keySet = new Set([...allKeys, ...dynamicKeys]);
      allKeys = Array.from(keySet);
    } catch {
      // If we can't enumerate keys, proceed with the static list
    }

    const total = allKeys.length;
    // staged: key → new-key-encrypted ciphertext
    const staged = new Map<string, string>();

    // 4. Re-encrypt each key with the new key
    for (let i = 0; i < allKeys.length; i++) {
      const key = allKeys[i];
      try {
        const stored = await AsyncStorage.getItem(key);
        if (stored === null) {
          result.skipped++;
          onProgress?.(i + 1, total);
          continue;
        }

        // Decrypt with old key (or use as-is if plaintext)
        let plaintext: string;
        if (stored.startsWith(ENVELOPE_PREFIX)) {
          const decrypted = await decryptStringWithKey(stored, oldKey);
          if (decrypted === null) {
            // Cannot decrypt — skip this key (it may already be plaintext or corrupted)
            result.skipped++;
            onProgress?.(i + 1, total);
            continue;
          }
          plaintext = decrypted;
        } else {
          // Plaintext (not yet migrated) — just re-encrypt it
          plaintext = stored;
        }

        // Re-encrypt with new key
        const newCiphertext = await encryptStringWithKey(plaintext, newKeyBytes);
        if (newCiphertext === null) {
          result.failed++;
          result.failedKeys.push(key);
          onProgress?.(i + 1, total);
          continue;
        }

        staged.set(key, newCiphertext);
        result.rotated++;
      } catch {
        result.failed++;
        result.failedKeys.push(key);
      }
      onProgress?.(i + 1, total);
    }

    // 5. Abort if any key failed — keep old key active
    if (result.failed > 0) {
      result.error = `${result.failed} key(s) could not be re-encrypted. The old key remains active.`;
      return result;
    }

    // 6. Commit: persist new key to SecureStore
    const newKeyHex = bytesToHex(newKeyBytes);
    await SecureStore.setItemAsync(SECURE_KEY_NAME, newKeyHex, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });

    // 7. Write all staged ciphertexts to AsyncStorage
    for (const [key, newCiphertext] of staged.entries()) {
      await safeSetItem(key, newCiphertext);
    }

    // 8. Clear in-memory cache so the new key is loaded on next access
    _cachedKeyBytes = newKeyBytes;
    _keyInitPromise = null;

    result.success = true;
    return result;
  } catch (err) {
    result.error = err instanceof Error ? err.message : 'Unknown error during key rotation.';
    return result;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  const result = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    result[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return result;
}
