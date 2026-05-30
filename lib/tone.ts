/**
 * lib/tone.ts
 *
 * VitalSync Dynamic Tone Translation
 *
 * Different cultures communicate health feedback differently.
 * This module maps language codes to cultural communication styles
 * and returns culturally-adapted phrasing for streak messages,
 * insights, and reminders.
 *
 * Tone profiles:
 *  - direct      : US/UK English — factual, motivational, action-oriented
 *  - soft        : Scandinavian/Dutch — calm, balanced, non-judgmental
 *  - harmony     : Japanese/Korean — routine, harmony, gentle encouragement
 *  - community   : Swahili/Amharic/Somali — collective, family-oriented
 *  - formal      : Arabic — respectful, formal, dignified
 *  - warm        : Spanish/Italian/Portuguese/French — warm, personal
 *  - achievement : German — precise, achievement-focused
 *  - spiritual   : Armenian — reflective, holistic
 */

export type ToneProfile =
  | 'direct'
  | 'soft'
  | 'harmony'
  | 'community'
  | 'formal'
  | 'warm'
  | 'achievement'
  | 'spiritual';

/** Map from language code to tone profile */
const LANG_TONE: Record<string, ToneProfile> = {
  en: 'direct',
  pl: 'direct',
  de: 'achievement',
  nl: 'soft',
  sv: 'soft',
  no: 'soft',
  da: 'soft',
  ja: 'harmony',
  ko: 'harmony',
  zh: 'harmony',
  tl: 'harmony',
  ar: 'formal',
  fa: 'formal',
  ur: 'formal',
  sw: 'community',
  am: 'community',
  so: 'community',
  es: 'warm',
  it: 'warm',
  pt: 'warm',
  fr: 'warm',
  hi: 'warm',
  hy: 'spiritual',
};

export function getToneProfile(lang: string): ToneProfile {
  return LANG_TONE[lang] ?? LANG_TONE[lang.split('-')[0]] ?? 'direct';
}

// ─── Streak Messages ──────────────────────────────────────────────────────────

export interface StreakMessages {
  /** Shown when streak > 0 and week is not yet perfect */
  keepGoing: (days: number, total: number) => string;
  /** Shown when all 7 days are logged */
  perfectWeek: string;
  /** Shown when streak is 0 and today is not yet logged */
  startToday: string;
  /** Shown when streak > 0 but today not yet logged */
  logToday: (days: number) => string;
  /** Shown when today is already logged */
  allClear: string;
}

const STREAK_MESSAGES: Record<ToneProfile, StreakMessages> = {
  direct: {
    keepGoing: (d, t) => `${d} of ${t} days logged — keep the streak alive!`,
    perfectWeek: 'Perfect week! 🎉',
    startToday: 'Start today — every day counts.',
    logToday: (d) => `${d} day streak — log today to keep it going.`,
    allClear: 'All clear ✓ — no pending reminders',
  },
  soft: {
    keepGoing: (d, t) => `${d} of ${t} days this week — you're finding your rhythm.`,
    perfectWeek: 'A balanced week — well done.',
    startToday: 'A small entry today builds a healthy habit.',
    logToday: (d) => `${d} days in a row — a gentle nudge to log today.`,
    allClear: 'Nothing pending — enjoy your day.',
  },
  harmony: {
    keepGoing: (d, t) => `${d}/${t} 日間のログ — 日々の習慣を大切に。`,
    perfectWeek: '完璧な一週間 — 素晴らしい継続力です。',
    startToday: '今日から始めましょう — 小さな一歩が大切です。',
    logToday: (d) => `${d} 日連続 — 今日も記録して習慣を守りましょう。`,
    allClear: '本日の記録は完了しています。',
  },
  community: {
    keepGoing: (d, t) => `Siku ${d} kati ya ${t} zimerekodiwa — endelea kwa familia yako.`,
    perfectWeek: 'Wiki nzuri! Umefanya vizuri sana.',
    startToday: 'Anza leo — kila siku inafaa.',
    logToday: (d) => `Siku ${d} mfululizo — rekodi leo kwa ajili ya afya yako.`,
    allClear: 'Hakuna vikumbusho vinavyosubiri.',
  },
  formal: {
    keepGoing: (d, t) => `تم تسجيل ${d} من ${t} أيام هذا الأسبوع — واصل الاهتمام بصحتك.`,
    perfectWeek: 'أسبوع مثالي — نتمنى لك الصحة والعافية.',
    startToday: 'ابدأ اليوم — كل يوم له قيمته في رحلة صحتك.',
    logToday: (d) => `${d} أيام متتالية — سجّل اليوم للحفاظ على انتظامك.`,
    allClear: 'لا توجد تذكيرات معلقة.',
  },
  warm: {
    keepGoing: (d, t) => `¡${d} de ${t} días registrados — sigue así, lo estás haciendo genial!`,
    perfectWeek: '¡Semana perfecta! 🎉 ¡Qué orgullo!',
    startToday: 'Empieza hoy — cada día cuenta para tu bienestar.',
    logToday: (d) => `¡${d} días seguidos! Registra hoy para mantener el ritmo.`,
    allClear: 'Todo al día ✓ — sin recordatorios pendientes.',
  },
  achievement: {
    keepGoing: (d, t) => `${d} von ${t} Tagen protokolliert — Ziel: vollständige Woche.`,
    perfectWeek: 'Perfekte Woche erreicht — ausgezeichnet.',
    startToday: 'Heute beginnen — Konsistenz ist der Schlüssel.',
    logToday: (d) => `${d} Tage in Folge — heute protokollieren für lückenlosen Verlauf.`,
    allClear: 'Keine offenen Erinnerungen.',
  },
  spiritual: {
    keepGoing: (d, t) => `${d} / ${t} օր գրանցված — շարունակիր հոգ տանել քո առողջության մասին։`,
    perfectWeek: 'Կատարյալ շաբաթ — հոգ տար ինքդ քեզ։',
    startToday: 'Սկսիր այսօր — ամեն օր կարևոր է։',
    logToday: (d) => `${d} օր անընդմեջ — գրանցիր այսօր՝ շարունակելու համար։`,
    allClear: 'Ոչ մի ակտիվ հիշեցում։',
  },
};

