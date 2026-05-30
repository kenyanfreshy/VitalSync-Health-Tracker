/**
 * VitalSync Weather Service
 *
 * Fetches weather using IP-based geolocation — no location permission prompt required.
 *
 * Flow:
 *   1. ip-api.com (free, no key) → city name + lat/lon from device IP
 *   2. Open-Meteo (free, no key) → current + 3-day daily + 6-hour hourly + UV index
 *
 * No medical advice is provided. All labels are informational only.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ActivityReadiness =
  | 'great'        // Favourable for outdoor activity
  | 'good'         // Moderate conditions
  | 'caution_rain' // Rain likely
  | 'caution_heat' // High temperature
  | 'caution_cold' // Below freezing
  | 'caution_wind' // Windy
  | 'indoor';      // Conditions unfavourable for outdoor activity

export interface HourlyForecast {
  time: string;
  hourLabel: string;
  temperatureC: number;
  temperatureF: number;
  weatherCode: number;
  conditionIcon: string;
  precipitationProbability: number;
}

export interface DailyForecast {
  /** ISO date string, e.g. "2026-04-23" */
  date: string;
  /** Short day label, e.g. "Today", "Thu", "Fri" */
  dayLabel: string;
  /** Daily high in °C */
  highC: number;
  /** Daily high in °F */
  highF: number;
  /** Daily low in °C */
  lowC: number;
  /** Daily low in °F */
  lowF: number;
  /** Dominant WMO weather code for the day */
  weatherCode: number;
  /** Emoji icon for the condition */
  conditionIcon: string;
  /** Condition label */
  condition: string;
  /** Max precipitation probability for the day 0–100 */
  precipitationProbability: number;
  /** Max wind speed in km/h */
  windSpeedKmh: number;
  /** Max wind speed in mph */
  windSpeedMph: number;
  /** UV index max for the day */
  uvIndex: number;
}

export interface WeatherData {
  locationName: string;
  /** Current temperature in °C */
  temperatureC: number;
  /** Current temperature in °F */
  temperatureF: number;
  /** Daily high in °C */
  dailyHighC: number;
  /** Daily high in °F */
  dailyHighF: number;
  /** Daily low in °C */
  dailyLowC: number;
  /** Daily low in °F */
  dailyLowF: number;
  /** Apparent (feels like) temperature in °C */
  feelsLikeC: number;
  /** Apparent (feels like) temperature in °F */
  feelsLikeF: number;
  condition: string;
  weatherCode: number;
  precipitationProbability: number;
  windSpeedKmh: number;
  windSpeedMph: number;
  /** Wind direction in degrees (0–360) */
  windDirectionDeg: number;
  /** Compass label, e.g. "NE" */
  windDirectionLabel: string;
  /** Unicode arrow for wind direction, e.g. "↗" */
  windDirectionArrow: string;
  humidity: number;
  uvIndex: number;
  readiness: ActivityReadiness;
  readinessLabel: string;
  conditionIcon: string;
  /** Next 6 hourly forecasts */
  hourlyForecast: HourlyForecast[];
  /** 7-day daily forecasts (today + 6 days) */
  dailyForecast: DailyForecast[];
  fetchedAt: string;
}

export type WeatherStatus =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'stale'; data: WeatherData }
  | { status: 'error'; message: string }
  | { status: 'success'; data: WeatherData };

// ─── WMO Weather Code → Condition ────────────────────────────────────────────

