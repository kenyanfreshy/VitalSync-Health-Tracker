/**
 * About VitalSync
 * Creator bio, app mission, and privacy-first statement.
 * Fully localised: en / es / fr / zh
 */

import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
  Linking,
  Share,
  Platform,
  Alert,
  FlatList,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { EvidenceRefBanner } from '@/components/ui/evidence-ref-banner';
import { useColors, useLang } from '@/hooks';
import Constants from 'expo-constants';
import { whatsNewStrings, aboutStrings } from '@/lib/i18n';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSpring, Easing } from 'react-native-reanimated';

export default function AboutScreen() {
  const colors = useColors();
  const router = useRouter();
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';
  const appBuild = Platform.OS === 'ios'
    ? Constants.expoConfig?.ios?.buildNumber
    : Platform.OS === 'android'
      ? String(Constants.expoConfig?.android?.versionCode ?? '')
      : undefined;
  const appVersionFull = appBuild ? `${appVersion} (${appBuild})` : appVersion;
  // Dedication expand/collapse — uses onLayout-measured natural height so
  // the full text is never clipped regardless of locale or screen size.
  const [dedicationExpanded, setDedicationExpanded] = useState(false);
  const [dedicationNaturalHeight, setDedicationNaturalHeight] = useState(0);
  const dedicationHeight = useSharedValue(0);
  const dedicationChevronRotation = useSharedValue(0);
  const dedicationBodyOpacity = useSharedValue(0);
  const dedicationBodyStyle = useAnimatedStyle(() => ({
    height: dedicationHeight.value,
    overflow: 'hidden',
  }));
  const dedicationBodyContentStyle = useAnimatedStyle(() => ({
    opacity: dedicationBodyOpacity.value,
  }));
  const dedicationChevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${dedicationChevronRotation.value}deg` }],
  }));
  const toggleDedication = () => {
    const next = !dedicationExpanded;
    setDedicationExpanded(next);
    // Use measured natural height; fall back to 900 if layout hasn't fired yet
    const targetH = dedicationNaturalHeight > 0 ? dedicationNaturalHeight : 900;
    dedicationHeight.value = withTiming(next ? targetH : 0, { duration: 350, easing: Easing.out(Easing.cubic) });
    dedicationChevronRotation.value = withTiming(next ? 90 : 0, { duration: 250, easing: Easing.out(Easing.quad) });
    // Fade content in after height starts expanding, fade out quickly on collapse
    dedicationBodyOpacity.value = next
      ? withTiming(1, { duration: 320, easing: Easing.out(Easing.quad) })
      : withTiming(0, { duration: 100, easing: Easing.in(Easing.quad) });
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };
  const handleShareDedication = async () => {
    try {
      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await Share.share({
        message: a.dedicationBody,
        title: a.dedicationTitle,
      });
    } catch (_) {}
  };

  const lang = useLang();
  const wn = ((whatsNewStrings as unknown as Record<string, typeof whatsNewStrings.en>)[lang] ?? whatsNewStrings.en);
  const a = ((aboutStrings as unknown as Record<string, typeof aboutStrings.en>)[lang] ?? aboutStrings.en);

  const handleFeedback = async () => {
    const supportUrl = 'https://vitalsyncclinicalhub.com';
    if (Platform.OS !== 'web') {
      const { openBrowserAsync } = await import('expo-web-browser');
      await openBrowserAsync(supportUrl);
    } else {
      await Linking.openURL(supportUrl);
    }
  };

  const handleRate = async () => {
    const storeUrl =
      Platform.OS === 'ios'
        ? 'itms-apps://itunes.apple.com/app/id6760217377?action=write-review'
        : 'market://details?id=com.myvitalsyncclinicalhub.vitalsync';
    const webFallback =
      Platform.OS === 'ios'
        ? 'https://apps.apple.com/app/id6760217377?action=write-review'
        : 'https://play.google.com/store/apps/details?id=com.myvitalsyncclinicalhub.vitalsync';
    const canOpen = await Linking.canOpenURL(storeUrl);
    if (canOpen) {
      await Linking.openURL(storeUrl);
    } else {
      await Linking.openURL(webFallback);
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({
        title: 'VitalSync — Evidence-Based Personal Health Hub',
        message:
          a.shareMessage,
      });
    } catch (_unused) {
      // user cancelled
    }
  };

  const footerText = a.footer.replace('{year}', String(new Date().getFullYear()));

  return (
    <ScreenContainer edges={['top', 'left', 'right']}>
      {/* ─── Nav Bar ─────────────────────────────────────────────────────── */}
      <View style={[styles.navBar, { borderBottomColor: colors.border }]}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
          onPress={() => router.back()}
        >
          <IconSymbol name="chevron.left" size={20} color={colors.primary} />
          <Text style={[styles.backLabel, { color: colors.primary }]}>{a.navBack}</Text>
        </Pressable>
        <Text style={[styles.navTitle, { color: colors.foreground }]}>{a.navTitle}</Text>
        <View style={styles.navSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ─── Hero ──────────────────────────────────────────────────────── */}
        <View style={styles.hero}>
          <View style={[styles.logoRing, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '40' }]}>
            <Image
              source={require('@/assets/images/icon.png')}
              style={{ width: 64, height: 64, borderRadius: 14 }}
              contentFit="cover"
            />
          </View>
          <Text style={[styles.appName, { color: colors.foreground }]}>VitalSync</Text>
          <Text style={[styles.tagline, { color: colors.primary }]}>{a.tagline}</Text>
          <Text style={[styles.version, { color: colors.muted }]}>Version {appVersionFull}</Text>
        </View>

        {/* ─── Mission ───────────────────────────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconBadge, { backgroundColor: colors.primary + '18' }]}>
              <IconSymbol name="heart.fill" size={16} color={colors.primary} />
            </View>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>{a.missionTitle}</Text>
          </View>
          <Text style={[styles.cardBody, { color: colors.foreground }]}>{a.missionBody1}</Text>
          <Text style={[styles.cardBody, { color: colors.foreground, marginTop: 10 }]}>{a.missionBody2}</Text>
        </View>

        {/* ─── Feature Highlights ─────────────────────────────────────────────── */}
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={HIGHLIGHT_META.map((m) => ({
            ...m,
            label: (a.featureHighlights as readonly { id: string; label: string }[]).find(h => h.id === m.id)?.label ?? m.id,
          }))}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.highlightsRow}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [
                styles.highlightTile,
                { backgroundColor: item.bg, borderColor: item.border, opacity: pressed ? 0.75 : 1 },
              ]}
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push(item.route as any);
              }}
            >
              <Text style={styles.highlightEmoji}>{item.emoji}</Text>
              <Text style={[styles.highlightLabel, { color: item.color }]}>{item.label}</Text>
            </Pressable>
          )}
        />


        {/* ─── Knowledge Empowered By ──────────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconBadge, { backgroundColor: '#805AD618' }]}>
              <Text style={{ fontSize: 16 }}>🎓</Text>
            </View>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>{a.knowledgeEmpoweredBy}</Text>
            <Pressable
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                Share.share({
                  title: 'Free Harvard Courses',
                  message: '🎓 Free world-class courses from Harvard University:\n\n▸ CS50x — Intro to Computer Science\nhttps://cs50.harvard.edu/x/\n\n▸ CS50P — Programming with Python\nhttps://cs50.harvard.edu/python/\n\n▸ CS50 — Python & Machine Learning\nhttps://cs50.harvard.edu/ai/\n\nExplore more free courses: https://pll.harvard.edu',
                  url: 'https://pll.harvard.edu',
                });
              }}
              style={({ pressed }) => ({
                padding: 6,
                borderRadius: 8,
                backgroundColor: pressed ? colors.primary + '22' : 'transparent',
              })}
            >
              <Text style={{ fontSize: 16 }}>📤</Text>
            </Pressable>
          </View>
          <Text style={[styles.cardBody, { color: colors.muted, marginBottom: 14 }]}>
            Continuous learning through free, world-class courses, including:
          </Text>
          {([
            {
              title: "CS50's Introduction to Computer Science",
              subtitle: 'Harvard University (edX / OpenCourseWare)',
              url: 'https://cs50.harvard.edu/x/',
            },
            {
              title: "CS50's Introduction to Programming with Python",
              subtitle: 'Harvard University',
              url: 'https://cs50.harvard.edu/python/',
            },
            {
              title: "CS50's Introduction to Artificial Intelligence with Python",
              subtitle: 'Harvard University',
              url: 'https://cs50.harvard.edu/ai/',
            },
          ] as const).map((course, idx, arr) => (
            <Pressable
              key={idx}
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                Linking.openURL(course.url);
              }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'flex-start',
                paddingVertical: 10,
                borderBottomWidth: idx < arr.length - 1 ? StyleSheet.hairlineWidth : 0,
                borderBottomColor: colors.border,
                opacity: pressed ? 0.65 : 1,
              })}
            >
              <Text style={{ color: '#805AD5', fontSize: 14, marginRight: 10, marginTop: 1 }}>▸</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.foreground, lineHeight: 19 }}>
                  {course.title}
                </Text>
                <Text style={{ fontSize: 11, color: colors.primary, marginTop: 1 }}>{course.subtitle}</Text>
              </View>
              <Text style={{ fontSize: 12, color: colors.primary, marginLeft: 6, marginTop: 2 }}>↗</Text>
            </Pressable>
          ))}
          <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
            <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 18, fontStyle: 'italic' }}>
              Free, open-access education — proof that world-class knowledge has no price barrier.
            </Text>
          </View>
          {/* Support Open Education */}
          <Pressable
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              Linking.openURL('https://pll.harvard.edu');
            }}
            style={({ pressed }) => ({
              marginTop: 14,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              padding: 12,
              borderRadius: 12,
              backgroundColor: pressed ? colors.primary + '22' : colors.primary + '12',
              borderWidth: 1,
              borderColor: colors.primary + '30',
            })}
          >
            <Text style={{ fontSize: 20 }}>🌍</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.foreground }}>{a.supportOpenEducation}</Text>
              <Text style={{ fontSize: 11, color: colors.primary, marginTop: 2 }}>{a.exploreMoreCourses}</Text>
            </View>
            <Text style={{ fontSize: 13, color: colors.primary }}>↗</Text>
          </Pressable>
        </View>

        {/* ─── Privacy Commitment ────────────────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconBadge, { backgroundColor: '#22C55E18' }]}>
              <IconSymbol name="lock.shield.fill" size={16} color="#22C55E" />
            </View>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>{a.privacyTitle}</Text>
          </View>

          {(a.privacyPoints as readonly { icon: string; label: string }[]).map((item) => (
            <View key={item.label} style={styles.privacyRow}>
              <Text style={styles.privacyIcon}>{item.icon}</Text>
              <Text style={[styles.privacyLabel, { color: colors.foreground }]}>{item.label}</Text>
            </View>
          ))}
        </View>

        {/* ─── Actions ───────────────────────────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {/* Send Feedback */}
          <Pressable
            style={({ pressed }) => [
              styles.actionRow,
              { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 },
            ]}
            onPress={handleFeedback}
          >
            <View style={[styles.actionIcon, { backgroundColor: colors.primary + '18' }]}>
              <IconSymbol name="paperplane.fill" size={16} color={colors.primary} />
            </View>
            <View style={styles.actionText}>
              <Text style={[styles.actionLabel, { color: colors.foreground }]}>{a.feedbackLabel}</Text>
              <Text style={[styles.actionSub, { color: colors.muted }]}>{a.feedbackSub}</Text>
            </View>
            <IconSymbol name="chevron.right" size={16} color={colors.muted} />
          </Pressable>

          {/* Rate VitalSync */}
          <Pressable
            style={({ pressed }) => [
              styles.actionRow,
              { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 },
            ]}
            onPress={handleRate}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#F59E0B18' }]}>
              <IconSymbol name="star.fill" size={16} color="#F59E0B" />
            </View>
            <View style={styles.actionText}>
              <Text style={[styles.actionLabel, { color: colors.foreground }]}>{a.rateLabel}</Text>
              <Text style={[styles.actionSub, { color: colors.muted }]}>{a.rateSub}</Text>
            </View>
            <IconSymbol name="chevron.right" size={16} color={colors.muted} />
          </Pressable>

          {/* Share VitalSync */}
          <Pressable
            style={({ pressed }) => [
              styles.actionRow,
              { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 },
            ]}
            onPress={handleShare}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#22C55E18' }]}>
              <IconSymbol name="square.and.arrow.up" size={16} color="#22C55E" />
            </View>
            <View style={styles.actionText}>
              <Text style={[styles.actionLabel, { color: colors.foreground }]}>{a.shareLabel}</Text>
              <Text style={[styles.actionSub, { color: colors.muted }]}>{a.shareSub}</Text>
            </View>
            <IconSymbol name="chevron.right" size={16} color={colors.muted} />
          </Pressable>

          {/* Review Privacy Policy */}
          <Pressable
            style={({ pressed }) => [
              styles.actionRow,
              { borderBottomWidth: 0, opacity: pressed ? 0.7 : 1 },
            ]}
            onPress={async () => {
              const url = 'https://vitalsyncpersonalwellnesshub.com/article/privacy-policy';
              if (Platform.OS === 'web') {
                await Linking.openURL(url);
              } else {
                const { openBrowserAsync } = await import('expo-web-browser');
                await openBrowserAsync(url, {
                  presentationStyle: 'pageSheet' as any,
                  toolbarColor: colors.primary,
                });
              }
            }}
          >
            <View style={[styles.actionIcon, { backgroundColor: colors.primary + '18' }]}>
              <IconSymbol name="lock.shield.fill" size={16} color={colors.primary} />
            </View>
            <View style={styles.actionText}>
              <Text style={[styles.actionLabel, { color: colors.foreground }]}>{a.privacyPolicy}</Text>
              <Text style={[styles.actionSub, { color: colors.muted }]}>{a.privacyPolicySub}</Text>
              <Text style={[styles.actionSub, { color: colors.muted, marginTop: 1 }]}>{a.lastUpdated}</Text>
            </View>
            <IconSymbol name="chevron.right" size={16} color={colors.muted} />
          </Pressable>
        </View>

        {/* ─── What's New ────────────────────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconBadge, { backgroundColor: '#0EA5E918' }]}>
              <IconSymbol name="sparkles" size={16} color="#0EA5E9" />
            </View>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>{wn.sectionTitle}</Text>
            <View style={[styles.versionBadge, { backgroundColor: colors.primary + '18' }]}>
              <Text style={[styles.versionBadgeText, { color: colors.primary }]}>v{appVersionFull}</Text>
            </View>
          </View>

          <View style={styles.releaseBlock}>
            <View style={styles.releaseHeader}>
              <Text style={[styles.releaseVersion, { color: colors.foreground }]}>{wn.version} {appVersion}</Text>
              <Text style={[styles.releaseDate, { color: colors.muted }]}>{a.releaseDate}</Text>
            </View>
            {(wn.items as readonly string[]).map((item, i) => (
              <View key={i} style={styles.changeRow}>
                <Text style={[styles.changeDot, { color: colors.primary }]}>•</Text>
                <Text style={[styles.changeText, { color: colors.foreground }]}>{item}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ─── Disclaimer ────────────────────────────────────────────────── */}
        <View style={[styles.disclaimer, { backgroundColor: colors.warning + '12', borderColor: colors.warning + '40' }]}>
          <Text style={[styles.disclaimerTitle, { color: colors.warning }]}>{a.disclaimerTitle}</Text>
          <Text style={[styles.disclaimerBody, { color: colors.muted }]}>{a.disclaimerBody}</Text>
        </View>

         {/* ─── Evidence Library ─────────────────────────────────────── */}
        <EvidenceRefBanner
          accentColor="#0EA5E9"
          heading="Evidence & Open Data Sources"
          refs={[
            { label: 'PubMed Central (NIH)', url: 'https://pubmed.ncbi.nlm.nih.gov/', badge: 'PubMed' },
            { label: 'AHA Scientific Journals', url: 'https://www.ahajournals.org/', badge: 'AHA' },
            { label: 'WHO Clinical Guidelines', url: 'https://www.who.int/publications/guidelines', badge: 'WHO' },
            { label: 'ADA Standards of Care 2024', url: 'https://diabetesjournals.org/care/issue/47/Supplement_1', badge: 'ADA' },
            { label: 'ESC Cardiology Guidelines', url: 'https://www.escardio.org/Guidelines', badge: 'ESC' },
          ]}
          style={{ marginHorizontal: 0 }}
        />
        {/* ─── View All References deep-link ────────────────────── */}
        <Pressable
          onPress={() => {
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/settings/clinical-sources' as never);
          }}
          style={({ pressed }) => [{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            backgroundColor: 'rgba(14,165,233,0.08)', borderWidth: 1,
            borderColor: 'rgba(14,165,233,0.25)', borderRadius: 14, padding: 14,
          }, pressed && { opacity: 0.75, transform: [{ scale: 0.98 }] }]}
        >
          <View style={{
            width: 38, height: 38, borderRadius: 10,
            backgroundColor: 'rgba(14,165,233,0.15)', alignItems: 'center', justifyContent: 'center',
          }}>
            <Text style={{ fontSize: 20 }}>📚</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.foreground }}>{a.viewAllReferences}</Text>
            <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>{a.browseEvidenceLibrary}</Text>
          </View>
          <IconSymbol name="chevron.right" size={14} color="#0EA5E9" />
        </Pressable>


        {/* ─── Dedication Section ──────────────────────────────────── */}
        <Pressable
          onPress={toggleDedication}
          style={({ pressed }) => [{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            backgroundColor: 'rgba(16,185,129,0.07)', borderWidth: 1,
            borderColor: 'rgba(16,185,129,0.22)', borderRadius: 14, padding: 14,
            marginTop: 12,
          }, pressed && { opacity: 0.75, transform: [{ scale: 0.98 }] }]}
        >
          <View style={{
            width: 38, height: 38, borderRadius: 10,
            backgroundColor: 'rgba(16,185,129,0.15)', alignItems: 'center', justifyContent: 'center',
          }}>
            <Text style={{ fontSize: 18, lineHeight: 22 }}>🌿</Text>
            <Text style={{ fontSize: 10, lineHeight: 12, marginTop: -2 }}>👨‍👩‍👧‍👦</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.foreground }}>{a.dedicationTitle}</Text>
            <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>
              {dedicationExpanded ? a.dedicationCollapseHint : a.dedicationSubtitle}
            </Text>
          </View>
          <Animated.View style={dedicationChevronStyle}>
            <IconSymbol name="chevron.right" size={14} color="#10B981" />
          </Animated.View>
        </Pressable>
        {/* Ghost view — rendered off-screen to measure natural height */}
        <View
          style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', left: 0, right: 0, top: -9999 }}
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            if (h > 0) setDedicationNaturalHeight(h);
          }}
        >
          <View style={{
            backgroundColor: 'rgba(16,185,129,0.05)', borderWidth: 1,
            borderColor: 'rgba(16,185,129,0.15)', borderRadius: 12,
            padding: 16, marginTop: 4,
          }}>
            <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 20 }}>{a.dedicationBody}</Text>
            <View style={{ height: 43 }} />{/* placeholder for share button height */}
          </View>
        </View>
        <Animated.View style={[dedicationBodyStyle, { overflow: 'hidden' }]}>
          <Animated.View style={dedicationBodyContentStyle}>
            <View style={{
              backgroundColor: 'rgba(16,185,129,0.05)', borderWidth: 1,
              borderColor: 'rgba(16,185,129,0.15)', borderRadius: 12,
              padding: 16, marginTop: 4,
            }}>
              <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 20 }}>
                {a.dedicationBody}
              </Text>
              {/* Share Dedication button */}
              <Pressable
                onPress={handleShareDedication}
                style={({ pressed }) => ([
                  {
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                    gap: 6, marginTop: 14, paddingVertical: 9, paddingHorizontal: 16,
                    backgroundColor: 'rgba(16,185,129,0.12)', borderRadius: 10,
                    borderWidth: 1, borderColor: 'rgba(16,185,129,0.28)',
                  },
                  pressed && { opacity: 0.7, transform: [{ scale: 0.97 }] },
                ])}
              >
                <Text style={{ fontSize: 13 }}>🌿</Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#10B981' }}>
                  {a.shareDedication}
                </Text>
              </Pressable>
            </View>
          </Animated.View>
        </Animated.View>

        {/* ─── Footer ──────────────────────────────────────────────── */}
        <Text style={[styles.footer, { color: colors.muted }]}>{footerText}</Text>
      </ScrollView>
    </ScreenContainer>
  );
}

const HIGHLIGHT_META = [
  { id: 'vitals',   emoji: '\uD83E\uDE7A', color: '#EF4444', bg: '#EF444415', border: '#EF444430', route: '/log/vitals' },
  { id: 'ai-macro', emoji: '\uD83D\uDCF7', color: '#8B5CF6', bg: '#8B5CF615', border: '#8B5CF630', route: '/log/nutrition?mode=plate' },
  { id: 'meds',     emoji: '\uD83D\uDC8A', color: '#0EA5E9', bg: '#0EA5E915', border: '#0EA5E930', route: '/log/medications' },
  { id: 'appts',    emoji: '\uD83D\uDCC5', color: '#F59E0B', bg: '#F59E0B15', border: '#F59E0B30', route: '/log/appointments' },
  { id: 'vaccines', emoji: '\uD83D\uDC89', color: '#22C55E', bg: '#22C55E15', border: '#22C55E30', route: '/log/immunizations' },
  { id: 'labs',     emoji: '\uD83E\uDDEA', color: '#06B6D4', bg: '#06B6D415', border: '#06B6D430', route: '/labs' },
  { id: 'surgical', emoji: '\uD83C\uDFE5', color: '#EC4899', bg: '#EC489915', border: '#EC489930', route: '/log/surgical-history' },
  { id: 'engine',   emoji: '\uD83E\uDDE0', color: '#A855F7', bg: '#A855F715', border: '#A855F730', route: '/(tabs)/analytics' },
] as const;

const styles = StyleSheet.create({
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 80,
  },
  backLabel: {
    fontSize: 16,
    fontWeight: '400',
  },
  navTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  navSpacer: { minWidth: 80 },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  hero: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 6,
  },
  logoRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  logoEmoji: { fontSize: 36 },
  appName: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  tagline: { fontSize: 14, fontWeight: '500' },
  version: { fontSize: 12 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    gap: 0,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  iconBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: 15, fontWeight: '700', flex: 1 },
  versionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  versionBadgeText: { fontSize: 11, fontWeight: '700' },
  cardBody: { fontSize: 14, lineHeight: 22 },

  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 6,
  },
  privacyIcon: { fontSize: 18, width: 26, textAlign: 'center' },
  privacyLabel: { fontSize: 14, fontWeight: '500', flex: 1 },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { flex: 1 },
  actionLabel: { fontSize: 15, fontWeight: '600' },
  actionSub: { fontSize: 12, marginTop: 1 },
  releaseBlock: { gap: 6 },
  releaseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  releaseVersion: { fontSize: 14, fontWeight: '700' },
  releaseDate: { fontSize: 12 },
  changeRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  changeDot: { fontSize: 14, lineHeight: 22, fontWeight: '700' },
  changeText: { fontSize: 14, lineHeight: 22, flex: 1 },
  disclaimer: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    gap: 6,
  },
  disclaimerTitle: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  disclaimerBody: { fontSize: 13, lineHeight: 20 },
  footer: {
    fontSize: 12,
    textAlign: 'center',
    paddingBottom: 8,
  },
  highlightsRow: {
    paddingHorizontal: 16,
    gap: 10,
    paddingVertical: 4,
  },
  highlightTile: {
    width: 80,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  highlightEmoji: {
    fontSize: 22,
    lineHeight: 26,
  },
  highlightLabel: {
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 13,
    letterSpacing: -0.1,
  },
});
