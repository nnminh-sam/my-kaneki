import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scheduleReview, MIN_EASINESS_FACTOR, DEFAULT_EASINESS_FACTOR } from "./srs";

describe("Spaced Repetition Scheduling (SM-2)", () => {
  const baseTime = "2026-10-31T12:00:00.000Z";

  it("schedules first successful review (rep 1) with interval = 1 day", () => {
    const res = scheduleReview(undefined, 4, baseTime);
    assert.equal(res.reps, 1);
    assert.equal(res.lapses, 0);
    assert.equal(res.intervalDays, 1);
    assert.equal(res.needsRefresher, false);
    assert.equal(res.lastReviewedAt, baseTime);
    assert.equal(res.nextReviewAt, "2026-11-01T12:00:00.000Z");
  });

  it("schedules second successful review (rep 2) with interval = 3 days", () => {
    const prev = {
      reps: 1,
      lapses: 0,
      intervalDays: 1,
      easinessFactor: 2.5,
    };
    const res = scheduleReview(prev, 5, baseTime);
    assert.equal(res.reps, 2);
    assert.equal(res.lapses, 0);
    assert.equal(res.intervalDays, 3);
    assert.equal(res.nextReviewAt, "2026-11-03T12:00:00.000Z");
  });

  it("schedules third successful review (rep 3) with interval = round(prevInterval * prevEf)", () => {
    const prev = {
      reps: 2,
      lapses: 0,
      intervalDays: 3,
      easinessFactor: 2.6,
    };
    const res = scheduleReview(prev, 4, baseTime);
    assert.equal(res.reps, 3);
    // round(3 * 2.6) = round(7.8) = 8
    assert.equal(res.intervalDays, 8);
    assert.equal(res.nextReviewAt, "2026-11-08T12:00:00.000Z");
  });

  it("enforces easiness factor floor of 1.3", () => {
    let state = {
      reps: 2,
      lapses: 0,
      intervalDays: 3,
      easinessFactor: 1.4,
    };
    // q = 3 (marginal pass, delta = -0.14) -> 1.4 - 0.14 = 1.26 -> floor 1.3
    const res = scheduleReview(state, 3, baseTime);
    assert.equal(res.easinessFactor, MIN_EASINESS_FACTOR);
  });

  it("handles failure (lapse) by resetting reps to 0 and scheduling 1 day interval", () => {
    const prev = {
      reps: 4,
      lapses: 1,
      intervalDays: 21,
      easinessFactor: 2.3,
    };
    const res = scheduleReview(prev, 1, baseTime);
    assert.equal(res.reps, 0);
    assert.equal(res.lapses, 2);
    assert.equal(res.intervalDays, 1);
    assert.equal(res.needsRefresher, true);
    assert.equal(res.nextReviewAt, "2026-11-01T12:00:00.000Z");
  });
});
