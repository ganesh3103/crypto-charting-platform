import { describe, expect, it } from 'vitest';
import { formatDateTime, formatTimeShort, getUtcOffsetMinutes } from './timezone';

describe('timezone utils', () => {
  it('formats a UTC timestamp in IST with the +05:30 offset applied', () => {
    // 2026-08-22T12:00:00Z -> IST is UTC+5:30 -> 17:30:00
    const unix = Date.UTC(2026, 7, 22, 12, 0, 0) / 1000;
    expect(formatDateTime(unix, 'Asia/Kolkata')).toBe('22 Aug 2026 17:30:00 IST');
  });

  it('formats the same instant differently across timezones', () => {
    const unix = Date.UTC(2026, 7, 22, 12, 0, 0) / 1000;
    expect(formatTimeShort(unix, 'UTC')).toBe('12:00');
    expect(formatTimeShort(unix, 'Asia/Kolkata')).toBe('17:30');
  });

  it('reports the IST UTC offset as exactly +330 minutes (no DST)', () => {
    expect(getUtcOffsetMinutes('Asia/Kolkata', new Date('2026-01-15T00:00:00Z'))).toBe(330);
    expect(getUtcOffsetMinutes('Asia/Kolkata', new Date('2026-07-15T00:00:00Z'))).toBe(330);
  });

  it('does not hardcode 5.5h for other timezones (sanity check for DST-aware zones)', () => {
    // New York is UTC-5 in Jan (EST) and UTC-4 in Jul (EDT); this proves we
    // are not applying a single fixed offset for every timezone.
    const jan = getUtcOffsetMinutes('America/New_York', new Date('2026-01-15T12:00:00Z'));
    const jul = getUtcOffsetMinutes('America/New_York', new Date('2026-07-15T12:00:00Z'));
    expect(jan).toBe(-300);
    expect(jul).toBe(-240);
  });
});
