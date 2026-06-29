/**
 * VitalSync Medical Compliance Guardrails
 *
 * Blocks or rewrites unsafe medical language in all AI outputs.
 * Applied to every AI response before it is shown to the user.
 *
 * Blocked terms (per Apple App Review and FDA guidance):
 *   diagnose, treat, cure, prescribe, medical advice, disease prediction,
 *   risk diagnosis, abnormal result requiring care, clinical decision,
 *   patient management
 *
 * Safe replacements:
 *   wellness insight, observed pattern, general health information,
 *   trend, may be associated with, consider discussing with a licensed clinician,
 *   does not replace medical advice
 *
 * This module is the single source of truth for compliance wording.
 * All AI providers route through sanitizeAIOutput() before display.
 */

// ─── Blocked Terms ────────────────────────────────────────────────────────────

interface ReplacementRule {
  /** Regex pattern to match (case-insensitive) */
  pattern: RegExp;
  /** Safe replacement string */
  replacement: string;
}

const REPLACEMENT_RULES: ReplacementRule[] = [
  // Diagnostic language
  { pattern: /\bdiagnos(?:e|es|ed|ing|is|tic|tics)\b/gi, replacement: 'assess' },
  { pattern: /\bdiagnosis\b/gi, replacement: 'wellness assessment' },
  { pattern: /\bdiagnostic\b/gi, replacement: 'wellness' },

  // Treatment language
  { pattern: /\btreat(?:s|ed|ing|ment|ments)?\b/gi, replacement: 'address' },
  { pattern: /\bcure(?:s|d|ing)?\b/gi, replacement: 'improve' },
  { pattern: /\bprescri(?:be|bes|bed|bing|ption|ptions)\b/gi, replacement: 'suggest' },

  // Medical advice language
  { pattern: /\bmedical advice\b/gi, replacement: 'wellness information' },
  { pattern: /\bclinical (?:decision|decisions)\b/gi, replacement: 'wellness consideration' },
  { pattern: /\bpatient management\b/gi, replacement: 'wellness monitoring' },
  { pattern: /\bclinical recommendation\b/gi, replacement: 'wellness suggestion' },

  // Disease prediction language
  { pattern: /\bdisease prediction\b/gi, replacement: 'wellness trend' },
  { pattern: /\brisk diagnosis\b/gi, replacement: 'wellness risk indicator' },
  { pattern: /\babnormal result requiring (?:care|attention|treatment)\b/gi, replacement: 'observed pattern worth discussing with a clinician' },

  // Absolute medical claims
  { pattern: /\byou (?:have|may have|likely have) (?:a |an )?\b(?:disease|disorder|condition|syndrome)\b/gi, replacement: 'your wellness data shows a pattern worth discussing with a clinician' },
  { pattern: /\bthis (?:indicates|confirms|proves) (?:a |an )?\b(?:disease|disorder|condition|syndrome)\b/gi, replacement: 'this observed pattern may be associated with' },

  // FDA-triggering language
  { pattern: /\bmedical device\b/gi, replacement: 'wellness tool' },
  { pattern: /\bclinically (?:proven|validated|tested)\b/gi, replacement: 'evidence-informed' },
];

// ─── Blocked Phrases (hard block — replace entire sentence) ──────────────────

const BLOCKED_PHRASES: RegExp[] = [
  /you (?:are|may be) (?:at risk for|developing) (?:diabetes|hypertension|heart disease|cancer|stroke)/gi,
  /this app (?:can|will) (?:diagnose|treat|cure|prevent)/gi,
  /consult (?:a|your) doctor (?:immediately|urgently|right away|now)/gi,
  /seek (?:emergency|immediate) (?:medical )?(?:care|attention|help)/gi,
];

const BLOCKED_PHRASE_REPLACEMENT =
  'Consider discussing this observed wellness pattern with a licensed clinician.';

// ─── Sanitization ─────────────────────────────────────────────────────────────

/**
 * Sanitizes an AI-generated text string to remove unsafe medical language.
 * Returns the sanitized string. Never throws.
 */
export function sanitizeAIOutput(text: string): string {
  if (!text || typeof text !== 'string') return '';

  let result = text;

  // First pass: block entire sentences with dangerous phrases
  for (const blocked of BLOCKED_PHRASES) {
    result = result.replace(blocked, BLOCKED_PHRASE_REPLACEMENT);
  }

  // Second pass: replace individual unsafe terms
  for (const rule of REPLACEMENT_RULES) {
    result = result.replace(rule.pattern, rule.replacement);
  }

  return result.trim();
}

/**
 * Validates that a text string passes compliance checks.
 * Returns { valid: true } if clean, or { valid: false, issues: string[] } if not.
 */
export function validateAIOutput(text: string): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  const hardBlockedTerms = [
    /\bdiagnos(?:e|es|ed|ing|is)\b/i,
    /\bprescri(?:be|bes|bed|bing|ption)\b/i,
    /\bcure(?:s|d|ing)?\b/i,
    /\bmedical advice\b/i,
    /\bdisease prediction\b/i,
    /\brisk diagnosis\b/i,
    /\bclinical decision\b/i,
    /\bpatient management\b/i,
  ];

  for (const term of hardBlockedTerms) {
    if (term.test(text)) {
      issues.push(`Contains blocked term matching: ${term.source}`);
    }
  }

  return { valid: issues.length === 0, issues };
}

// ─── Required Disclaimer Appender ────────────────────────────────────────────

/**
 * Appends the appropriate disclaimer to an AI output.
 * Always call this before displaying any AI-generated text.
 */
export function appendDisclaimer(
  text: string,
  disclaimerType: 'correlation' | 'wellness' | 'nutrition' | 'general' = 'general',
): string {
  const disclaimers = {
    correlation:
      'Correlation does not prove causation. VitalSync provides wellness information only and does not diagnose, treat, or replace medical advice.',
    wellness:
      'This is a wellness insight, not medical advice. Consult a licensed clinician for health decisions.',
    nutrition:
      'Nutrition values sourced from USDA FoodData Central. AI explanation is for general wellness information only.',
    general:
      'VitalSync provides wellness information only and does not diagnose, treat, or replace medical advice.',
  };

  const disclaimer = disclaimers[disclaimerType];
  if (!text) return disclaimer;
  return `${text.trim()}\n\n${disclaimer}`;
}

// ─── Safe Wording Helpers ─────────────────────────────────────────────────────

/** Returns a safe "trend" description for a numeric change */
export function describeTrend(
  value: number,
  unit: string,
  direction: 'up' | 'down' | 'stable',
): string {
  const directionText =
    direction === 'up'
      ? 'an upward trend'
      : direction === 'down'
        ? 'a downward trend'
        : 'a stable pattern';
  return `Your ${unit} data shows ${directionText} of ${Math.abs(value).toFixed(1)} ${unit} over the observed period. This is a wellness observation, not a medical assessment.`;
}

/** Returns a safe correlation description */
export function describeCorrelation(
  metricA: string,
  metricB: string,
  r: number,
  sampleSize: number,
): string {
  const strength =
    Math.abs(r) >= 0.7
      ? 'a notable association'
      : Math.abs(r) >= 0.4
        ? 'a moderate association'
        : 'a weak association';
  const direction = r >= 0 ? 'positive' : 'inverse';
  return (
    `Your data shows ${strength} (${direction}, r = ${r.toFixed(2)}) between ${metricA} and ${metricB} ` +
    `based on ${sampleSize} observations. This is an observed pattern in your personal wellness data. ` +
    `Correlation does not prove causation and does not replace medical advice.`
  );
}
