/**
 * useDarkAdaptive — Returns pre-computed dark/light adaptive style props
 * for common card patterns, reducing repetition across screens.
 */

import { useColorScheme } from 'react-native';
import { useColors } from './use-colors';

export function useDarkAdaptive() {
  const colors = useColors();
  const scheme = useColorScheme() ?? 'light';
  const isDark = scheme === 'dark';

  /** Raised card (elevation 2) — primary content card */
  const raisedCard = {
    backgroundColor: isDark ? colors.surfaceRaised : colors.surfaceRaised,
    borderColor: isDark ? colors.borderStrong : colors.border,
    shadowColor: isDark ? '#000000' : (colors.shadowBase ?? '#A0A0B0'),
    shadowOffset: { width: 0, height: isDark ? 4 : 2 },
    shadowOpacity: isDark ? 0.45 : 0.07,
    shadowRadius: isDark ? 10 : 6,
    elevation: isDark ? 6 : 2,
  };

  /** Surface card (elevation 1) — recessed / inset feel */
  const surfaceCard = {
    backgroundColor: isDark ? colors.surface : colors.surface,
    borderColor: isDark ? colors.border : colors.border,
    shadowColor: isDark ? '#000000' : (colors.shadowBase ?? '#A0A0B0'),
    shadowOffset: { width: 0, height: isDark ? 2 : 1 },
    shadowOpacity: isDark ? 0.35 : 0.05,
    shadowRadius: isDark ? 6 : 3,
    elevation: isDark ? 3 : 1,
  };

  /** High card (elevation 3) — modal / popover */
  const highCard = {
    backgroundColor: isDark ? colors.surfaceHigh : colors.surfaceRaised,
    borderColor: isDark ? colors.borderStrong : colors.border,
    shadowColor: isDark ? '#000000' : (colors.shadowBase ?? '#A0A0B0'),
    shadowOffset: { width: 0, height: isDark ? 8 : 4 },
    shadowOpacity: isDark ? 0.55 : 0.10,
    shadowRadius: isDark ? 16 : 10,
    elevation: isDark ? 10 : 4,
  };

  /** Pill / chip background */
  const chip = (color: string) => ({
    backgroundColor: color + (isDark ? '28' : '18'),
    borderColor: color + (isDark ? '50' : '38'),
  });

  /** Icon badge background */
  const iconBadge = (color: string) => ({
    backgroundColor: color + (isDark ? '28' : '18'),
  });

  return { isDark, raisedCard, surfaceCard, highCard, chip, iconBadge, colors };
}
