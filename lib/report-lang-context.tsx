/**
 * ReportLangContext
 * Shared context for the selected report language and recent languages.
 * Allows the Report screen and Settings to stay in sync bidirectionally.
 */
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSetItem } from '@/lib/safe-async-storage';
import { appendConfigAuditEntry, langLabel } from '@/lib/config-audit-log';
import { SUPPORTED_LANGUAGES, SUPPORTED_LANG_CODES, type SupportedLangCode } from '@/lib/supported-languages';
import { detectLang, addLangListener } from '@/lib/i18n';

/**
 * Derive the best matching ReportLang from the app's current UI language.
 * If the app language is supported as a report language, use it directly.
 * Otherwise fall back to English.
 */
function getDefaultReportLang(): ReportLang {
  const appLang = detectLang();
  // Exact match (e.g. 'fr', 'es', 'zh')
  if (SUPPORTED_LANG_CODES.has(appLang)) return appLang as ReportLang;
  // Base-language match (e.g. 'fr-CA' → 'fr')
  const base = appLang.split('-')[0];
  if (SUPPORTED_LANG_CODES.has(base)) return base as ReportLang;
  return 'en';
}

export const REPORT_LANG_KEY = '@report:reportLang';
export const REPORT_LANG_CHANGED_KEY = '@report:langChangedAt';
export const RECENT_LANGS_KEY = '@report:recentLangs';

/** Union of all 15 supported language codes */
export type ReportLang = SupportedLangCode;

/** Ordered list of all supported report languages */
export const ALL_REPORT_LANGS: ReportLang[] = SUPPORTED_LANGUAGES.map(l => l.code) as ReportLang[];

interface ReportLangContextValue {
  reportLang: ReportLang;
  setReportLang: (lang: ReportLang) => void;
  langChangedAt: Date | null;
  recentLangs: ReportLang[];
  clearRecentLangs: () => void;
}

const ReportLangContext = createContext<ReportLangContextValue>({
  reportLang: 'en',
  setReportLang: () => {},
  langChangedAt: null,
  recentLangs: [],
  clearRecentLangs: () => {},
});

export function ReportLangProvider({ children }: { children: React.ReactNode }) {
  // Default to the app's current UI language so the report preview matches
  // the language the user has set in Settings. Falls back to English if the
  // app language is not a supported report language.
  const [reportLang, setReportLangState] = useState<ReportLang>(getDefaultReportLang);
  const [langChangedAt, setLangChangedAt] = useState<Date | null>(null);
  const [recentLangs, setRecentLangs] = useState<ReportLang[]>([]);

  // Track whether the user has explicitly chosen a report language.
  // When false, the report language follows the app UI language automatically.
  const [userOverrode, setUserOverrode] = useState(false);

  // Restore persisted values on mount — if the user previously chose a
  // specific report language, honour that; otherwise keep the app-language
  // default set above.
  useEffect(() => {
    AsyncStorage.getItem(REPORT_LANG_KEY).then(v => {
      if (v && ALL_REPORT_LANGS.includes(v as ReportLang)) {
        setReportLangState(v as ReportLang);
        setUserOverrode(true);
      }
      // If no persisted value, the useState initializer already set the
      // correct app-language default — no further action needed.
    }).catch(() => {});
    AsyncStorage.getItem(REPORT_LANG_CHANGED_KEY).then(v => {
      if (v) setLangChangedAt(new Date(v));
    }).catch(() => {});
    AsyncStorage.getItem(RECENT_LANGS_KEY).then(v => {
      if (v) { try { setRecentLangs(JSON.parse(v)); } catch {} }
    }).catch(() => {});
  }, []);

  // When the app UI language changes (e.g. user picks a new language in
  // Settings), automatically update the report language to match — but only
  // if the user has NOT manually overridden the report language.
  useEffect(() => {
    if (!userOverrode) {
      setReportLangState(getDefaultReportLang());
    }
    const unsub = addLangListener(() => {
      if (!userOverrode) setReportLangState(getDefaultReportLang());
    });
    return () => { unsub(); };
  }, [userOverrode]);

  const setReportLang = useCallback((lang: ReportLang) => {
    // Mark that the user has explicitly chosen a report language so we stop
    // auto-following the app UI language.
    setUserOverrode(true);
    // Capture previous lang for audit before updating state
    setReportLangState(prev => {
      // Append audit entry asynchronously (fire-and-forget)
      appendConfigAuditEntry({
        event: 'report_language_changed',
        from: prev,
        to: lang,
        note: `Report language changed from ${langLabel(prev)} to ${langLabel(lang)}`,
      });
      return lang;
    });
    const now = new Date();
    setLangChangedAt(now);
    safeSetItem(REPORT_LANG_KEY, lang).catch(() => {});
    safeSetItem(REPORT_LANG_CHANGED_KEY, now.toISOString()).catch(() => {});
    // Track recents (max 3, most recent first, exclude EN)
    if (lang !== 'en') {
      setRecentLangs(prev => {
        const updated = [lang, ...prev.filter(l => l !== lang)].slice(0, 3) as ReportLang[];
        safeSetItem(RECENT_LANGS_KEY, JSON.stringify(updated)).catch(() => {});
        return updated;
      });
    }
  }, []);

  const clearRecentLangs = useCallback(() => {
    setRecentLangs([]);
    AsyncStorage.removeItem(RECENT_LANGS_KEY).catch(() => {});
  }, []);

  return (
    <ReportLangContext.Provider value={{ reportLang, setReportLang, langChangedAt, recentLangs, clearRecentLangs }}>
      {children}
    </ReportLangContext.Provider>
  );
}

export function useReportLang() {
  return useContext(ReportLangContext);
}
