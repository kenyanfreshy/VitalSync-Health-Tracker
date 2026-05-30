/**
 * ScrollableCalendar — A fully native, zero-dependency inline date + time picker.
 *
 * Layout:
 *  ┌─────────────────────────────────────────────┐
 *  │  ◀  April 2026  ▶                           │
 *  │  Su Mo Tu We Th Fr Sa                       │
 *  │   …  …  …  …  …  …  …                      │  ← month grid
 *  ├─────────────────────────────────────────────┤
 *  │  [  Hour  ]  :  [ Minute ]  [  AM / PM  ]  │  ← time drum-roll (optional)
 *  └─────────────────────────────────────────────┘
 *
 * Props:
 *   value      – currently selected Date (or null)
 *   onChange   – called with the new Date whenever user picks a day or time
 *   showTime   – show the time drum-roll row (default true)
 *   minDate    – earliest selectable date (optional)
 *   maxDate    – latest selectable date (optional)
 *   accentColor – highlight colour for the selected day (default primary)
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useColorScheme, useColors } from '@/hooks';

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const HOURS_12 = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
const MINUTES  = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
const AMPM     = ['AM', 'PM'];

const DRUM_ITEM_H = 40;
const DRUM_VISIBLE = 3; // items visible at once in the drum-roll

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function startOfMonth(year: number, month: number): Date {
  return new Date(year, month, 1);
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Build the grid cells for a given month (including leading/trailing blanks). */
function buildGrid(year: number, month: number): (number | null)[] {
  const firstDay = startOfMonth(year, month).getDay(); // 0=Sun
  const total    = daysInMonth(year, month);
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= total; d++) cells.push(d);
  // Pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

// ─── DrumRoll ─────────────────────────────────────────────────────────────────

interface DrumRollProps {
  items: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  width: number;
  accentColor: string;
  isDark: boolean;
  textColor: string;
  mutedColor: string;
  borderColor: string;
}

