import assert from "node:assert/strict";
import { test } from "node:test";
import { initialNextRun, nextRunAfter, parseCadence, zonedTimeToUtc } from "../lib/routines/schedule";

test("daily 9:00 America/Los_Angeles is stored as UTC across daylight saving", () => {
  const winter = zonedTimeToUtc(2026, 1, 15, 9, 0, "America/Los_Angeles");
  assert.equal(winter.toISOString(), "2026-01-15T17:00:00.000Z");
  const summer = zonedTimeToUtc(2026, 7, 15, 9, 0, "America/Los_Angeles");
  assert.equal(summer.toISOString(), "2026-07-15T16:00:00.000Z");
  const afterChange = zonedTimeToUtc(2026, 11, 7, 9, 0, "America/Los_Angeles");
  assert.equal(afterChange.toISOString(), "2026-11-07T17:00:00.000Z");
});

test("the next slot walks forward in the zone and skips missed intervals", () => {
  const cadence = parseCadence({ kind: "daily_at", hour: 9, minute: 0 });
  assert.ok(cadence);
  if (!cadence) return;
  const from = new Date("2026-11-07T17:00:00.000Z");
  const next = nextRunAfter(from, from, cadence);
  assert.equal(next.toISOString(), "2026-11-08T17:00:00.000Z");

  const interval = parseCadence({ kind: "interval", minutes: 15 });
  assert.ok(interval);
  if (!interval) return;
  const due = new Date("2026-11-07T17:00:00.000Z");
  const later = new Date("2026-11-07T17:40:00.000Z");
  assert.equal(nextRunAfter(due, later, interval).toISOString(), "2026-11-07T17:45:00.000Z");
  assert.equal(parseCadence({ kind: "interval", minutes: 5 }), null);
});

test("a new routine's first slot is in the future", () => {
  const now = new Date("2026-11-07T16:10:00.000Z");
  const first = initialNextRun(now, { kind: "interval", minutes: 15 });
  assert.ok(first.getTime() > now.getTime());
});
