/** Routines are stored in UTC and interpreted in America/Los_Angeles. */

export const ROUTINE_TIME_ZONE = "America/Los_Angeles";

export type Cadence =
  | { kind: "interval"; minutes: 15 | 60 | 1440 }
  | { kind: "daily_at"; hour: number; minute: number };

const INTERVALS = new Set([15, 60, 1440]);

export function parseCadence(value: unknown): Cadence | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { kind?: unknown; minutes?: unknown; hour?: unknown; minute?: unknown };
  if (record.kind === "interval" && typeof record.minutes === "number" && INTERVALS.has(record.minutes)) {
    return { kind: "interval", minutes: record.minutes as 15 | 60 | 1440 };
  }
  if (record.kind === "daily_at" && typeof record.hour === "number" && typeof record.minute === "number") {
    if (record.hour < 0 || record.hour > 23 || record.minute < 0 || record.minute > 59) return null;
    if (!Number.isInteger(record.hour) || !Number.isInteger(record.minute)) return null;
    return { kind: "daily_at", hour: record.hour, minute: record.minute };
  }
  return null;
}

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

export function zonedParts(date: Date, timeZone: string): Parts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const bag: Record<string, string> = {};
  for (const part of fmt.formatToParts(date)) bag[part.type] = part.value;
  let hour = Number(bag.hour);
  let day = Number(bag.day);
  let month = Number(bag.month);
  let year = Number(bag.year);
  if (hour === 24) {
    hour = 0;
    const next = new Date(Date.UTC(year, month - 1, day + 1));
    year = next.getUTCFullYear();
    month = next.getUTCMonth() + 1;
    day = next.getUTCDate();
  }
  return { year, month, day, hour, minute: Number(bag.minute), second: Number(bag.second) };
}

function offsetMs(date: Date, timeZone: string): number {
  const parts = zonedParts(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - date.getTime();
}

/** Wall-clock time in `timeZone` as a UTC instant. */
export function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const first = new Date(guess.getTime() - offsetMs(guess, timeZone));
  return new Date(guess.getTime() - offsetMs(first, timeZone));
}

function addCalendarDays(year: number, month: number, day: number, days: number) {
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
}

function addCadence(from: Date, cadence: Cadence, timeZone: string): Date {
  if (cadence.kind === "interval") {
    return new Date(from.getTime() + cadence.minutes * 60_000);
  }
  const parts = zonedParts(from, timeZone);
  let cursor = { year: parts.year, month: parts.month, day: parts.day };
  let instant = zonedTimeToUtc(cursor.year, cursor.month, cursor.day, cadence.hour, cadence.minute, timeZone);
  if (instant.getTime() <= from.getTime()) {
    cursor = addCalendarDays(cursor.year, cursor.month, cursor.day, 1);
    instant = zonedTimeToUtc(cursor.year, cursor.month, cursor.day, cadence.hour, cadence.minute, timeZone);
  }
  return instant;
}

/**
 * The next slot strictly after `now`. Missed slots are skipped so a quiet
 * dispatcher does not burst a backlog of model calls.
 */
export function nextRunAfter(from: Date, now: Date, cadence: Cadence, timeZone = ROUTINE_TIME_ZONE): Date {
  let next = addCadence(from, cadence, timeZone);
  let guard = 0;
  while (next.getTime() <= now.getTime() && guard < 2000) {
    next = addCadence(next, cadence, timeZone);
    guard += 1;
  }
  return next;
}

export function initialNextRun(now: Date, cadence: Cadence, timeZone = ROUTINE_TIME_ZONE): Date {
  return nextRunAfter(new Date(now.getTime() - 1000), now, cadence, timeZone);
}

/** Wall-clock label in the routine's zone. The stored instant stays UTC. */
export function formatInTimeZone(date: Date, timeZone = ROUTINE_TIME_ZONE): string {
  const parts = zonedParts(date, timeZone);
  const hour12 = parts.hour % 12 === 0 ? 12 : parts.hour % 12;
  const suffix = parts.hour < 12 ? "AM" : "PM";
  const minute = String(parts.minute).padStart(2, "0");
  const zone = timeZone === "America/Los_Angeles" ? "PT" : timeZone;
  return `${parts.month}/${parts.day}/${parts.year}, ${hour12}:${minute} ${suffix} ${zone}`;
}
