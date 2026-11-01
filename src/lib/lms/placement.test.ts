import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  initPlacementState,
  calculateMid,
  stepBinarySearchPlacement,
  type PlacementState,
} from "./placement";

describe("Binary Search Placement Algorithm", () => {
  it("initializes valid bounds for various tier sizes", () => {
    assert.throws(() => initPlacementState(0), /maxTiers must be at least 1/);

    const s1 = initPlacementState(1);
    assert.equal(s1.low, 1);
    assert.equal(s1.high, 1);
    assert.equal(calculateMid(s1.low, s1.high), 1);

    const s16 = initPlacementState(16);
    assert.equal(s16.low, 1);
    assert.equal(s16.high, 16);
    assert.equal(calculateMid(s16.low, s16.high), 8);
  });

  it("handles N=1 correctly for all-wrong and all-correct", () => {
    // All-wrong at N=1
    let state = initPlacementState(1);
    let step = stepBinarySearchPlacement(state, false);
    assert.equal(step.done, true);
    assert.equal(step.entryLevel, 1);

    // All-correct at N=1
    state = initPlacementState(1);
    step = stepBinarySearchPlacement(state, true);
    assert.equal(step.done, true);
    assert.equal(step.entryLevel, 1); // clamped to maxTiers = 1
  });

  it("handles N=2 boundary cases", () => {
    // Both wrong:
    let state = initPlacementState(2); // mid = 1
    let step = stepBinarySearchPlacement(state, false); // high = 0 -> done
    assert.equal(step.done, true);
    assert.equal(step.entryLevel, 1);

    // Mid (1) correct, tier 2 wrong:
    state = initPlacementState(2); // mid = 1
    step = stepBinarySearchPlacement(state, true); // low = 2, mid = 2
    assert.equal(step.done, false);
    assert.equal(step.nextMid, 2);
    step = stepBinarySearchPlacement(step.nextState, false); // high = 1 -> done
    assert.equal(step.done, true);
    assert.equal(step.entryLevel, 2);

    // Both correct:
    state = initPlacementState(2);
    step = stepBinarySearchPlacement(state, true); // mid 1 correct -> low = 2, mid = 2
    step = stepBinarySearchPlacement(step.nextState, true); // mid 2 correct -> low = 3 > 2 -> done
    assert.equal(step.done, true);
    assert.equal(step.entryLevel, 2); // clamped to 2
  });

  it("converges for N=16 matching test trajectory from skills", () => {
    let state = initPlacementState(16);
    assert.equal(calculateMid(state.low, state.high), 8);

    // Step 1: tier 8 correct -> mid 12
    let step = stepBinarySearchPlacement(state, true);
    assert.equal(step.done, false);
    assert.equal(step.nextMid, 12);

    // Step 2: tier 12 correct -> mid 14
    step = stepBinarySearchPlacement(step.nextState, true);
    assert.equal(step.done, false);
    assert.equal(step.nextMid, 14);

    // Step 3: tier 14 wrong -> mid 13
    step = stepBinarySearchPlacement(step.nextState, false);
    assert.equal(step.done, false);
    assert.equal(step.nextMid, 13);

    // Step 4: tier 13 correct -> done, entry level 14
    step = stepBinarySearchPlacement(step.nextState, true);
    assert.equal(step.done, true);
    assert.equal(step.entryLevel, 14);
  });

  it("handles all-wrong at N=32", () => {
    let state = initPlacementState(32);
    let stepCount = 0;
    while (true) {
      stepCount++;
      const step = stepBinarySearchPlacement(state, false);
      if (step.done) {
        assert.equal(step.entryLevel, 1);
        break;
      }
      state = step.nextState;
      assert.ok(stepCount <= 6, "Must finish in at most ceil(log2(32)) = 5 or 6 steps");
    }
  });

  it("handles all-correct at N=32 (clamped to maxTiers)", () => {
    let state = initPlacementState(32);
    let stepCount = 0;
    while (true) {
      stepCount++;
      const step = stepBinarySearchPlacement(state, true);
      if (step.done) {
        assert.equal(step.entryLevel, 32);
        break;
      }
      state = step.nextState;
      assert.ok(stepCount <= 6);
    }
  });

  it("exhaustive verification: for every boundary k in [0..N] across N in [1..64]", () => {
    // If learner knows tiers 1..k (where 0 means knows nothing, and N means knows all 1..N):
    // - questions with tier <= k are answered TRUE (correct)
    // - questions with tier > k are answered FALSE (incorrect)
    // The expected placement entry level is:
    // - if k == 0: entryLevel = 1
    // - if 1 <= k < N: entryLevel = k + 1
    // - if k == N: entryLevel = N (clamped to maxTiers)
    for (let N = 1; N <= 64; N++) {
      const maxAllowedSteps = Math.ceil(Math.log2(N + 1)) + 1;

      for (let k = 0; k <= N; k++) {
        let state = initPlacementState(N);
        let steps = 0;
        const expectedEntry = k === 0 ? 1 : Math.min(k + 1, N);

        while (true) {
          steps++;
          assert.ok(
            steps <= maxAllowedSteps,
            `Exceeded step limit: N=${N}, k=${k}, steps=${steps}, max=${maxAllowedSteps}`,
          );

          const mid = calculateMid(state.low, state.high);
          const isCorrect = mid <= k;
          const result = stepBinarySearchPlacement(state, isCorrect);

          if (result.done) {
            assert.equal(
              result.entryLevel,
              expectedEntry,
              `Mismatch for N=${N}, k=${k}: got entry ${result.entryLevel}, expected ${expectedEntry}`,
            );
            break;
          }
          state = result.nextState;
        }
      }
    }
  });
});
