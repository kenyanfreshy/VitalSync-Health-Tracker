/**
 * EmergencyVaultTile
 *
 * High-visibility ICE (In Case of Emergency) tile for the top of the dashboard.
 * Shows blood type, critical conditions, allergies, and emergency contacts at a glance.
 * Tapping expands a full-screen modal for editing and viewing all ICE data.
 *
 * Design: Red/crimson accent, high contrast, large tap target — optimised for
 * first responders who may be under stress and need information instantly.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  ScrollView,
  TextInput,
  StyleSheet,
  Platform,
  Alert,
  Animated,
  TouchableOpacity,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import QRCode from 'react-native-qrcode-svg';
import { useColors, useDashboardStrings } from '@/hooks';
import { getApiBaseUrl } from '@/constants/oauth';
import { GlassCard } from '@/components/glass-card';
import {
  loadIceVault,
  saveIceVault,
  emptyIceVault,
  type IceVaultData,
  type BloodType,
  type EmergencyContact,
} from '@/lib/ice-store';

// ─── Constants ────────────────────────────────────────────────────────────────

const ICE_RED = '#DC2626';
const _ICE_RED_LIGHT = '#FEF2F2';
const _ICE_RED_DARK = '#7F1D1D';
const ICE_RED_BORDER = '#FECACA';

const BLOOD_TYPES: BloodType[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ title, icon }: { title: string; icon: string }) {
  return (
    <View style={edit.sectionHeader}>
      <Text style={edit.sectionIcon}>{icon}</Text>
      <Text style={edit.sectionTitle}>{title}</Text>
    </View>
  );
}

function ChipList({
  items,
  onRemove,
  color,
}: {
  items: string[];
  onRemove: (i: number) => void;
  color: string;
}) {
  if (items.length === 0) return null;
  return (
    <View style={edit.chipRow}>
      {items.map((item, i) => (
        <View key={i} style={[edit.chip, { backgroundColor: color + '18', borderColor: color + '44' }]}>
          <Text style={[edit.chipText, { color }]}>{item}</Text>
          <TouchableOpacity onPress={() => onRemove(i)} hitSlop={8}>
            <Text style={[edit.chipRemove, { color }]}>×</Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────

interface EditModalProps {
  visible: boolean;
  data: IceVaultData;
  onSave: (d: IceVaultData) => void;
  onClose: () => void;
}

function IceEditModal({ visible, data, onSave, onClose }: EditModalProps) {
  const colors = useColors();
  const ds = useDashboardStrings();
  const [draft, setDraft] = useState<IceVaultData>(data);
  const [condInput, setCondInput] = useState('');
  const [medInput, setMedInput] = useState('');
  const [allergyInput, setAllergyInput] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactRel, setContactRel] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  useEffect(() => { setDraft(data); }, [data]);

  const addItem = (
    field: 'criticalConditions' | 'criticalMedications' | 'allergies',
    value: string,
    clear: () => void,
  ) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setDraft(d => ({ ...d, [field]: [...d[field], trimmed] }));
    clear();
  };

  const removeItem = (
    field: 'criticalConditions' | 'criticalMedications' | 'allergies',
    index: number,
  ) => {
    setDraft(d => ({ ...d, [field]: d[field].filter((_, i) => i !== index) }));
  };

  const addContact = () => {
    if (!contactName.trim() || !contactPhone.trim()) return;
    const contact: EmergencyContact = {
      id: genId(),
      name: contactName.trim(),
      relationship: contactRel.trim() || 'Contact',
      phone: contactPhone.trim(),
      isPrimary: draft.emergencyContacts.length === 0,
    };
    setDraft(d => ({ ...d, emergencyContacts: [...d.emergencyContacts, contact] }));
    setContactName(''); setContactRel(''); setContactPhone('');
  };

  const removeContact = (id: string) => {
    setDraft(d => ({ ...d, emergencyContacts: d.emergencyContacts.filter(c => c.id !== id) }));
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[edit.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[edit.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose} style={edit.cancelBtn}>
            <Text style={[edit.cancelText, { color: colors.muted }]}>{ds.iceCancel ?? 'Cancel'}</Text>
          </TouchableOpacity>
          <Text style={[edit.headerTitle, { color: colors.foreground }]}>{ds.emergencyVault}</Text>
          <TouchableOpacity
            onPress={() => { onSave(draft); onClose(); }}
            style={[edit.saveBtn, { backgroundColor: ICE_RED }]}
          >
            <Text style={edit.saveText}>{ds.iceSave ?? 'Save'}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={edit.scroll} contentContainerStyle={edit.scrollContent} keyboardShouldPersistTaps="handled">
          {/* Blood Type */}
          <SectionHeader title={ds.iceBloodType ?? 'Blood Type'} icon="🩸" />
          <View style={edit.bloodTypeRow}>
            {BLOOD_TYPES.map(bt => (
              <TouchableOpacity
                key={bt}
                style={[
                  edit.bloodTypeBtn,
                  { borderColor: colors.border },
                  draft.bloodType === bt && { backgroundColor: ICE_RED, borderColor: ICE_RED },
                ]}
                onPress={() => setDraft(d => ({ ...d, bloodType: bt }))}
              >
                <Text style={[
                  edit.bloodTypeBtnText,
                  { color: colors.foreground },
                  draft.bloodType === bt && { color: '#fff', fontWeight: '800' },
                ]}>{bt}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Critical Conditions */}
          <SectionHeader title={ds.iceConditions ?? 'Critical Conditions'} icon="🩺" />
          <ChipList items={draft.criticalConditions} onRemove={i => removeItem('criticalConditions', i)} color="#EF4444" />
          <View style={[edit.inputRow, { borderColor: colors.border }]}>
            <TextInput
              style={[edit.input, { color: colors.foreground }]}
              placeholder="e.g. Type 2 Diabetes"
              placeholderTextColor={colors.muted}
              value={condInput}
              onChangeText={setCondInput}
              returnKeyType="done"
              onSubmitEditing={() => addItem('criticalConditions', condInput, () => setCondInput(''))}
            />
            <TouchableOpacity onPress={() => addItem('criticalConditions', condInput, () => setCondInput(''))} style={edit.addBtn}>
              <Text style={edit.addBtnText}>{ds.iceAdd ?? '+ Add'}</Text>
            </TouchableOpacity>
          </View>

          {/* Critical Medications */}
          <SectionHeader title={ds.iceMedications ?? 'Critical Medications'} icon="💊" />
          <ChipList items={draft.criticalMedications} onRemove={i => removeItem('criticalMedications', i)} color="#8B5CF6" />
          <View style={[edit.inputRow, { borderColor: colors.border }]}>
            <TextInput
              style={[edit.input, { color: colors.foreground }]}
              placeholder="e.g. Metformin 500mg"
              placeholderTextColor={colors.muted}
              value={medInput}
              onChangeText={setMedInput}
              returnKeyType="done"
              onSubmitEditing={() => addItem('criticalMedications', medInput, () => setMedInput(''))}
            />
            <TouchableOpacity onPress={() => addItem('criticalMedications', medInput, () => setMedInput(''))} style={edit.addBtn}>
              <Text style={edit.addBtnText}>{ds.iceAdd ?? '+ Add'}</Text>
            </TouchableOpacity>
          </View>

          {/* Allergies */}
          <SectionHeader title={ds.iceAllergies ?? 'Allergies & Contraindications'} icon="⚠️" />
          <ChipList items={draft.allergies} onRemove={i => removeItem('allergies', i)} color="#F59E0B" />
          <View style={[edit.inputRow, { borderColor: colors.border }]}>
            <TextInput
              style={[edit.input, { color: colors.foreground }]}
              placeholder="e.g. Penicillin"
              placeholderTextColor={colors.muted}
              value={allergyInput}
              onChangeText={setAllergyInput}
              returnKeyType="done"
              onSubmitEditing={() => addItem('allergies', allergyInput, () => setAllergyInput(''))}
            />
            <TouchableOpacity onPress={() => addItem('allergies', allergyInput, () => setAllergyInput(''))} style={edit.addBtn}>
              <Text style={edit.addBtnText}>{ds.iceAdd ?? '+ Add'}</Text>
            </TouchableOpacity>
          </View>

          {/* Organ Donor / DNR */}
          <SectionHeader title={ds.iceDirectives ?? 'Directives'} icon="📋" />
          <View style={edit.directivesRow}>
            {[
              { label: ds.iceOrganDonor ?? 'Organ Donor', field: 'organDonor' as const },
              { label: ds.iceDNR ?? 'DNR / DNAR', field: 'dnrStatus' as const },
            ].map(({ label, field }) => (
              <View key={field} style={[edit.directiveCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <Text style={[edit.directiveLabel, { color: colors.foreground }]}>{label}</Text>
                <View style={edit.directiveBtns}>
                  {[true, false, null].map((val, idx) => {
                    const labels = [ds.iceYes ?? 'Yes', ds.iceNo ?? 'No', '?'];
                    const active = draft[field] === val;
                    return (
                      <TouchableOpacity
                        key={idx}
                        style={[
                          edit.directiveBtn,
                          { borderColor: colors.border },
                          active && { backgroundColor: ICE_RED, borderColor: ICE_RED },
                        ]}
                        onPress={() => setDraft(d => ({ ...d, [field]: val }))}
                      >
                        <Text style={[edit.directiveBtnText, { color: active ? '#fff' : colors.muted }]}>{labels[idx]}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>

          {/* Critical Notes */}
          <SectionHeader title={ds.iceNotes ?? 'Notes for First Responders'} icon="📝" />
          <TextInput
            style={[edit.notesInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
            placeholder={ds.iceFirstResponderNotes ?? 'Any additional critical information...'}
            placeholderTextColor={colors.muted}
            value={draft.criticalNotes}
            onChangeText={v => setDraft(d => ({ ...d, criticalNotes: v }))}
            multiline
            numberOfLines={4}
          />

          {/* Emergency Contacts */}
          <SectionHeader title={ds.iceContacts ?? 'Emergency Contacts'} icon="📞" />
          {draft.emergencyContacts.map((c, _i) => (
            <View key={c.id} style={[edit.contactCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <View style={edit.contactInfo}>
                {c.isPrimary && (
                  <View style={[edit.primaryBadge, { backgroundColor: ICE_RED + '18' }]}>
                    <Text style={[edit.primaryBadgeText, { color: ICE_RED }]}>PRIMARY</Text>
                  </View>
                )}
                <Text style={[edit.contactName, { color: colors.foreground }]}>{c.name}</Text>
                <Text style={[edit.contactDetail, { color: colors.muted }]}>{c.relationship} · {c.phone}</Text>
              </View>
              <TouchableOpacity onPress={() => removeContact(c.id)} hitSlop={8}>
                <Text style={{ color: colors.muted, fontSize: 18 }}>×</Text>
              </TouchableOpacity>
            </View>
          ))}
          <View style={[edit.contactForm, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <TextInput style={[edit.contactInput, { color: colors.foreground, borderBottomColor: colors.border }]}
              placeholder={ds.iceFullNamePlaceholder ?? 'Full Name *'} placeholderTextColor={colors.muted}
              value={contactName} onChangeText={setContactName} />
            <TextInput style={[edit.contactInput, { color: colors.foreground, borderBottomColor: colors.border }]}
              placeholder={ds.iceRelationshipPlaceholder ?? 'Relationship (e.g. Spouse)'} placeholderTextColor={colors.muted}
              value={contactRel} onChangeText={setContactRel} />
            <TextInput style={[edit.contactInput, { color: colors.foreground, borderBottomColor: colors.border }]}
              placeholder={ds.icePhonePlaceholder ?? 'Phone Number *'} placeholderTextColor={colors.muted}
              value={contactPhone} onChangeText={setContactPhone} keyboardType="phone-pad" inputMode="tel" />
            <TouchableOpacity style={[edit.addContactBtn, { backgroundColor: ICE_RED }]} onPress={addContact}>
              <Text style={edit.addContactBtnText}>{ds.iceAdd ?? '+'} {ds.iceContact ?? 'Contact'}</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Main Tile ────────────────────────────────────────────────────────────────

interface EmergencyVaultTileProps {
  /**
   * Each time this value increments the edit modal opens.
   * Lets a parent (e.g. Quick-Jump long-press) trigger edit without direct state access.
   */
  editTrigger?: number;
}

export function EmergencyVaultTile({ editTrigger }: EmergencyVaultTileProps = {}) {
  const _colors = useColors();
  const ds = useDashboardStrings();
  const [vault, setVault] = useState<IceVaultData>(emptyIceVault());
  const [editVisible, setEditVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [qrVisible, setQrVisible] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  // Open edit modal whenever editTrigger increments (external caller)
  const prevEditTrigger = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (editTrigger === undefined) return;
    if (prevEditTrigger.current === undefined) { prevEditTrigger.current = editTrigger; return; }
    if (editTrigger !== prevEditTrigger.current) {
      prevEditTrigger.current = editTrigger;
      setEditVisible(true);
    }
  }, [editTrigger]);

  useEffect(() => {
    loadIceVault().then(setVault);
    // Subtle pulse animation on the ICE badge
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = useCallback(async (data: IceVaultData) => {
    await saveIceVault(data);
    setVault(data);
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  // Build ICE deep-link URL for QR code.
  // Encodes the vault data as base64url JSON in the ?d= query param so a
  // first responder scanning the QR code is taken directly to the read-only
  // web view at /ice rather than seeing raw text.
  const buildQrPayload = useCallback(() => {
    const payload = {
      bloodType: vault.bloodType,
      criticalConditions: vault.criticalConditions,
      allergies: vault.allergies,
      criticalMedications: vault.criticalMedications,
      organDonor: vault.organDonor,
      dnrStatus: vault.dnrStatus,
      criticalNotes: vault.criticalNotes,
      emergencyContacts: vault.emergencyContacts.map(c => ({
        name: c.name,
        relationship: c.relationship,
        phone: c.phone,
        isPrimary: c.isPrimary,
      })),
      lastUpdated: new Date().toISOString(),
    };
    // Encode as base64url (URL-safe base64 without padding)
    const json = JSON.stringify(payload);
    const b64 = typeof btoa !== 'undefined'
      ? btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
      : Buffer.from(json).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const base = getApiBaseUrl();
    return `${base}/ice?d=${b64}`;
  }, [vault]);

  const hasData = vault.bloodType !== 'Unknown' || vault.emergencyContacts.length > 0 || vault.criticalConditions.length > 0;
  const primaryContact = vault.emergencyContacts.find(c => c.isPrimary) ?? vault.emergencyContacts[0];

  return (
    <>
      <GlassCard
        accentColor={ICE_RED}
        noPadding
        style={tile.container}
      >
        {/* Tap to expand/collapse, long-press to edit */}
        <Pressable
          onPress={() => {
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setExpanded(e => !e);
          }}
          onLongPress={() => {
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            setEditVisible(true);
          }}
          delayLongPress={350}
          style={{ padding: 14 }}
          accessibilityLabel="Emergency Vault — tap to view, long press to edit"
        >
        {/* Top row */}
        <View style={tile.topRow}>
          <Animated.View style={[tile.iceBadge, { transform: [{ scale: pulseAnim }] }]}>
            <Text style={tile.iceBadgeText}>ICE</Text>
          </Animated.View>
          <View style={tile.titleBlock}>
            <Text style={tile.title}>{ds.emergencyVault}</Text>
            <Text style={tile.subtitle}>
              {hasData ? (ds.iceTapToView ?? 'Tap to view · Long press to edit') : (ds.iceTapToSetup ?? 'Tap to set up your ICE profile')}
            </Text>
          </View>
          {vault.bloodType !== 'Unknown' && (
            <View style={tile.bloodTypeBadge}>
              <Text style={tile.bloodTypeText}>{vault.bloodType}</Text>
            </View>
          )}
          <Text style={[tile.chevron, { transform: [{ rotate: expanded ? '180deg' : '0deg' }] }]}>▾</Text>
        </View>

        {/* Expanded summary */}
        {expanded && (
          <View style={tile.expandedContent}>
            {/* Conditions row */}
            {vault.criticalConditions.length > 0 && (
              <View style={tile.infoRow}>
                <Text style={tile.infoIcon}>🩺</Text>
                <Text style={tile.infoText} numberOfLines={2}>
                  {vault.criticalConditions.join(' · ')}
                </Text>
              </View>
            )}
            {/* Allergies row */}
            {vault.allergies.length > 0 && (
              <View style={tile.infoRow}>
                <Text style={tile.infoIcon}>⚠️</Text>
                <Text style={[tile.infoText, { color: '#F59E0B' }]} numberOfLines={1}>
                  ALLERGIC: {vault.allergies.join(', ')}
                </Text>
              </View>
            )}
            {/* Medications row */}
            {vault.criticalMedications.length > 0 && (
              <View style={tile.infoRow}>
                <Text style={tile.infoIcon}>💊</Text>
                <Text style={tile.infoText} numberOfLines={2}>
                  {vault.criticalMedications.join(' · ')}
                </Text>
              </View>
            )}
            {/* Primary contact */}
            {primaryContact && (
              <View style={[tile.contactRow, { borderTopColor: ICE_RED + '30' }]}>
                <Text style={tile.infoIcon}>📞</Text>
                <View>
                  <Text style={tile.contactName}>{primaryContact.name}</Text>
                  <Text style={tile.contactDetail}>{primaryContact.relationship} · {primaryContact.phone}</Text>
                </View>
              </View>
            )}
            {/* Directives */}
            {(vault.organDonor !== null || vault.dnrStatus !== null) && (
              <View style={tile.directivesRow}>
                {vault.organDonor !== null && (
                  <View style={tile.directivePill}>
                    <Text style={tile.directivePillText}>
                      {vault.organDonor ? '✓ Organ Donor' : '✗ Not Organ Donor'}
                    </Text>
                  </View>
                )}
                {vault.dnrStatus !== null && (
                  <View style={[tile.directivePill, vault.dnrStatus ? { backgroundColor: ICE_RED + '25' } : {}]}>
                    <Text style={[tile.directivePillText, vault.dnrStatus ? { color: ICE_RED } : {}]}>
                      {vault.dnrStatus ? '⚠ DNR Active' : '✓ No DNR'}
                    </Text>
                  </View>
                )}
              </View>
            )}
            {/* Notes */}
            {vault.criticalNotes.trim().length > 0 && (
              <View style={tile.notesRow}>
                <Text style={tile.notesText} numberOfLines={3}>{vault.criticalNotes}</Text>
              </View>
            )}
            {/* Action buttons row */}
            <View style={tile.actionRow}>
              {hasData && (
                <TouchableOpacity
                  style={[tile.actionBtn, { backgroundColor: '#1D4ED8' }]}
                  onPress={() => {
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setQrVisible(true);
                  }}
                >
                  <Text style={tile.actionBtnText}>{ds.iceQRCode ?? '⬛ QR Code'}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={tile.editBtn}
                onPress={() => {
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setEditVisible(true);
                }}
              >
                <Text style={tile.editBtnText}>{ds.iceEditVault ?? '✎ Edit Vault'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Setup prompt if empty */}
        {!hasData && !expanded && (
          <View style={tile.setupPrompt}>
            <Text style={tile.setupText}>
              {ds.iceSetupPrompt ?? 'Add blood type, conditions, allergies and emergency contacts for first responders.'}
            </Text>
          </View>
        )}
        </Pressable>
      </GlassCard>

      <IceEditModal
        visible={editVisible}
        data={vault}
        onSave={handleSave}
        onClose={() => setEditVisible(false)}
      />

      {/* QR Code Modal */}
      <Modal visible={qrVisible} animationType="fade" transparent presentationStyle="overFullScreen">
        <Pressable
          style={qrModal.overlay}
          onPress={() => setQrVisible(false)}
        >
          <Pressable style={qrModal.card} onPress={() => {}}>
            <Text style={qrModal.title}>{ds.iceQRTitle ?? '🚨 ICE QR Code'}</Text>
            <Text style={qrModal.subtitle}>
              {ds.iceQRSubtitle ?? 'Scanning opens a secure web page with your emergency medical information — no app required.'}
            </Text>
            <View style={qrModal.qrWrapper}>
              <QRCode
                value={buildQrPayload()}
                size={220}
                color={ICE_RED}
                backgroundColor="#fff"
                quietZone={12}
              />
            </View>
            <Text style={qrModal.hint}>
              {ds.iceQRHint ?? 'Keep this screen visible or print and carry in your wallet. The QR code contains your ICE data and opens a read-only page for first responders.'}
            </Text>
            <TouchableOpacity
              style={[qrModal.closeBtn, { backgroundColor: ICE_RED }]}
              onPress={() => setQrVisible(false)}
            >
              <Text style={qrModal.closeBtnText}>{ds.iceClose ?? 'Close'}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const tile = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 12,
    overflow: 'hidden',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iceBadge: {
    backgroundColor: ICE_RED,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  iceBadgeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  titleBlock: {
    flex: 1,
  },
  title: {
    color: ICE_RED,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  subtitle: {
    color: ICE_RED + '99',
    fontSize: 11,
    marginTop: 1,
  },
  bloodTypeBadge: {
    backgroundColor: ICE_RED,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  bloodTypeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
  },
  chevron: {
    color: ICE_RED,
    fontSize: 18,
    fontWeight: '600',
  },
  expandedContent: {
    marginTop: 12,
    gap: 8,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  infoIcon: {
    fontSize: 14,
    marginTop: 1,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: ICE_RED,
    lineHeight: 18,
    fontWeight: '500',
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  contactName: {
    fontSize: 13,
    fontWeight: '700',
    color: ICE_RED,
  },
  contactDetail: {
    fontSize: 11,
    color: ICE_RED + '99',
  },
  directivesRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  directivePill: {
    backgroundColor: ICE_RED + '12',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: ICE_RED + '30',
  },
  directivePillText: {
    fontSize: 11,
    fontWeight: '600',
    color: ICE_RED,
  },
  notesRow: {
    backgroundColor: ICE_RED + '0C',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: ICE_RED + '30',
  },
  notesText: {
    fontSize: 12,
    color: ICE_RED,
    lineHeight: 17,
  },
  editBtn: {
    alignSelf: 'flex-end',
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: ICE_RED,
    borderRadius: 10,
    marginTop: 4,
  },
  editBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  setupPrompt: {
    marginTop: 8,
    backgroundColor: ICE_RED + '0C',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: ICE_RED + '30',
  },
  setupText: {
    fontSize: 12,
    color: ICE_RED + 'CC',
    lineHeight: 17,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 4,
  },
  actionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
});

const qrModal = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: ICE_RED,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 18,
  },
  qrWrapper: {
    padding: 8,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: ICE_RED_BORDER,
  },
  hint: {
    fontSize: 11,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 16,
    fontStyle: 'italic',
  },
  closeBtn: {
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 4,
  },
  closeBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});

const edit = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cancelBtn: { padding: 4 },
  cancelText: { fontSize: 15 },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  saveBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10 },
  saveText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 8 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    marginBottom: 6,
  },
  sectionIcon: { fontSize: 16 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: ICE_RED,
    textTransform: 'uppercase',
  },
  bloodTypeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  bloodTypeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    minWidth: 52,
    alignItems: 'center',
  },
  bloodTypeBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
  },
  chipText: { fontSize: 12, fontWeight: '600' },
  chipRemove: { fontSize: 16, fontWeight: '700', lineHeight: 18 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 4,
  },
  input: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  addBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: ICE_RED,
  },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  directivesRow: {
    flexDirection: 'row',
    gap: 10,
  },
  directiveCard: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    gap: 8,
  },
  directiveLabel: { fontSize: 12, fontWeight: '700' },
  directiveBtns: { flexDirection: 'row', gap: 4 },
  directiveBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  directiveBtnText: { fontSize: 12, fontWeight: '700' },
  notesInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    minHeight: 90,
    textAlignVertical: 'top',
  },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
  },
  contactInfo: { flex: 1, gap: 2 },
  primaryBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginBottom: 2,
  },
  primaryBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  contactName: { fontSize: 14, fontWeight: '700' },
  contactDetail: { fontSize: 12 },
  contactForm: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  contactInput: {
    fontSize: 14,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  addContactBtn: {
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  addContactBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
