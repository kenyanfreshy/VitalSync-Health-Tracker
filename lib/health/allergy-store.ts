/**
 * Allergy Store
 * AsyncStorage CRUD for AllergyRecord entries.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AllergyRecord } from './types';
import { safeSetItem } from '@/lib/safe-async-storage';

const STORAGE_KEY = '@vsht:allergies';

export async function loadAllergies(): Promise<AllergyRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveAllAllergies(records: AllergyRecord[]): Promise<void> {
  await safeSetItem(STORAGE_KEY, JSON.stringify(records));
}

export async function addAllergyRecord(record: AllergyRecord): Promise<AllergyRecord[]> {
  const existing = await loadAllergies();
  const updated = [record, ...existing];
  await saveAllAllergies(updated);
  return updated;
}

export async function updateAllergyRecord(record: AllergyRecord): Promise<AllergyRecord[]> {
  const existing = await loadAllergies();
  const updated = existing.map(r => r.id === record.id ? record : r);
  await saveAllAllergies(updated);
  return updated;
}

export async function deleteAllergyRecord(id: string): Promise<AllergyRecord[]> {
  const existing = await loadAllergies();
  const updated = existing.filter(r => r.id !== id);
  await saveAllAllergies(updated);
  return updated;
}
