export interface PlacementState {
  low: number;
  high: number;
  entryLevel: number;
  maxTiers: number;
}

export interface PlacementStepResult {
  done: boolean;
  nextMid: number | null;
  entryLevel: number;
  nextState: PlacementState;
}

/**
 * Initializes binary search placement bounds for a difficulty scale 1..maxTiers.
 */
export function initPlacementState(maxTiers: number): PlacementState {
  if (maxTiers < 1) {
    throw new Error("maxTiers must be at least 1");
  }
  return {
    low: 1,
    high: maxTiers,
    entryLevel: 1,
    maxTiers,
  };
}

/**
 * Computes the midpoint tier to test: floor((low + high) / 2).
 */
export function calculateMid(low: number, high: number): number {
  return Math.floor((low + high) / 2);
}

/**
 * Steps the binary search placement state based on whether the learner
 * answered the question at the current midpoint correctly.
 *
 * If correct: learner has mastered tier `mid`; search upper half (low = mid + 1, entryLevel = mid + 1).
 * If incorrect: learner has a gap at tier `mid`; search lower half (high = mid - 1).
 *
 * When low > high, search terminates. The entry level is clamped to maxTiers
 * (meaning if all tiers 1..N were passed, entryLevel is capped at N).
 */
export function stepBinarySearchPlacement(
  state: PlacementState,
  answeredCorrectly: boolean,
): PlacementStepResult {
  const mid = calculateMid(state.low, state.high);
  const nextState: PlacementState = { ...state };

  if (answeredCorrectly) {
    nextState.entryLevel = mid + 1;
    nextState.low = mid + 1;
  } else {
    nextState.high = mid - 1;
  }

  if (nextState.low > nextState.high) {
    const finalEntry = Math.max(1, Math.min(nextState.entryLevel, state.maxTiers));
    return {
      done: true,
      nextMid: null,
      entryLevel: finalEntry,
      nextState: {
        ...nextState,
        entryLevel: finalEntry,
      },
    };
  }

  const nextMid = calculateMid(nextState.low, nextState.high);
  return {
    done: false,
    nextMid,
    entryLevel: nextState.entryLevel,
    nextState,
  };
}
