/**
 * SmartReminderBanners — VitalSync v2.9.63
 *
 * All user-visible strings are now sourced from smartReminderBannerStrings (i18n.ts),
 * covering 19 languages. Dynamic values ({n}, {when}) are interpolated at render time.
 */
import React, { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useColors } from '@/hooks/use-colors';
import { useRawLang } from '@/hooks/use-lang';
import { useSmartTrialReminder } from '@/hooks/use-smart-trial-reminder';
import { smartReminderBannerStrings } from '@/lib/i18n';

function openPaywall() {
  router.push('/paywall' as Parameters<typeof router.push>[0]);
}

/** Interpolate {n} and {s} (plural suffix) in a template string */
function interp(template: string, n: number): string {
  return template
    .replace(/\{n\}/g, String(n))
    .replace(/\{s\}/g, n !== 1 ? 's' : '');
}

/** Interpolate {when} in a template string */
function interpWhen(template: string, when: string): string {
  return template.replace(/\{when\}/g, when);
}

function useT() {
  const rawLang = useRawLang();
  return (
    (smartReminderBannerStrings as Record<string, typeof smartReminderBannerStrings.en>)[rawLang] ??
    smartReminderBannerStrings.en
  );
}

export function PassiveTrialBanner({ daysRemaining }: { daysRemaining: number }) {
  const colors = useColors();
  const t = useT();
  return (
    <View style={[styles.passiveBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.passiveText, { color: colors.muted }]}>
        {interp(t.daysLeft, daysRemaining)}
      </Text>
      <Pressable onPress={openPaywall} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
        <Text style={[styles.passiveLink, { color: colors.primary }]}>{t.upgrade}</Text>
      </Pressable>
    </View>
  );
}

export function SoftReminderSheet({ visible, daysRemaining, onDismiss, onRemindLater }: {
  visible: boolean; daysRemaining: number; onDismiss: () => void; onRemindLater: () => void;
}) {
  const colors = useColors();
  const t = useT();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <View style={styles.sheetOverlay}>
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
            {interp(t.trialEndsIn, daysRemaining)}
          </Text>
          <Text style={[styles.sheetBody, { color: colors.muted }]}>
            {t.keepAccess}
          </Text>
          <Pressable onPress={() => { onDismiss(); openPaywall(); }}
            style={({ pressed }) => [styles.upgradeBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}>
            <Text style={styles.upgradeBtnText}>{t.upgradeNow}</Text>
          </Pressable>
          <Pressable onPress={onRemindLater} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, marginTop: 12 })}>
            <Text style={[styles.laterText, { color: colors.muted }]}>{t.remindLater}</Text>
          </Pressable>
          <Pressable onPress={onDismiss} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, marginTop: 8 })}>
            <Text style={[styles.dismissText, { color: colors.muted }]}>{t.dismiss}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export function CompactReminderCard({ daysRemaining }: { daysRemaining: number }) {
  const colors = useColors();
  const t = useT();
  return (
    <View style={[styles.compactCard, { backgroundColor: colors.surface, borderColor: colors.primary + '40' }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.compactTitle, { color: colors.foreground }]}>
          {interp(t.trialEndsInShort, daysRemaining)}
        </Text>
        <Text style={[styles.compactBody, { color: colors.muted }]}>{t.upgradeToKeep}</Text>
      </View>
      <Pressable onPress={openPaywall}
        style={({ pressed }) => [styles.compactBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}>
        <Text style={styles.compactBtnText}>{t.upgrade}</Text>
      </Pressable>
    </View>
  );
}

export function ElegantTrialModal({ visible, daysRemaining, onDismiss }: {
  visible: boolean; daysRemaining: number; onDismiss: () => void;
}) {
  const colors = useColors();
  const t = useT();
  // Build the {when} string: "today" or "in N days"
  const whenStr = daysRemaining <= 0
    ? t.today
    : interp(t.inNDays, daysRemaining);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modal, { backgroundColor: colors.surface }]}>
          <Text style={styles.modalEmoji}>⏳</Text>
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>
            {interp(t.lastChance, daysRemaining)}
          </Text>
          <Text style={[styles.modalBody, { color: colors.muted }]}>
            {t.afterTrialEnds}
          </Text>
          <Pressable onPress={() => { onDismiss(); openPaywall(); }}
            style={({ pressed }) => [styles.upgradeBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}>
            <Text style={styles.upgradeBtnText}>{t.upgradeToPremium}</Text>
          </Pressable>
          <Pressable onPress={onDismiss} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, marginTop: 16 })}>
            <Text style={[styles.dismissText, { color: colors.muted }]}>{t.maybeLater}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export function GraceTrialBanner({ daysRemaining, onDismiss }: {
  daysRemaining: number; onDismiss: () => void;
}) {
  const colors = useColors();
  const t = useT();
  const whenStr = daysRemaining <= 0
    ? t.today
    : interp(t.inNDays, daysRemaining);
  return (
    <View style={[styles.graceBanner, { backgroundColor: colors.warning + '20', borderColor: colors.warning }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.graceTitle, { color: colors.foreground }]}>
          {interpWhen(t.trialExpires, whenStr)}
        </Text>
        <Pressable onPress={openPaywall} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
          <Text style={[styles.graceLink, { color: colors.primary }]}>{t.upgradeNowCta}</Text>
        </Pressable>
      </View>
      <Pressable onPress={onDismiss} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, padding: 4 })}>
        <Text style={{ color: colors.muted, fontSize: 18 }}>×</Text>
      </Pressable>
    </View>
  );
}