function DrumRoll({
  items,
  selectedIndex,
  onSelect,
  width,
  accentColor,
  isDark,
  textColor,
  mutedColor,
  borderColor,
}: DrumRollProps) {
  const ref = useRef<ScrollView>(null);
  // Prevents the programmatic scrollTo() from re-triggering the scroll-end handlers
  const isSnapping = useRef(false);
  // Tracks whether momentum is still active so onScrollEndDrag can defer to onMomentumScrollEnd
  const hasMomentum = useRef(false);

  // Scroll to selected item on mount / when external state changes
  useEffect(() => {
    isSnapping.current = true;
    ref.current?.scrollTo({ y: selectedIndex * DRUM_ITEM_H, animated: false });
    const t = setTimeout(() => { isSnapping.current = false; }, 50);
    return () => clearTimeout(t);
  }, [selectedIndex]);

  const snapToIndex = useCallback((rawY: number) => {
    const idx = Math.round(rawY / DRUM_ITEM_H);
    const clamped = Math.max(0, Math.min(items.length - 1, idx));
    isSnapping.current = true;
    ref.current?.scrollTo({ y: clamped * DRUM_ITEM_H, animated: true });
    // Release guard after the snap animation (~300 ms)
    setTimeout(() => { isSnapping.current = false; }, 350);
    if (clamped !== selectedIndex) onSelect(clamped);
  }, [items.length, selectedIndex, onSelect]);

  // Fires when iOS native momentum deceleration finishes
  const handleMomentumEnd = useCallback((e: any) => {
    hasMomentum.current = false;
    if (isSnapping.current) return;
    snapToIndex(e.nativeEvent.contentOffset.y);
  }, [snapToIndex]);

  // Fires when the finger lifts — only snap if no momentum is following
  const handleDragEnd = useCallback((e: any) => {
    if (hasMomentum.current) return; // momentum handler will take over
    if (isSnapping.current) return;
    snapToIndex(e.nativeEvent.contentOffset.y);
  }, [snapToIndex]);

  const containerH = DRUM_ITEM_H * DRUM_VISIBLE;

  return (
    <View style={{ width, height: containerH, overflow: 'hidden' }}>
      {/* Selection highlight band */}
      <View
        style={[
          drumStyles.band,
          {
            top: DRUM_ITEM_H,
            height: DRUM_ITEM_H,
            backgroundColor: accentColor + '22',
            borderTopColor: accentColor + '55',
            borderBottomColor: accentColor + '55',
          },
        ]}
        pointerEvents="none"
      />
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={DRUM_ITEM_H}
        decelerationRate="fast"
        onScrollBeginDrag={() => { hasMomentum.current = false; }}
        onMomentumScrollBegin={() => { hasMomentum.current = true; }}
        onMomentumScrollEnd={handleMomentumEnd}
        onScrollEndDrag={handleDragEnd}
        contentContainerStyle={{ paddingVertical: DRUM_ITEM_H }}
      >
        {items.map((label, idx) => (
          <Pressable
            key={label}
            onPress={() => {
              onSelect(idx);
              ref.current?.scrollTo({ y: idx * DRUM_ITEM_H, animated: true });
            }}
            style={({ pressed }) => [
              drumStyles.item,
              { height: DRUM_ITEM_H, opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Text
              style={[
                drumStyles.itemText,
                {
                  color: idx === selectedIndex ? accentColor : mutedColor,
                  fontWeight: idx === selectedIndex ? '700' : '400',
                  fontSize: idx === selectedIndex ? 18 : 15,
                },
              ]}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const drumStyles = StyleSheet.create({
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 1,
  },
  item: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemText: {
    letterSpacing: 0.3,
  },
});

// ─── Standalone Time-only Picker ─────────────────────────────────────────────

/**
 * TimePickerDrum — drum-roll hour:minute:AM/PM picker that returns an "HH:MM" string.
 * Used for medication schedule times.
 */
export interface TimePickerDrumProps {
  value: string; // "HH:MM" 24-hour format
  onChange: (time: string) => void;
  accentColor?: string;
}

export function TimePickerDrum({ value, onChange, accentColor: accentProp }: TimePickerDrumProps) {
  const colors  = useColors();
  const isDark  = useColorScheme() === 'dark';
  const accent  = accentProp ?? colors.primary;

  const bg          = isDark ? '#1C2128' : '#FFFFFF';
  const textColor   = isDark ? '#E6EDF3' : '#1A1A2E';
  const mutedColor  = isDark ? '#8B949E' : '#6E7681';
  const borderColor = isDark ? '#30363D' : '#E2E8F0';

  // Parse "HH:MM" (24h) into drum indices
  const parse = (v: string) => {
    const [hh = 8, mm = 0] = v.split(':').map(Number);
    const ap = hh >= 12 ? 1 : 0;
    const h12 = hh === 0 ? 11 : hh > 12 ? hh - 12 - 1 : hh - 1;
    return { h12, mm, ap };
  };

  const { h12: initH, mm: initM, ap: initAP } = parse(value);
  const [hourIdx,   setHourIdx]   = useState(initH);
  const [minuteIdx, setMinuteIdx] = useState(initM);
  const [ampmIdx,   setAmpmIdx]   = useState(initAP);

  const emit = useCallback((hIdx: number, mIdx: number, apIdx: number) => {
    const hour24 = apIdx === 0
      ? (hIdx + 1 === 12 ? 0 : hIdx + 1)
      : (hIdx + 1 === 12 ? 12 : hIdx + 1 + 12);
    onChange(`${String(hour24).padStart(2, '0')}:${String(mIdx).padStart(2, '0')}`);
  }, [onChange]);

  return (
    <View style={[tpStyles.container, { backgroundColor: bg, borderColor }]}>
      <View style={tpStyles.drumRow}>
        <DrumRoll
          items={HOURS_12}
          selectedIndex={hourIdx}
          onSelect={(i) => { setHourIdx(i); emit(i, minuteIdx, ampmIdx); }}
          width={56}
          accentColor={accent}
          isDark={isDark}
          textColor={textColor}
          mutedColor={mutedColor}
          borderColor={borderColor}
        />
        <Text style={[tpStyles.colon, { color: textColor }]}>:</Text>
        <DrumRoll
          items={MINUTES}
          selectedIndex={minuteIdx}
          onSelect={(i) => { setMinuteIdx(i); emit(hourIdx, i, ampmIdx); }}
          width={56}
          accentColor={accent}
          isDark={isDark}
          textColor={textColor}
          mutedColor={mutedColor}
          borderColor={borderColor}
        />
        <View style={{ width: 12 }} />
        <DrumRoll
          items={AMPM}
          selectedIndex={ampmIdx}
          onSelect={(i) => { setAmpmIdx(i); emit(hourIdx, minuteIdx, i); }}
          width={52}
          accentColor={accent}
          isDark={isDark}
          textColor={textColor}
          mutedColor={mutedColor}
          borderColor={borderColor}
        />
      </View>
    </View>
  );
}

const tpStyles = StyleSheet.create({
  container: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    marginVertical: 4,
  },
  drumRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  colon: {
    fontSize: 22,
    fontWeight: '700',
    marginHorizontal: 4,
    lineHeight: DRUM_ITEM_H,
  },
});

// ─── Main Component ───────────────────────────────────────────────────────────

export interface ScrollableCalendarProps {
  value: Date | null;
  onChange: (date: Date) => void;
  showTime?: boolean;
  minDate?: Date;
  maxDate?: Date;
  accentColor?: string;
}

export function ScrollableCalendar({
  value,
  onChange,
  showTime = true,
  minDate,
  maxDate,
  accentColor: accentProp,
}: ScrollableCalendarProps) {
  const colors  = useColors();
  const isDark  = useColorScheme() === 'dark';
  const accent  = accentProp ?? colors.primary;

  const today = useMemo(() => new Date(), []);

  // ── Calendar state ──────────────────────────────────────────────────────────
  const [viewYear,  setViewYear]  = useState(value ? value.getFullYear()  : today.getFullYear());
  const [viewMonth, setViewMonth] = useState(value ? value.getMonth()     : today.getMonth());

  // ── Time state ──────────────────────────────────────────────────────────────
  const toHour12 = (d: Date) => {
    const h = d.getHours();
    return h === 0 ? 11 : h > 12 ? h - 12 - 1 : h - 1; // index into HOURS_12
  };

  const [hourIdx,   setHourIdx]   = useState(value ? toHour12(value)       : 7);  // default 8 AM
  const [minuteIdx, setMinuteIdx] = useState(value ? value.getMinutes()    : 0);
  const [ampmIdx,   setAmpmIdx]   = useState(value ? (value.getHours() >= 12 ? 1 : 0) : 0);

  // ── Derived grid ────────────────────────────────────────────────────────────
  const grid = useMemo(() => buildGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  // ── Navigation ──────────────────────────────────────────────────────────────
  const prevMonth = useCallback(() => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }, [viewMonth]);

  const nextMonth = useCallback(() => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }, [viewMonth]);

  // ── Build a Date from current selections ────────────────────────────────────
  const buildDate = useCallback(
    (day: number, hIdx: number, mIdx: number, apIdx: number): Date => {
      const hour24 = apIdx === 0
        ? (hIdx + 1 === 12 ? 0 : hIdx + 1)
        : (hIdx + 1 === 12 ? 12 : hIdx + 1 + 12);
      return new Date(viewYear, viewMonth, day, hour24, mIdx, 0, 0);
    },
    [viewYear, viewMonth],
  );

  // ── Day press ────────────────────────────────────────────────────────────────
  const handleDayPress = useCallback(
    (day: number) => {
      const d = buildDate(day, hourIdx, minuteIdx, ampmIdx);
      onChange(d);
    },
    [buildDate, hourIdx, minuteIdx, ampmIdx, onChange],
  );

  // ── Time change ──────────────────────────────────────────────────────────────
  const handleTimeChange = useCallback(
    (hIdx: number, mIdx: number, apIdx: number) => {
      const selectedDay = value ? value.getDate() : today.getDate();
      const d = buildDate(selectedDay, hIdx, mIdx, apIdx);
      onChange(d);
    },
    [buildDate, value, today, onChange],
  );

  // ── Colours ──────────────────────────────────────────────────────────────────
  const bg        = isDark ? '#1C2128' : '#FFFFFF';
  const headerBg  = isDark ? '#161B22' : '#F8FAFC';
  const textColor = isDark ? '#E6EDF3' : '#1A1A2E';
  const mutedColor= isDark ? '#8B949E' : '#6E7681';
  const borderColor = isDark ? '#30363D' : '#E2E8F0';
  const todayRing = isDark ? '#58A6FF' : '#0969DA';

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <View style={[s.container, { backgroundColor: bg, borderColor }]}>

      {/* ── Month Header ── */}
      <View style={[s.header, { backgroundColor: headerBg, borderBottomColor: borderColor }]}>
        <Pressable
          onPress={prevMonth}
          style={({ pressed }) => [s.navBtn, pressed && { opacity: 0.5 }]}
          hitSlop={12}
        >
          <Text style={[s.navArrow, { color: accent }]}>‹</Text>
        </Pressable>
        <Text style={[s.monthLabel, { color: textColor }]}>
          {MONTHS[viewMonth]} {viewYear}
        </Text>
        <Pressable
          onPress={nextMonth}
          style={({ pressed }) => [s.navBtn, pressed && { opacity: 0.5 }]}
          hitSlop={12}
        >
          <Text style={[s.navArrow, { color: accent }]}>›</Text>
        </Pressable>
      </View>

      {/* ── Day-of-week labels ── */}
      <View style={s.dowRow}>
        {DAYS_SHORT.map(d => (
          <Text key={d} style={[s.dowLabel, { color: mutedColor }]}>{d}</Text>
        ))}
      </View>

      {/* ── Day grid ── */}
      <View style={s.grid}>
        {grid.map((day, idx) => {
          if (day === null) {
            return <View key={`blank-${idx}`} style={s.cell} />;
          }
          const cellDate   = new Date(viewYear, viewMonth, day);
          const isSelected = value ? isSameDay(cellDate, value) : false;
          const isToday    = isSameDay(cellDate, today);
          const isDisabled =
            (minDate && cellDate < minDate) ||
            (maxDate && cellDate > maxDate);

          return (
            <Pressable
              key={day}
              onPress={() => !isDisabled && handleDayPress(day)}
              style={({ pressed }) => [
                s.cell,
                isSelected && { backgroundColor: accent, borderRadius: 20 },
                !isSelected && pressed && { opacity: 0.6 },
                isDisabled && { opacity: 0.25 },
              ]}
            >
              {/* Today ring */}
              {isToday && !isSelected && (
                <View style={[s.todayRing, { borderColor: todayRing }]} />
              )}
              <Text
                style={[
                  s.dayText,
                  { color: isSelected ? '#FFFFFF' : isToday ? todayRing : textColor },
                  isSelected && { fontWeight: '700' },
                ]}
              >
                {day}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* ── Time Picker ── */}
      {showTime && (
        <View style={[s.timePicker, { borderTopColor: borderColor }]}>
          <Text style={[s.timeLabel, { color: mutedColor }]}>Time</Text>
          <View style={s.drumRow}>
            <DrumRoll
              items={HOURS_12}
              selectedIndex={hourIdx}
              onSelect={(i) => { setHourIdx(i); handleTimeChange(i, minuteIdx, ampmIdx); }}
              width={56}
              accentColor={accent}
              isDark={isDark}
              textColor={textColor}
              mutedColor={mutedColor}
              borderColor={borderColor}
            />
            <Text style={[s.colon, { color: textColor }]}>:</Text>
            <DrumRoll
              items={MINUTES}
              selectedIndex={minuteIdx}
              onSelect={(i) => { setMinuteIdx(i); handleTimeChange(hourIdx, i, ampmIdx); }}
              width={56}
              accentColor={accent}
              isDark={isDark}
              textColor={textColor}
              mutedColor={mutedColor}
              borderColor={borderColor}
            />
            <View style={{ width: 12 }} />
            <DrumRoll
              items={AMPM}
              selectedIndex={ampmIdx}
              onSelect={(i) => { setAmpmIdx(i); handleTimeChange(hourIdx, minuteIdx, i); }}
              width={52}
              accentColor={accent}
              isDark={isDark}
              textColor={textColor}
              mutedColor={mutedColor}
              borderColor={borderColor}
            />
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    marginVertical: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  navBtn: {
    padding: 4,
  },
  navArrow: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '300',
  },
  monthLabel: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  dowRow: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingTop: 10,
    paddingBottom: 4,
  },
  dowLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 8,
    paddingBottom: 12,
  },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayRing: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  dayText: {
    fontSize: 14,
    lineHeight: 20,
  },
  timePicker: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
    paddingBottom: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  timeLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  drumRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  colon: {
    fontSize: 22,
    fontWeight: '700',
    marginHorizontal: 4,
    lineHeight: DRUM_ITEM_H,
  },
});