/**
 * Get culturally-adapted streak messages for the given language.
 * Falls back to 'direct' tone if the language is not mapped.
 */
export function getStreakMessages(lang: string): StreakMessages {
  const profile = getToneProfile(lang);
  return STREAK_MESSAGES[profile];
}

// ─── Insight Tone ─────────────────────────────────────────────────────────────

export interface InsightTone {
  /** Prefix for a positive insight */
  positivePrefix: string;
  /** Prefix for a cautionary insight */
  cautionPrefix: string;
  /** Prefix for a neutral/informational insight */
  infoPrefix: string;
  /** How to frame a missed goal (e.g. "You missed your sleep goal") */
  missedGoalFrame: (metric: string) => string;
  /** How to frame an improvement (e.g. "Your sleep improved") */
  improvedFrame: (metric: string) => string;
  /** How to frame a decline */
  declinedFrame: (metric: string) => string;
}

const INSIGHT_TONE: Record<ToneProfile, InsightTone> = {
  direct: {
    positivePrefix: '✅',
    cautionPrefix: '⚠️',
    infoPrefix: 'ℹ️',
    missedGoalFrame: (m) => `You missed your ${m} goal.`,
    improvedFrame: (m) => `Your ${m} improved.`,
    declinedFrame: (m) => `Your ${m} declined.`,
  },
  soft: {
    positivePrefix: '🌿',
    cautionPrefix: '🔔',
    infoPrefix: '💡',
    missedGoalFrame: (m) => `Your ${m} rhythm shifted yesterday.`,
    improvedFrame: (m) => `Your ${m} is trending in a positive direction.`,
    declinedFrame: (m) => `Your ${m} has been a little lower lately.`,
  },
  harmony: {
    positivePrefix: '✨',
    cautionPrefix: '🔔',
    infoPrefix: '📊',
    missedGoalFrame: (m) => `${m}のリズムが昨日乱れました。`,
    improvedFrame: (m) => `${m}が改善されています。`,
    declinedFrame: (m) => `${m}がやや低下しています。`,
  },
  community: {
    positivePrefix: '🌟',
    cautionPrefix: '🔔',
    infoPrefix: 'ℹ️',
    missedGoalFrame: (m) => `Lengo lako la ${m} halikufikiwa jana.`,
    improvedFrame: (m) => `${m} yako imeboreshwa.`,
    declinedFrame: (m) => `${m} yako imepungua kidogo.`,
  },
  formal: {
    positivePrefix: '✅',
    cautionPrefix: '⚠️',
    infoPrefix: 'ℹ️',
    missedGoalFrame: (m) => `لم يتحقق هدف ${m} بالأمس.`,
    improvedFrame: (m) => `تحسّن مستوى ${m} لديك.`,
    declinedFrame: (m) => `انخفض مستوى ${m} قليلاً.`,
  },
  warm: {
    positivePrefix: '🌟',
    cautionPrefix: '💛',
    infoPrefix: '💡',
    missedGoalFrame: (m) => `Tu ritmo de ${m} cambió ayer — sin preocupaciones.`,
    improvedFrame: (m) => `¡Tu ${m} ha mejorado!`,
    declinedFrame: (m) => `Tu ${m} bajó un poco — sigue adelante.`,
  },
  achievement: {
    positivePrefix: '✅',
    cautionPrefix: '⚠️',
    infoPrefix: '📊',
    missedGoalFrame: (m) => `${m}-Ziel gestern nicht erreicht.`,
    improvedFrame: (m) => `${m} hat sich verbessert.`,
    declinedFrame: (m) => `${m} ist leicht gesunken.`,
  },
  spiritual: {
    positivePrefix: '🌿',
    cautionPrefix: '🔔',
    infoPrefix: '💡',
    missedGoalFrame: (m) => `Երեկ ${m}-ի նպատակը չի կատարվել։`,
    improvedFrame: (m) => `Քո ${m}-ը բարելավվել է։`,
    declinedFrame: (m) => `Քո ${m}-ը մի փոքր նվազել է։`,
  },
};

