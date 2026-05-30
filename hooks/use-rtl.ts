/**
 * useRTL — reactive RTL detection hook.
 *
 * Returns `true` when the currently selected language is right-to-left
 * (Arabic, Hebrew, Farsi, Urdu). Components can use this to conditionally
 * apply `flexDirection: 'row-reverse'`, `textAlign: 'right'`, etc.
 *
 * Usage:
 *   const isRTL = useRTL();
 *   <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
 */
import { useLang } from '@/hooks/use-lang';
import { isRTLLang } from '@/lib/rtl';

export function useRTL(): boolean {
  const lang = useLang();
  return isRTLLang(lang);
}

/**
 * Returns a style object with RTL-aware row direction and text alignment.
 * Useful for rows that contain an icon + label.
 *
 * Usage:
 *   const rtlRow = useRTLRow();
 *   <View style={[styles.row, rtlRow.row]}>
 *     <Text style={[styles.label, rtlRow.text]}>…</Text>
 *   </View>
 */
export function useRTLStyles() {
  const isRTL = useRTL();
  return {
    row: {
      flexDirection: (isRTL ? 'row-reverse' : 'row') as 'row' | 'row-reverse',
    },
    text: {
      textAlign: (isRTL ? 'right' : 'left') as 'right' | 'left',
      writingDirection: (isRTL ? 'rtl' : 'ltr') as 'rtl' | 'ltr',
    },
    paddingStart: isRTL
      ? { paddingRight: 12, paddingLeft: 0 }
      : { paddingLeft: 12, paddingRight: 0 },
  };
}
