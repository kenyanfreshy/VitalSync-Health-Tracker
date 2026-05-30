/**
 * ThemeProvider
 *
 * Manages the app's color scheme with four modes:
 *   "light"   — always light
   * "dark"    — always dark
 *   "system"  — follows the device system preference
 *   "amoled"  — pure-black OLED variant (background #000, surface #0A0A0A)
 *
 * Scheduled dark mode: when enabled, the app automatically switches to dark
 * between a user-defined start and end time. If the user's preference is
 * "amoled", the AMOLED palette is applied during the scheduled window instead
 * of plain dark — giving the deepest blacks exactly when the room is darkest.
 *
 * Automatic boundary detection:
 *   • AppState listener — re-evaluates the schedule every time the app
 *     returns to the foreground (e.g. user picks up the phone at 22:05).
 *   • 60-second interval — re-evaluates while the app is active so the
 *     switch happens within ~1 minute of the boundary without any tap.
 *
 * isAmoled resolution:
 *   • preference === "amoled"                       → always AMOLED
 *   • preference !== "amoled" && schedule fires     → plain dark (not AMOLED)
 *   • preference === "amoled" && schedule fires     → AMOLED (dark + AMOLED overrides)
 *
 * Persistence keys (AsyncStorage):
 *   @vsht:colorScheme   — "light" | "dark" | "system" | "amoled"
 *   @vsht:scheduledDark — JSON: { enabled, startHour, startMin, endHour, endMin }
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AppState,
  type AppStateStatus,
  Appearance,
  LayoutAnimation,
  Platform,
  View,
  useColorScheme as useSystemColorScheme,
} from "react-native";
import { colorScheme as nativewindColorScheme, vars } from "nativewind";

import { SchemeColors, type ColorScheme } from "@/constants/theme";
import { safeSetItem } from '@/lib/safe-async-storage';

// ─── Storage keys ─────────────────────────────────────────────────────────────

const SCHEME_KEY   = "@vsht:colorScheme";
const SCHEDULE_KEY = "@vsht:scheduledDark";

// ─── Types ────────────────────────────────────────────────────────────────────

/** User-facing theme preference — "system" and "amoled" extend the base ColorScheme */
export type ThemePreference = ColorScheme | "system" | "amoled";

export interface ScheduledDarkConfig {
  enabled: boolean;
  /** 0–23 */
  startHour: number;
  startMin: number;
  /** 0–23 */
  endHour: number;
  endMin: number;
}

export const DEFAULT_SCHEDULE: ScheduledDarkConfig = {
  enabled: true,
  startHour: 22,
  startMin: 0,
  endHour: 7,
  endMin: 0,
};

