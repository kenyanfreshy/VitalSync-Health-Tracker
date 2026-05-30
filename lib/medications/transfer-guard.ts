/**
 * Transfer Guard — tracks the last date a transfer request was sent for each
 * medication so users can see "Last requested: Apr 3" under the button and
 * avoid accidental duplicate requests.
 *
 * Storage: AsyncStorage key `@vitalsync/transfer_requests`
 * Shape:   Record<medicationId, ISO date string>
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';

const STORAGE_KEY = '@vitalsync/transfer_requests';

type TransferStore = Record<string, string>; // medicationId → ISO date

async function loadStore(): Promise<TransferStore> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as TransferStore) : {};
  } catch (_unused) {
    return {};
  }
}

async function saveStore(store: TransferStore): Promise<void> {
  try {
    await safeSetItem(STORAGE_KEY, JSON.stringify(store));
  } catch (_unused) {
    // Non-fatal
  }
}

/**
 * Record that a transfer request was sent for `medicationId` right now.
 */
export async function recordTransferRequest(medicationId: string): Promise<void> {
  const store = await loadStore();
  store[medicationId] = new Date().toISOString();
  await saveStore(store);
}

/**
 * Return the last transfer request date for `medicationId`, or undefined if
 * no request has ever been recorded.
 */
export async function getLastTransferDate(medicationId: string): Promise<Date | undefined> {
  const store = await loadStore();
  const iso = store[medicationId];
  if (!iso) return undefined;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? undefined : d;
}

/**
 * Format a Date as a short human-readable string like "Apr 3" or "Mar 28".
 */
export function formatTransferDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Clear the transfer record for a specific medication (e.g. after deletion).
 */
export async function clearTransferRecord(medicationId: string): Promise<void> {
  const store = await loadStore();
  delete store[medicationId];
  await saveStore(store);
}