function wmoToCondition(code: number): { label: string; icon: string } {
  if (code === 0)                   return { label: 'Clear sky',        icon: '☀️' };
  if (code === 1)                   return { label: 'Mainly clear',     icon: '🌤️' };
  if (code === 2)                   return { label: 'Partly cloudy',    icon: '⛅' };
  if (code === 3)                   return { label: 'Overcast',         icon: '☁️' };
  if (code >= 45 && code <= 48)     return { label: 'Foggy',            icon: '🌫️' };
  if (code >= 51 && code <= 55)     return { label: 'Drizzle',          icon: '🌦️' };
  if (code >= 56 && code <= 57)     return { label: 'Freezing drizzle', icon: '🌧️' };
  if (code >= 61 && code <= 65)     return { label: 'Rain',             icon: '🌧️' };
  if (code >= 66 && code <= 67)     return { label: 'Freezing rain',    icon: '🌨️' };
  if (code >= 71 && code <= 77)     return { label: 'Snow',             icon: '❄️' };
  if (code >= 80 && code <= 82)     return { label: 'Rain showers',     icon: '🌦️' };
  if (code >= 85 && code <= 86)     return { label: 'Snow showers',     icon: '🌨️' };
  if (code >= 95 && code <= 99)     return { label: 'Thunderstorm',     icon: '⛈️' };
  return { label: 'Unknown', icon: '🌡️' };
}

// ─── Wind direction helpers ───────────────────────────────────────────────────

const COMPASS_DIRS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
const COMPASS_ARROWS = ['↑','↗','↗','↗','→','↘','↘','↘','↓','↙','↙','↙','←','↖','↖','↖'];

function degToCompass(deg: number): { label: string; arrow: string } {
  const idx = Math.round(((deg % 360) + 360) % 360 / 22.5) % 16;
  return { label: COMPASS_DIRS[idx], arrow: COMPASS_ARROWS[idx] };
}

// ─── Activity Readiness Logic (informational only) ────────────────────────────

function computeReadiness(
  tempC: number,
  precipProb: number,
  windKmh: number,
  weatherCode: number,
): { readiness: ActivityReadiness; label: string } {
  if (weatherCode >= 95 || (weatherCode >= 71 && weatherCode <= 77)) {
    return { readiness: 'indoor', label: 'Conditions unfavourable for outdoor activity' };
  }
  if (tempC > 35)      return { readiness: 'caution_heat', label: 'High temperature' };
  if (tempC < 0)       return { readiness: 'caution_cold', label: 'Below freezing' };
  if (precipProb > 70) return { readiness: 'caution_rain', label: 'Rain likely' };
  if (windKmh > 40)    return { readiness: 'caution_wind', label: 'Windy conditions' };
  if (precipProb > 40 || windKmh > 25 || tempC < 5) {
    return { readiness: 'good', label: 'Moderate conditions' };
  }
  return { readiness: 'great', label: 'Favourable for outdoor activity' };
}

// ─── Hour / Day label helpers ─────────────────────────────────────────────────

function formatHourLabel(isoTime: string): string {
  const h = new Date(isoTime).getHours();
  if (h === 0)  return '12 AM';
  if (h < 12)   return `${h} AM`;
  if (h === 12) return '12 PM';
  return `${h - 12} PM`;
}

function formatDayLabel(isoDate: string, index: number): string {
  if (index === 0) return 'Today';
  const d = new Date(isoDate + 'T12:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short' });
}

// ─── Step 1: IP Geolocation ───────────────────────────────────────────────────

interface IpGeoResult { city: string; lat: number; lon: number; }