/**
 * Get culturally-adapted insight tone for the given language.
 */
export function getInsightTone(lang: string): InsightTone {
  const profile = getToneProfile(lang);
  return INSIGHT_TONE[profile];
}

// ─── Reminder Tone ────────────────────────────────────────────────────────────

export interface ReminderTone {
  /** How to frame an upcoming medication reminder */
  medicationDue: (name: string, time: string) => string;
  /** How to frame an overdue medication */
  medicationOverdue: (name: string) => string;
  /** How to frame a missed dose */
  missedDose: (name: string) => string;
  /** How to frame a low stock alert */
  lowStock: (name: string, qty: number) => string;
}

const REMINDER_TONE: Record<ToneProfile, ReminderTone> = {
  direct: {
    medicationDue: (n, t) => `${n} due at ${t}`,
    medicationOverdue: (n) => `${n} is overdue`,
    missedDose: (n) => `Missed dose: ${n}`,
    lowStock: (n, q) => `${n} — only ${q} left`,
  },
  soft: {
    medicationDue: (n, t) => `${n} is scheduled for ${t}`,
    medicationOverdue: (n) => `${n} hasn't been taken yet`,
    missedDose: (n) => `${n} wasn't logged today`,
    lowStock: (n, q) => `${n} is running low (${q} remaining)`,
  },
  harmony: {
    medicationDue: (n, t) => `${n}の服用時間：${t}`,
    medicationOverdue: (n) => `${n}がまだ服用されていません`,
    missedDose: (n) => `${n}の服用が記録されていません`,
    lowStock: (n, q) => `${n}の残量が少なくなっています（残り${q}錠）`,
  },
  community: {
    medicationDue: (n, t) => `Wakati wa ${n}: saa ${t}`,
    medicationOverdue: (n) => `${n} bado haijachukuliwa`,
    missedDose: (n) => `Dozi ya ${n} imekosekana`,
    lowStock: (n, q) => `${n} inakwisha — zimebaki ${q}`,
  },
  formal: {
    medicationDue: (n, t) => `موعد ${n}: الساعة ${t}`,
    medicationOverdue: (n) => `${n} لم يُؤخذ بعد`,
    missedDose: (n) => `جرعة ${n} فائتة`,
    lowStock: (n, q) => `${n} — المخزون منخفض (${q} متبقية)`,
  },
  warm: {
    medicationDue: (n, t) => `${n} a las ${t} — ¡no lo olvides!`,
    medicationOverdue: (n) => `${n} aún no se ha tomado`,
    missedDose: (n) => `Dosis de ${n} no registrada`,
    lowStock: (n, q) => `${n} — solo quedan ${q} unidades`,
  },
  achievement: {
    medicationDue: (n, t) => `${n} fällig um ${t}`,
    medicationOverdue: (n) => `${n} noch nicht eingenommen`,
    missedDose: (n) => `Vergessene Dosis: ${n}`,
    lowStock: (n, q) => `${n} — Vorrat niedrig (${q} übrig)`,
  },
  spiritual: {
    medicationDue: (n, t) => `${n}-ի ժամանակն է՝ ${t}`,
    medicationOverdue: (n) => `${n}-ը դեռ չի ընդունվել`,
    missedDose: (n) => `${n}-ի դոզան բաց է թողնվել`,
    lowStock: (n, q) => `${n} — մնացել է ${q} հատ`,
  },
};

/**
 * Get culturally-adapted reminder tone for the given language.
 */
export function getReminderTone(lang: string): ReminderTone {
  const profile = getToneProfile(lang);
  return REMINDER_TONE[profile];
}
