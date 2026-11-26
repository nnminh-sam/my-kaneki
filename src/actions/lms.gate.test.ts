import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { useTestDb } from "@/test/shared-db";
import { setDbForTests } from "@/lib/db";
import { createSource, createSubject } from "@/lib/lms/repo";
import type { SourceRow, SubjectRow } from "@/lib/lms/types";
import {
  captureEnv,
  FEATURE_TEST_ENV_KEYS,
  transactionalDb,
  useLockedMode,
  useOpenMode,
} from "@/test/feature-test-env";
import {
  deleteSourceAction,
  resolveEscalationAction,
  startPlacementAction,
  submitQuizAction,
  updateNodeStatusAction,
} from "./lms";

const FEATURE_OFF_MESSAGE = "Feature disabled: lms";

/** Row count of every lms_* table, so a refused action can be shown to write nothing. */
async function lmsRowCounts(pg: PGlite): Promise<Record<string, number>> {
  const { rows: tables } = await pg.query<{ tablename: string }>(
    `select tablename from pg_tables where schemaname = 'public' and tablename like 'lms\\_%' order by tablename`,
  );
  const counts: Record<string, number> = {};
  for (const { tablename } of tables) {
    const { rows } = await pg.query<{ n: string }>(`select count(*)::text as n from ${tablename}`);
    counts[tablename] = Number(rows[0].n);
  }
  return counts;
}

describe("LMS server actions behind the lms flag", () => {
  let pg: PGlite;
  let subject: SubjectRow;
  let source: SourceRow;
  let restoreEnv: () => void;
  before(() => {
    restoreEnv = captureEnv(FEATURE_TEST_ENV_KEYS);
  });
  after(() => restoreEnv());

  beforeEach(async () => {
    ({ pg } = await useTestDb());
    setDbForTests(transactionalDb(pg));
    useOpenMode();
    delete process.env.KANEKI_DISABLED_FEATURES;

    subject = await createSubject("", { slug: "gate-subject", title: "Gate subject" });
    source = await createSource("", subject.id, { track: "byos", sourceType: "markdown", title: "Gate source" });
  });

  it("refuses all five actions with the feature message when lms is off, and writes nothing", async () => {
    process.env.KANEKI_DISABLED_FEATURES = "lms";
    const before = await lmsRowCounts(pg);

    const results = [
      await submitQuizAction({ quizId: "quiz-1", submission: { type: "mcq_4", selectedOption: "A" } }),
      await startPlacementAction(subject.slug),
      await resolveEscalationAction({ sourceId: source.id, decision: "reject" }),
      await deleteSourceAction(source.id),
      await updateNodeStatusAction({ nodeId: "node-1", status: "in_progress" }),
    ];

    for (const result of results) {
      assert.deepEqual(result, { ok: false, error: FEATURE_OFF_MESSAGE });
    }
    assert.deepEqual(await lmsRowCounts(pg), before);
  });

  it("runs the existing path for each action when lms is on", async () => {
    const quiz = await submitQuizAction({ quizId: "missing-quiz", submission: { type: "mcq_4", selectedOption: "A" } });
    assert.deepEqual(quiz, { ok: false, error: "Quiz not found" });

    const placement = await startPlacementAction("missing-subject");
    assert.equal(placement.ok, false);
    assert.notEqual(placement.error, FEATURE_OFF_MESSAGE);
    assert.match(placement.error ?? "", /not found/);

    const escalation = await resolveEscalationAction({ sourceId: "missing-source", decision: "reject" });
    assert.equal(escalation.ok, false);
    assert.notEqual(escalation.error, FEATURE_OFF_MESSAGE);
    assert.match(escalation.error ?? "", /not found/);

    const node = await updateNodeStatusAction({ nodeId: "missing-node", status: "in_progress" });
    assert.equal(node.ok, false);
    assert.notEqual(node.error, FEATURE_OFF_MESSAGE);

    // The source delete reads subject metadata from GitHub: stub fetch so the test makes no outbound call.
    // After the delete commits, the action calls revalidatePath, which needs the Next request store and
    // throws outside a Next request. So the test expects that invariant, and only that one, after the delete.
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response("{}", { status: 404 });
    try {
      await assert.rejects(deleteSourceAction(source.id), /static generation store missing/);
    } finally {
      globalThis.fetch = realFetch;
    }
    const { rows } = await pg.query(`select id from lms_sources where id = $1`, [source.id]);
    assert.equal(rows.length, 0);
  });

  it("returns Unauthorized before the feature check for an unauthenticated caller", async () => {
    useLockedMode();
    process.env.KANEKI_DISABLED_FEATURES = "lms";
    const before = await lmsRowCounts(pg);

    const results = [
      await submitQuizAction({ quizId: "quiz-1", submission: { type: "mcq_4", selectedOption: "A" } }),
      await startPlacementAction(subject.slug),
      await resolveEscalationAction({ sourceId: source.id, decision: "reject" }),
      await deleteSourceAction(source.id),
      await updateNodeStatusAction({ nodeId: "node-1", status: "in_progress" }),
    ];

    for (const result of results) {
      assert.deepEqual(result, { ok: false, error: "Unauthorized" });
    }
    assert.deepEqual(await lmsRowCounts(pg), before);
  });
});
