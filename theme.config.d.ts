export const themeColors: {
  // Canvas & Elevation
  background:    { light: string; dark: string };
  surface:       { light: string; dark: string };
  surfaceRaised: { light: string; dark: string };
  surfaceHigh:   { light: string; dark: string };
  // Typography
  foreground:    { light: string; dark: string };
  foregroundSub: { light: string; dark: string };
  muted:         { light: string; dark: string };
  // Borders
  border:        { light: string; dark: string };
  borderStrong:  { light: string; dark: string };
  // Brand
  primary:       { light: string; dark: string };
  primaryMuted:  { light: string; dark: string };
  // Semantic
  success:       { light: string; dark: string };
  warning:       { light: string; dark: string };
  error:         { light: string; dark: string };
  // Health Domain
  heartRed:      { light: string; dark: string };
  sleepPurple:   { light: string; dark: string };
  bpGreen:       { light: string; dark: string };
  bpAmber:       { light: string; dark: string };
  bodyBlue:      { light: string; dark: string };
  spo2Blue:      { light: string; dark: string };
  tempOrange:    { light: string; dark: string };
  accent:        { light: string; dark: string };
  // Shadow & Glow
  shadowBase:    { light: string; dark: string };
  shadowInner:   { light: string; dark: string };
  glowPrimary:   { light: string; dark: string };
  glowHeart:     { light: string; dark: string };
  glowSleep:     { light: string; dark: string };
  glowBP:        { light: string; dark: string };
  glowBody:      { light: string; dark: string };
  glowSpO2:      { light: string; dark: string };
  glowTemp:      { light: string; dark: string };
  // Lab Domain
  labBlue:       { light: string; dark: string };
  labCritical:   { light: string; dark: string };
  labWarning:    { light: string; dark: string };
  labNormal:     { light: string; dark: string };
  labLow:        { light: string; dark: string };
  glowLab:       { light: string; dark: string };
};

declare const themeConfig: {
  themeColors: typeof themeColors;
};

export default themeConfig;