type ThemeContextValue = {
  /** The resolved scheme actually applied to the UI — always "light" | "dark" */
  colorScheme: ColorScheme;
  /** The user's stored preference — "light" | "dark" | "system" | "amoled" */
  preference: ThemePreference;
  setPreference: (pref: ThemePreference) => void;
  /** Whether the AMOLED pure-black palette is active */
  isAmoled: boolean;
  scheduledDark: ScheduledDarkConfig;
  setScheduledDark: (cfg: ScheduledDarkConfig) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

// ─── AMOLED palette override ──────────────────────────────────────────────────
// Overrides only the surface tokens; all other tokens remain from the dark palette.
const AMOLED_OVERRIDES: Partial<Record<string, string>> = {
  background:    "#000000",
  surface:       "#0A0A0A",
  surfaceRaised: "#111111",
  surfaceHigh:   "#181818",
  border:        "#1A1A1A",
  borderStrong:  "#222222",
};

function buildAmoledPalette(): Record<string, string> {
  return { ...SchemeColors.dark, ...AMOLED_OVERRIDES };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true if the current local time falls within [startH:startM, endH:endM).
 *  Supports overnight ranges (e.g., 22:00 → 07:00). */
function isWithinSchedule(cfg: ScheduledDarkConfig): boolean {
  if (!cfg.enabled) return false;
  const now = new Date();
  const nowMins   = now.getHours() * 60 + now.getMinutes();
  const startMins = cfg.startHour * 60 + cfg.startMin;
  const endMins   = cfg.endHour   * 60 + cfg.endMin;
  if (startMins <= endMins) {
    // Same-day range (e.g., 08:00 → 20:00)
    return nowMins >= startMins && nowMins < endMins;
  } else {
    // Overnight range (e.g., 22:00 → 07:00)
    return nowMins >= startMins || nowMins < endMins;
  }
}

function resolveScheme(
  pref: ThemePreference,
  systemScheme: ColorScheme,
  schedule: ScheduledDarkConfig,
): ColorScheme {
  // Scheduled window overrides preference (both dark and amoled render as "dark")
  if (schedule.enabled && isWithinSchedule(schedule)) return "dark";
  if (pref === "system") return systemScheme;
  if (pref === "amoled") return "dark"; // AMOLED renders as dark
  return pref;
}

function applySchemeToDOM(scheme: ColorScheme, amoled: boolean) {
  nativewindColorScheme.set(scheme);
  Appearance.setColorScheme?.(scheme);
  if (typeof document !== "undefined") {
    const root = document.documentElement;
    root.dataset.theme = scheme;
    root.classList.toggle("dark", scheme === "dark");
    const palette = amoled ? buildAmoledPalette() : SchemeColors[scheme];
    Object.entries(palette).forEach(([token, value]) => {
      root.style.setProperty(`--color-${token}`, value);
    });
  }
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = (useSystemColorScheme() ?? "light") as ColorScheme;

  const [preference, setPreferenceState] = useState<ThemePreference>("dark");
  const [schedule, setScheduleState]     = useState<ScheduledDarkConfig>(DEFAULT_SCHEDULE);
  const [isLoaded, setIsLoaded]          = useState(false);

  // Keep refs so the AppState / interval callbacks always see the latest values
  // without needing to re-register the listeners on every state change.
  const prefRef     = useRef<ThemePreference>("dark");
  const scheduleRef = useRef<ScheduledDarkConfig>(DEFAULT_SCHEDULE);
  const sysRef      = useRef<ColorScheme>(systemScheme);

  // Sync refs whenever state changes
  useEffect(() => { prefRef.current = preference; }, [preference]);
  useEffect(() => { scheduleRef.current = schedule; }, [schedule]);
  useEffect(() => { sysRef.current = systemScheme; }, [systemScheme]);

  // ── Re-evaluate helper (called by AppState listener and interval) ──────────
  const reEvaluateSchedule = useCallback(() => {
    const pref   = prefRef.current;
    const sched  = scheduleRef.current;
    const sys    = sysRef.current;
    if (!sched.enabled) return; // nothing to do
    const resolved = resolveScheme(pref, sys, sched);
    const amoled   = pref === "amoled"; // AMOLED whenever pref is amoled
    applySchemeToDOM(resolved, amoled);
    // Force a React re-render so isAmoled / colorScheme derived values update
    setPreferenceState((p) => p); // identity update triggers useMemo recalc
  }, []);

  // ── Load persisted values on mount ────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(SCHEME_KEY),
      AsyncStorage.getItem(SCHEDULE_KEY),
    ])
      .then(([storedPref, storedSched]) => {
        const pref  = (storedPref as ThemePreference | null) ?? "dark";
        const sched: ScheduledDarkConfig = storedSched
          ? { ...DEFAULT_SCHEDULE, ...JSON.parse(storedSched) }
          : DEFAULT_SCHEDULE;
        setPreferenceState(pref);
        setScheduleState(sched);
        prefRef.current    = pref;
        scheduleRef.current = sched;
        const resolved = resolveScheme(pref, systemScheme, sched);
        const amoled   = pref === "amoled";
        applySchemeToDOM(resolved, amoled);
      })
      .catch(() => {
        applySchemeToDOM("dark", false);
      })
      .finally(() => setIsLoaded(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── AppState listener — re-evaluate on foreground resume ──────────────────
  useEffect(() => {
    if (!isLoaded) return;
    const appStateRef = { current: AppState.currentState };
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (
        (appStateRef.current === "background" || appStateRef.current === "inactive") &&
        next === "active"
      ) {
        reEvaluateSchedule();
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, [isLoaded, reEvaluateSchedule]);

  // ── 60-second interval — re-evaluate while app is active ──────────────────
  useEffect(() => {
    if (!isLoaded) return;
    const id = setInterval(reEvaluateSchedule, 60_000);
    return () => clearInterval(id);
  }, [isLoaded, reEvaluateSchedule]);

  // ── Re-resolve when system scheme changes (relevant in "system" mode) ──────
  useEffect(() => {
    if (!isLoaded) return;
    if (preference === "system") {
      applySchemeToDOM(systemScheme, false);
    }
  }, [systemScheme, preference, isLoaded]);

  // ── Public setters ────────────────────────────────────────────────────────
  const setPreference = useCallback(
    (pref: ThemePreference) => {
      if (Platform.OS !== "web") {
        LayoutAnimation.configureNext({
          duration: 280,
          create: { type: "easeInEaseOut", property: "opacity" },
          update: { type: "easeInEaseOut" },
          delete: { type: "easeInEaseOut", property: "opacity" },
        });
      }
      setPreferenceState(pref);
      prefRef.current = pref;
      const resolved = resolveScheme(pref, systemScheme, schedule);
      const amoled   = pref === "amoled";
      applySchemeToDOM(resolved, amoled);
      safeSetItem(SCHEME_KEY, pref).catch(() => {});
    },
    [systemScheme, schedule],
  );

  const setScheduledDark = useCallback(
    (cfg: ScheduledDarkConfig) => {
      setScheduleState(cfg);
      scheduleRef.current = cfg;
      safeSetItem(SCHEDULE_KEY, JSON.stringify(cfg)).catch(() => {});
      // Re-apply immediately in case we just entered/left the window.
      // If preference is "amoled", honour AMOLED palette even during the scheduled window.
      const resolved = resolveScheme(preference, systemScheme, cfg);
      const amoled   = preference === "amoled";
      applySchemeToDOM(resolved, amoled);
    },
    [preference, systemScheme],
  );

  // ── Derived values ────────────────────────────────────────────────────────
  const colorScheme = resolveScheme(preference, systemScheme, schedule);
  // AMOLED is active whenever preference is "amoled" — including during the
  // scheduled window so the deepest blacks fire automatically at night.
  const isAmoled = preference === "amoled";

  // Build NativeWind CSS variable map
  const themeVariables = useMemo(() => {
    const palette = isAmoled ? buildAmoledPalette() : SchemeColors[colorScheme];
    const varMap: Record<string, string> = {};
    Object.entries(palette).forEach(([token, value]) => {
      varMap[`color-${token}`] = value;
    });
    return vars(varMap);
  }, [colorScheme, isAmoled]);

  const value = useMemo(
    () => ({ colorScheme, preference, setPreference, isAmoled, scheduledDark: schedule, setScheduledDark }),
    [colorScheme, preference, setPreference, isAmoled, schedule, setScheduledDark],
  );

  if (!isLoaded) return null;

  return (
    <ThemeContext.Provider value={value}>
      <View style={[{ flex: 1 }, themeVariables]}>{children}</View>
    </ThemeContext.Provider>
  );
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useThemeContext must be used within ThemeProvider");
  return ctx;
}

/** Convenience hook — same API as before for components that only need the resolved scheme */
export function useColorSchemeResolved(): ColorScheme {
  return useThemeContext().colorScheme;
}