function makeAbortSignal(ms: number): AbortSignal {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

async function getLocationFromIp(): Promise<IpGeoResult> {
  const res = await fetch('http://ip-api.com/json/?fields=city,lat,lon,status', {
    signal: makeAbortSignal(4_000),
  });
  if (!res.ok) throw new Error(`ip-api HTTP ${res.status}`);
  const json = await res.json();
  if (json.status !== 'success') throw new Error('IP geolocation failed');
  return { city: json.city ?? 'Unknown', lat: json.lat, lon: json.lon };
}

// ─── Step 2: Open-Meteo Weather ───────────────────────────────────────────────

async function getWeatherFromCoords(
  lat: number,
  lon: number,
): Promise<Omit<WeatherData, 'locationName' | 'fetchedAt'>> {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
    // Current conditions
    `&current=temperature_2m,apparent_temperature,relative_humidity_2m,` +
    `precipitation_probability,weather_code,wind_speed_10m,wind_direction_10m,uv_index` +
    // Hourly for next 6 hours
    `&hourly=temperature_2m,weather_code,precipitation_probability` +
    // Daily for 7 days
    `&daily=temperature_2m_max,temperature_2m_min,weather_code,` +
    `precipitation_probability_max,wind_speed_10m_max,uv_index_max` +
    `&wind_speed_unit=kmh&temperature_unit=celsius&timezone=auto&forecast_days=7`;

  const res = await fetch(url, { signal: makeAbortSignal(6_000) });
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const json = await res.json();

  const current = json?.current;
  if (!current) throw new Error('Invalid Open-Meteo response');

  // ── Current conditions ──────────────────────────────────────────────────
  const tempC: number        = current.temperature_2m          ?? 0;
  const tempF                = Math.round(tempC * 9 / 5 + 32);
  const feelsLikeC: number   = Math.round(current.apparent_temperature ?? tempC);
  const feelsLikeF: number   = Math.round(feelsLikeC * 9 / 5 + 32);
  const precipProb: number   = current.precipitation_probability ?? 0;
  const windKmh: number      = current.wind_speed_10m           ?? 0;
  const windMph              = Math.round(windKmh * 0.621371);
  const windDeg: number      = current.wind_direction_10m       ?? 0;
  const humidity: number     = current.relative_humidity_2m     ?? 0;
  const weatherCode: number  = current.weather_code             ?? 0;
  const uvIndex: number      = Math.round(current.uv_index      ?? 0);

  const { label: condition, icon: conditionIcon } = wmoToCondition(weatherCode);
  const { readiness, label: readinessLabel }       = computeReadiness(tempC, precipProb, windKmh, weatherCode);
  const { label: windDirectionLabel, arrow: windDirectionArrow } = degToCompass(windDeg);

  // ── Daily forecast — 3 days ─────────────────────────────────────────────
  const dailyForecast: DailyForecast[] = [];
  const dailyDates:   string[]  = json?.daily?.time                       ?? [];
  const dailyHighs:   number[]  = json?.daily?.temperature_2m_max         ?? [];
  const dailyLows:    number[]  = json?.daily?.temperature_2m_min         ?? [];
  const dailyCodes:   number[]  = json?.daily?.weather_code               ?? [];
  const dailyPrecip:  number[]  = json?.daily?.precipitation_probability_max ?? [];
  const dailyWind:    number[]  = json?.daily?.wind_speed_10m_max         ?? [];
  const dailyUV:      number[]  = json?.daily?.uv_index_max               ?? [];

  for (let i = 0; i < Math.min(7, dailyDates.length); i++) {
    const hC  = Math.round(dailyHighs[i] ?? 0);
    const lC  = Math.round(dailyLows[i]  ?? 0);
    const dCode = dailyCodes[i] ?? 0;
    const { label: dLabel, icon: dIcon } = wmoToCondition(dCode);
    const dWindKmh = Math.round(dailyWind[i] ?? 0);
    dailyForecast.push({
      date:   dailyDates[i],
      dayLabel: formatDayLabel(dailyDates[i], i),
      highC:  hC,
      highF:  Math.round(hC * 9 / 5 + 32),
      lowC:   lC,
      lowF:   Math.round(lC * 9 / 5 + 32),
      weatherCode: dCode,
      conditionIcon: dIcon,
      condition: dLabel,
      precipitationProbability: Math.round(dailyPrecip[i] ?? 0),
      windSpeedKmh: dWindKmh,
      windSpeedMph: Math.round(dWindKmh * 0.621371),
      uvIndex: Math.round(dailyUV[i] ?? 0),
    });
  }

  // ── Hourly forecast — next 6 hours from now ─────────────────────────────
  const hourlyForecast: HourlyForecast[] = [];
  const hourlyTimes:  string[]  = json?.hourly?.time                      ?? [];
  const hourlyTemps:  number[]  = json?.hourly?.temperature_2m            ?? [];
  const hourlyCodes:  number[]  = json?.hourly?.weather_code              ?? [];
  const hourlyPrecip: number[]  = json?.hourly?.precipitation_probability ?? [];

  const nowMs = Date.now();
  let count = 0;
  for (let i = 0; i < hourlyTimes.length && count < 6; i++) {
    if (new Date(hourlyTimes[i]).getTime() > nowMs) {
      const hTempC = Math.round(hourlyTemps[i] ?? 0);
      const hCode  = hourlyCodes[i] ?? 0;
      const { icon: hIcon } = wmoToCondition(hCode);
      hourlyForecast.push({
        time: hourlyTimes[i],
        hourLabel: formatHourLabel(hourlyTimes[i]),
        temperatureC: hTempC,
        temperatureF: Math.round(hTempC * 9 / 5 + 32),
        weatherCode: hCode,
        conditionIcon: hIcon,
        precipitationProbability: Math.round(hourlyPrecip[i] ?? 0),
      });
      count++;
    }
  }

  // Daily high/low for today (first element)
  const dailyHighC = dailyForecast[0]?.highC ?? Math.round(tempC);
  const dailyHighF = dailyForecast[0]?.highF ?? tempF;
  const dailyLowC  = dailyForecast[0]?.lowC  ?? Math.round(tempC);
  const dailyLowF  = dailyForecast[0]?.lowF  ?? tempF;

  return {
    temperatureC: Math.round(tempC),
    temperatureF: tempF,
    dailyHighC,
    dailyHighF,
    dailyLowC,
    dailyLowF,
    feelsLikeC,
    feelsLikeF,
    condition,
    weatherCode,
    precipitationProbability: Math.round(precipProb),
    windSpeedKmh: Math.round(windKmh),
    windSpeedMph: windMph,
    windDirectionDeg: Math.round(windDeg),
    windDirectionLabel,
    windDirectionArrow,
    humidity: Math.round(humidity),
    uvIndex,
    readiness,
    readinessLabel,
    conditionIcon,
    hourlyForecast,
    dailyForecast,
  };
}

// ─── City-based Geocoding (Open-Meteo Geocoding API) ─────────────────────────

export interface CityResult {
  name: string;
  country: string;
  latitude: number;
  longitude: number;
  admin1?: string; // state/region
}

export async function searchCities(query: string): Promise<CityResult[]> {
  if (!query.trim()) return [];
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json`;
    const res = await fetch(url, { signal: makeAbortSignal(8_000) });
    if (!res.ok) return [];
    const json = await res.json();
    const results: CityResult[] = (json?.results ?? []).map((r: Record<string, unknown>) => ({
      name: String(r.name ?? ''),
      country: String(r.country ?? ''),
      latitude: Number(r.latitude ?? 0),
      longitude: Number(r.longitude ?? 0),
      admin1: r.admin1 ? String(r.admin1) : undefined,
    }));
    return results;
  } catch (_unused) {
    return [];
  }
}

// ─── Main Fetch ───────────────────────────────────────────────────────────────

export async function fetchWeather(): Promise<WeatherStatus> {
  try {
    const geo     = await getLocationFromIp();
    const weather = await getWeatherFromCoords(geo.lat, geo.lon);
    const data: WeatherData = {
      ...weather,
      locationName: geo.city,
      fetchedAt: new Date().toISOString(),
    };
    return { status: 'success', data };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Weather unavailable';
    return { status: 'error', message: msg };
  }
}

export async function fetchWeatherForCity(city: CityResult): Promise<WeatherStatus> {
  try {
    const weather = await getWeatherFromCoords(city.latitude, city.longitude);
    const locationName = city.admin1
      ? `${city.name}, ${city.admin1}`
      : `${city.name}, ${city.country}`;
    const data: WeatherData = {
      ...weather,
      locationName,
      fetchedAt: new Date().toISOString(),
    };
    return { status: 'success', data };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Weather unavailable';
    return { status: 'error', message: msg };
  }
}
