/**
 * PrivacyBanner
 *
 * A compact, always-visible banner shown at the top of clinical record screens
 * (Medical History, Surgical History, Personal Records) to reassure users that
 * their data stays on-device and is never uploaded to any server.
 *
 * Reads the current language via useLang() and renders the appropriate
 * privacyStrings translation.
 */
import React from 'react';
import { View, Text } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { GlassCard } from '@/components/glass-card';
import { useColors, useLang } from '@/hooks';
import { privacyStrings, toStaticLang } from '@/lib/i18n';
const ACCENT = '#10B981';

export function PrivacyBanner() {
  const colors = useColors();
  const lang = useLang();
  const p = (privacyStrings as any)[toStaticLang(lang)] ?? privacyStrings.en;

  return (
    <GlassCard accentColor={ACCENT} noPadding style={{ marginBottom: 8 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: 10,
          paddingHorizontal: 14,
          paddingVertical: 12,
        }}
      >
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: 9,
            backgroundColor: ACCENT + '20',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            marginTop: 1,
          }}
        >
          <IconSymbol name="lock.fill" size={14} color={ACCENT} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            style={{
              fontSize: 11,
              fontWeight: '700',
              letterSpacing: 0.3,
              textTransform: 'uppercase',
              color: ACCENT,
            }}
          >
            {p.badge}
          </Text>
          <Text
            style={{
              fontSize: 12,
              lineHeight: 17,
              color: colors.muted,
            }}
          >
            {p.body}
          </Text>
        </View>
      </View>
    </GlassCard>
  );
}
