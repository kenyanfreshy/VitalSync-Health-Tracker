/**
 * ICE Store — In Case of Emergency data persistence.
 *
 * Stores blood type, critical care summary, allergies, and emergency contacts
 * in AsyncStorage. Data is intentionally kept separate from HealthData so it
 * can be accessed quickly without loading the full health context.
 */

import { secureSetItem, secureGetItem } from '@/lib/storage/health-storage';

const ICE_KEY = '@vsht:ice_vault';

export type BloodType =
  | 'A+' | 'A-'
  | 'B+' | 'B-'
  | 'AB+' | 'AB-'
  | 'O+' | 'O-'
  | 'Unknown';

export interface EmergencyContact {
  id: string;
  name: string;
  relationship: string;   // e.g. "Spouse", "Parent", "Cardiologist"
  phone: string;
  isPrimary: boolean;
}

export interface IceVaultData {
  bloodType: BloodType;
  criticalConditions: string[];   // e.g. ["Type 2 Diabetes", "Hypertension"]
  criticalMedications: string[];  // e.g. ["Metformin 500mg", "Lisinopril 10mg"]
  allergies: string[];            // e.g. ["Penicillin", "Sulfa drugs"]
  organDonor: boolean | null;
  dnrStatus: boolean | null;
  criticalNotes: string;          // free-text for first responders
  emergencyContacts: EmergencyContact[];
  lastUpdated: string | null;     // ISO timestamp
}

export function emptyIceVault(): IceVaultData {
  return {
    bloodType: 'Unknown',
    criticalConditions: [],
    criticalMedications: [],
    allergies: [],
    organDonor: null,
    dnrStatus: null,
    criticalNotes: '',
    emergencyContacts: [],
    lastUpdated: null,
  };
}

export async function loadIceVault(): Promise<IceVaultData> {
  try {
    const raw = await secureGetItem(ICE_KEY);
    if (!raw) return emptyIceVault();
    return { ...emptyIceVault(), ...JSON.parse(raw) };
  } catch (_unused) {
    return emptyIceVault();
  }
}

export async function saveIceVault(data: IceVaultData): Promise<void> {
  await secureSetItem(ICE_KEY, JSON.stringify({
    ...data,
    lastUpdated: new Date().toISOString(),
  }));
}