export function SmartReminderOrchestrator({ showSheet = false, showModal = false }: {
  showSheet?: boolean; showModal?: boolean;
}) {
  const { variant, daysRemaining, onDismissSoft, onDismissModal, onDismissGrace, onRemindLater, onShown } = useSmartTrialReminder();
  useEffect(() => {
    if (variant !== 'none' && variant !== 'passive_banner') { onShown(); }
  }, [variant, onShown]);
  if (variant === 'grace_banner') return <GraceTrialBanner daysRemaining={daysRemaining} onDismiss={onDismissGrace} />;
  if (variant === 'elegant_modal') return <ElegantTrialModal visible={showModal} daysRemaining={daysRemaining} onDismiss={onDismissModal} />;
  if (variant === 'soft_reminder') return <SoftReminderSheet visible={showSheet} daysRemaining={daysRemaining} onDismiss={onDismissSoft} onRemindLater={onRemindLater} />;
  if (variant === 'passive_banner' || variant === 'compact_card') return <PassiveTrialBanner daysRemaining={daysRemaining} />;
  return null;
}

const styles = StyleSheet.create({
  passiveBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginVertical: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  passiveText: { fontSize: 13 },
  passiveLink: { fontSize: 13, fontWeight: '600' },
  sheetOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  sheetTitle: { fontSize: 20, fontWeight: '700', marginBottom: 10 },
  sheetBody: { fontSize: 15, lineHeight: 22, marginBottom: 20 },
  compactCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginVertical: 8, padding: 14, borderRadius: 14, borderWidth: 1 },
  compactTitle: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  compactBody: { fontSize: 12 },
  compactBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, marginLeft: 12 },
  compactBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)', padding: 24 },
  modal: { borderRadius: 20, padding: 28, width: '100%', maxWidth: 380, alignItems: 'center' },
  modalEmoji: { fontSize: 40, marginBottom: 12 },
  modalTitle: { fontSize: 22, fontWeight: '700', textAlign: 'center', marginBottom: 12 },
  modalBody: { fontSize: 15, lineHeight: 22, textAlign: 'center', marginBottom: 24 },
  graceBanner: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginVertical: 6, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  graceTitle: { fontSize: 13, fontWeight: '600', marginBottom: 4 },
  graceLink: { fontSize: 13, fontWeight: '600' },
  upgradeBtn: { width: '100%', paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  upgradeBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  laterText: { fontSize: 14, textAlign: 'center' },
  dismissText: { fontSize: 13, textAlign: 'center' },
});
