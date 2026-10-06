/**
 * Timezone-aware time formatting.
 *
 * IMPORTANT: we never manually add/subtract 5.5 hours. All conversion is
 * delegated to Intl.DateTimeFormat with an explicit IANA timezone, which
 * correctly accounts for DST in timezones that observe it (India does not,
 * but this keeps the utility correct if more timezones are added later).
 */

export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

export interface TimezoneOption {
  id: string;
  label: string;
}

export const SUPPORTED_TIMEZONES: TimezoneOption[] = [
  { id: 'Asia/Kolkata', label: 'India Standard Time (IST, UTC+05:30)' },
  { id: 'UTC', label: 'Coordinated Universal Time (UTC)' },
  { id: 'America/New_York', label: 'New York (ET)' },
  { id: 'Europe/London', label: 'London (GMT/BST)' },
  { id: 'Asia/Tokyo', label: 'Tokyo (JST)' },
];

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = timeZone + JSON.stringify(opts);
  let f = formatterCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', { timeZone, ...opts });
    formatterCache.set(key, f);
  }
  return f;
}

/** Unix seconds -> "22 Aug 2026 18:30:00 IST"-style string. */
export function formatDateTime(unixSeconds: number, timeZone: string = DEFAULT_TIMEZONE): string {
  const date = new Date(unixSeconds * 1000);
  const f = getFormatter(timeZone, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = f.formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const zoneAbbr = getZoneAbbreviation(timeZone);
  return `${get('day')} ${get('month')} ${get('year')} ${get('hour')}:${get('minute')}:${get('second')} ${zoneAbbr}`;
}

/** Unix seconds -> "18:30" style (used for axis / crosshair short labels). */
export function formatTimeShort(unixSeconds: number, timeZone: string = DEFAULT_TIMEZONE): string {
  const date = new Date(unixSeconds * 1000);
  return getFormatter(timeZone, { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}

/** Unix seconds -> "22 Aug 26" style (used for the axis/crosshair date label). */
export function formatDateShort(unixSeconds: number, timeZone: string = DEFAULT_TIMEZONE): string {
  const date = new Date(unixSeconds * 1000);
  return getFormatter(timeZone, { day: '2-digit', month: 'short', year: '2-digit' }).format(date);
}

// Intl's ICU data reports Asia/Kolkata as "GMT+5:30" (IST is ambiguous with
// Israel/Ireland Standard Time), but IST is what the requirement — and
// every Indian trader — expects to read. A small override list keeps the
// common zones readable without hand-rolling offset math for the rest.
const ABBREVIATION_OVERRIDES: Record<string, string> = {
  'Asia/Kolkata': 'IST',
};

const abbrevCache = new Map<string, string>();

function getZoneAbbreviation(timeZone: string): string {
  if (ABBREVIATION_OVERRIDES[timeZone]) return ABBREVIATION_OVERRIDES[timeZone];
  const cached = abbrevCache.get(timeZone);
  if (cached) return cached;
  try {
    const f = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' });
    const part = f.formatToParts(new Date()).find((p) => p.type === 'timeZoneName');
    const abbr = part?.value ?? timeZone;
    abbrevCache.set(timeZone, abbr);
    return abbr;
  } catch {
    return timeZone;
  }
}

/**
 * Returns the UTC offset in minutes for a given IANA timezone at a given
 * instant (handles DST correctly instead of a hardcoded +5:30).
 */
export function getUtcOffsetMinutes(timeZone: string, at: Date = new Date()): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = dtf.formatToParts(at);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const asUTC = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour) === 24 ? 0 : Number(map.hour),
    Number(map.minute),
    Number(map.second)
  );
  return Math.round((asUTC - at.getTime()) / 60000);
}
