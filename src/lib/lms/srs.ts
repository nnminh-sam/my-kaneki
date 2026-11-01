export interface SrsInputState {
  reps?: number;
  lapses?: number;
  intervalDays?: number;
  easinessFactor?: number;
}

export interface SrsScheduledResult {
  reps: number;
  lapses: number;
  intervalDays: number;
  easinessFactor: number;
  lastReviewedAt: string;
  nextReviewAt: string;
  needsRefresher: boolean;
}

export const MIN_EASINESS_FACTOR = 1.3;
export const DEFAULT_EASINESS_FACTOR = 2.5;

/**
 * Computes the updated SM-2 spaced repetition state based on the learner's
 * grade q in {0, 1, 2, 3, 4, 5}.
 *
 * Grades >= 3 are considered passing.
 * Grades < 3 trigger a lapse (reps reset to 0, lapses incremented, interval set to 1 day).
 */
export function scheduleReview(
  prev: SrsInputState | undefined,
  qualityGrade: 0 | 1 | 2 | 3 | 4 | 5,
  now: Date | string = new Date(),
): SrsScheduledResult {
  const nowDate = typeof now === "string" ? new Date(now) : now;
  const nowMs = nowDate.getTime();
  const nowIso = nowDate.toISOString();

  const prevReps = prev?.reps ?? 0;
  const prevLapses = prev?.lapses ?? 0;
  const prevInterval = prev?.intervalDays ?? 0;
  const prevEf = prev?.easinessFactor ?? DEFAULT_EASINESS_FACTOR;

  // Failing grade (lapse)
  if (qualityGrade < 3) {
    const nextReviewMs = nowMs + 1 * 24 * 60 * 60 * 1000;
    const nextEf = Math.max(MIN_EASINESS_FACTOR, Number((prevEf - 0.2).toFixed(2)));

    return {
      reps: 0,
      lapses: prevLapses + 1,
      intervalDays: 1,
      easinessFactor: nextEf,
      lastReviewedAt: nowIso,
      nextReviewAt: new Date(nextReviewMs).toISOString(),
      needsRefresher: true,
    };
  }

  // Passing grade
  const nextReps = prevReps + 1;
  let nextInterval: number;

  if (nextReps === 1) {
    nextInterval = 1;
  } else if (nextReps === 2) {
    nextInterval = 3;
  } else {
    nextInterval = Math.round(prevInterval * prevEf);
  }

  // Standard SM-2 EF adjustment: EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
  const efDelta = 0.1 - (5 - qualityGrade) * (0.08 + (5 - qualityGrade) * 0.02);
  const nextEf = Math.max(MIN_EASINESS_FACTOR, Number((prevEf + efDelta).toFixed(2)));
  const nextReviewMs = nowMs + nextInterval * 24 * 60 * 60 * 1000;

  return {
    reps: nextReps,
    lapses: prevLapses,
    intervalDays: nextInterval,
    easinessFactor: nextEf,
    lastReviewedAt: nowIso,
    nextReviewAt: new Date(nextReviewMs).toISOString(),
    needsRefresher: false,
  };
}
