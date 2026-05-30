/**
 * VitalSync Theme Configuration — Premium Glass Dark
 *
 * Brand extracted from logo:
 *   Primary  — Vital Green  #22C55E  (logo "V" neon glow)
 *   Secondary— Electric Blue #38BDF8  (logo "S" lightning glow)
 *   Accent   — Pulse Red    #F43F5E  (ECG heartbeat line)
 *   Amber    — Rim Highlight #F59E0B  (logo edge accent)
 *
 * Elevation model (dark):
 *   Level 0 — background   #0D1117  (deep gunmetal canvas)
 *   Level 1 — surface      #161B22  (recessed/inset cards)
 *   Level 2 — surfaceRaised #1C2333 (floating cards, modals)
 *   Level 3 — surfaceHigh  #21273A  (popovers, tooltips)
 *
 * Elevation model (light):
 *   Level 0 — background   #F0F4F8
 *   Level 1 — surface      #ECEDF3  (recessed inset)
 *   Level 2 — surfaceRaised #FFFFFF (raised card)
 *   Level 3 — surfaceHigh  #FFFFFF  (use shadow for separation)
 */

/** @type {const} */
const themeColors = {
  // ── Canvas & Elevation — Deep Gunmetal (logo body) ─────────────────────────
  background:     { light: '#F0F4F8', dark: '#0D1117' },
  surface:        { light: '#ECEDF3', dark: '#161B22' },
  surfaceRaised:  { light: '#FFFFFF', dark: '#1C2333' },
  surfaceHigh:    { light: '#FFFFFF', dark: '#21273A' },

  // ── Typography ──────────────────────────────────────────────────────────────
  foreground:     { light: '#18181E', dark: '#F0F2FA' },
  foregroundSub:  { light: '#3A3A4A', dark: '#C8CCE0' },
  muted:          { light: '#5A5F72', dark: '#9AA0BA' },

  // ── Borders & Dividers ──────────────────────────────────────────────────────
  border:         { light: '#DCDCE6', dark: '#252B38' },
  borderStrong:   { light: '#C4C4D0', dark: '#323848' },

  // ── Brand / Primary — Vital Green (logo "V" glow) ──────────────────────────
  primary:        { light: '#16A34A', dark: '#22C55E' },
  primaryMuted:   { light: '#DCFCE7', dark: '#052E16' },
  tint:           { light: '#16A34A', dark: '#22C55E' },

  // ── Brand / Secondary — Electric Blue (logo "S" glow) ────────────────────
  secondary:      { light: '#0EA5E9', dark: '#38BDF8' },
  secondaryMuted: { light: '#E0F2FE', dark: '#0C1A2E' },

  // ── Brand / Pulse Red — ECG heartbeat line ───────────────────────────────
  pulseRed:       { light: '#E11D48', dark: '#F43F5E' },

  // ── Brand / Amber — Logo rim highlight ───────────────────────────────────
  amberRim:       { light: '#D97706', dark: '#F59E0B' },

  // ── Semantic ────────────────────────────────────────────────────────────────
  success:        { light: '#22C55E', dark: '#4ADE80' },
  warning:        { light: '#F59E0B', dark: '#FBBF24' },
  error:          { light: '#EF4444', dark: '#F87171' },

  // ── Health Domain Colors ────────────────────────────────────────────────────
  heartRed:       { light: '#EF4444', dark: '#FF6B6B' },
  sleepPurple:    { light: '#8B5CF6', dark: '#A78BFA' },
  bpGreen:        { light: '#10B981', dark: '#34D399' },
  bpAmber:        { light: '#F59E0B', dark: '#FBBF24' },
  bodyBlue:       { light: '#0EA5E9', dark: '#38BDF8' },
  spo2Blue:       { light: '#0EA5E9', dark: '#38BDF8' },
  tempOrange:     { light: '#F97316', dark: '#FB923C' },
  accent:         { light: '#6366F1', dark: '#818CF8' },

  // ── Shadow Colors ───────────────────────────────────────────────────────────
  shadowBase:     { light: '#A0A0B0', dark: '#000000' },
  shadowInner:    { light: '#C8C8D8', dark: '#000000' },

  // ── Glow colors for accent halos ────────────────────────────────────────────
  glowPrimary:    { light: '#16A34A', dark: '#22C55E' },
  glowSecondary:  { light: '#0EA5E9', dark: '#38BDF8' },
  glowHeart:      { light: '#EF4444', dark: '#EF4444' },
  glowSleep:      { light: '#8B5CF6', dark: '#8B5CF6' },
  glowBP:         { light: '#10B981', dark: '#10B981' },
  glowBody:       { light: '#0EA5E9', dark: '#0EA5E9' },
  glowSpO2:       { light: '#0EA5E9', dark: '#0EA5E9' },
  glowTemp:       { light: '#F97316', dark: '#F97316' },

  // ── Glassmorphism tokens ─────────────────────────────────────────────────────
  glass:          { light: 'rgba(255,255,255,0.60)', dark: 'rgba(22,27,34,0.72)' },
  glassBorder:    { light: 'rgba(255,255,255,0.70)', dark: 'rgba(255,255,255,0.10)' },
  glowGreen:      { light: 'rgba(22,163,74,0.12)',   dark: 'rgba(34,197,94,0.18)' },
  glowBlue:       { light: 'rgba(14,165,233,0.12)',  dark: 'rgba(56,189,248,0.18)' },
  glowRedSoft:    { light: 'rgba(225,29,72,0.10)',   dark: 'rgba(244,63,94,0.14)' },

  // ── Lab Domain Colors ────────────────────────────────────────────────────────
  labBlue:        { light: '#2563EB', dark: '#60A5FA' },
  labCritical:    { light: '#DC2626', dark: '#F87171' },
  labWarning:     { light: '#D97706', dark: '#FBBF24' },
  labNormal:      { light: '#16A34A', dark: '#4ADE80' },
  labLow:         { light: '#7C3AED', dark: '#A78BFA' },
  glowLab:        { light: '#2563EB', dark: '#2563EB' },
};

module.exports = { themeColors };
