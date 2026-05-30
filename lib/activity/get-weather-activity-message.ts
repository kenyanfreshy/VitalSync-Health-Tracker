/**
 * getWeatherActivityMessage
 *
 * Returns a short, exciting, non-medical activity message based on current
 * weather conditions. Storm overrides all; then rain; then wind; then
 * temperature band. Always returns a fallback.
 *
 * Anti-repetition: stores the last 3 shown messages in a module-level ring
 * buffer and rotates within the same category to avoid back-to-back repeats.
 *
 * No medical advice. Lifestyle guidance only.
 */

// ─── Message pools ────────────────────────────────────────────────────────────

const MESSAGES: Record<string, string[]> = {
  storm: [
    'Rough weather—indoor mode activated',
    'Not the day for outdoor plans',
    'Best to keep today\'s activity indoors',
    'Stay dry—great day for an indoor session',
  ],
  rain: [
    'Rain on the radar—indoor plan might win',
    'Wet conditions—quick session or stay dry',
    'Light rain—still doable if you\'re up for it',
    'Rain likely—adjust the plan and keep moving',
    'Damp out there—consider an indoor option',
  ],
  wind: [
    'Wind picking up—adjust your pace',
    'Breezy out—might feel tougher than usual',
    'Windy conditions—keep expectations flexible',
    'Wind picking up—still doable, just lighter',
    'Breezy day—great for a sheltered workout',
  ],
  ideal: [
    'Perfect day to hit a run',
    'Prime weather—get outside and move',
    '⚡ This is outdoor activity gold',
    'Great day to stack some steps',
    'Smooth conditions—go enjoy it',
    '🔥 Perfect weather to move',
    'This is your best window today',
    '🌿 Prime conditions—go use it',
  ],
  warm: [
    'Warm and ready—great for a light session',
    'Nice weather—keep it easy and steady',
    'Good day to stay active outside',
    'Solid conditions for a quick workout',
    'Warm out—great for an easy outdoor move',
  ],
  hot: [
    'It\'s heating up—keep it short and light',
    'Warm day—pace yourself out there',
    'Take it easy, but still a good move day',
    'Consider a shorter outdoor session',
  ],
  very_hot: [
    'Heat is high—indoor movement may feel better',
    'Too hot to push it—cooler options win today',
    'Better time for an indoor session',
    'Warm day—indoor activity is a solid call',
  ],
  cool: [
    '⚡ Crisp air—perfect for a run',
    'Cool and refreshing—great for movement',
    'Fresh conditions—ideal for cardio',
    'Cool and clean—go enjoy it',
    '🌿 Crisp air—ideal for movement',
  ],
  cold: [
    'Chilly out—bundle up and go',
    'Cold air—keep it moving but stay warm',
    'Layer up or keep it indoors',
    'Cold conditions—dress warm and keep moving',
  ],
  fallback: [
    'Good day to stay active',
    'A great time to keep moving',
    'Stay active—every step counts',
  ],
};

// ─── Anti-repetition ring buffer ──────────────────────────────────────────────

const recentMessages: string[] = [];
const MAX_RECENT = 3;

function pickMessage(pool: string[]): string {
  // Filter out recently shown messages
  const available = pool.filter((m) => !recentMessages.includes(m));
  const candidates = available.length > 0 ? available : pool;
  const msg = candidates[Math.floor(Math.random() * candidates.length)];
  // Update ring buffer
  recentMessages.push(msg);
  if (recentMessages.length > MAX_RECENT) recentMessages.shift();
  return msg;
}

// ─── Main function ────────────────────────────────────────────────────────────

export function getWeatherActivityMessage(
  tempF?: number | null,
  rainChance?: number | null,
  windMph?: number | null,
  condition?: string | null,
): string {
  const condLower = (condition ?? '').toLowerCase();

  // Storm overrides all
  if (
    condLower.includes('thunder') ||
    condLower.includes('storm') ||
    condLower.includes('hail')
  ) {
    return pickMessage(MESSAGES.storm);
  }

  // Rain
  if ((rainChance ?? 0) >= 60 || condLower.includes('rain') || condLower.includes('drizzle')) {
    return pickMessage(MESSAGES.rain);
  }

  // Wind
  if ((windMph ?? 0) >= 20) {
    return pickMessage(MESSAGES.wind);
  }

  // Temperature bands
  const t = tempF ?? null;
  if (t !== null) {
    if (t >= 96) return pickMessage(MESSAGES.very_hot);
    if (t >= 86) return pickMessage(MESSAGES.hot);
    if (t >= 76) return pickMessage(MESSAGES.warm);
    if (t >= 60) return pickMessage(MESSAGES.ideal);
    if (t >= 45) return pickMessage(MESSAGES.cool);
    return pickMessage(MESSAGES.cold);
  }

  return pickMessage(MESSAGES.fallback);
}
