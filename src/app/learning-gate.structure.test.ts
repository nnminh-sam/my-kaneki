import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const LEARNING_DIR = path.join(process.cwd(), "src", "app", "(workspace)", "learning");

/** Every page.tsx under the learning route tree, as POSIX paths relative to the learning directory. */
async function listPages(dir: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const pages: string[] = [];
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      pages.push(...(await listPages(path.join(dir, entry.name), rel)));
    } else if (entry.name === "page.tsx") {
      pages.push(rel);
    }
  }
  return pages.sort();
}

/** The flag check: the lms feature is read and a disabled feature answers 404. */
function hasFlagCheck(source: string): boolean {
  return /isFeatureEnabled\(\s*owner\s*,\s*"lms"\s*\)/.test(source) && /notFound\(\)/.test(source);
}

/** Page-discovery check: throws an AssertionError naming the first page under dir without the flag check. */
async function assertEveryPageGuarded(dir: string): Promise<void> {
  const pages = await listPages(dir);
  assert.ok(pages.length > 0, "no learning pages discovered");
  for (const page of pages) {
    const source = await readFile(path.join(dir, page), "utf8");
    assert.ok(hasFlagCheck(source), `learning/${page} must call notFound() when lms is off`);
  }
}

describe("learning route gate (structure)", () => {
  it("guards the whole learning tree with the lms check in the learning layout", async () => {
    const layout = await readFile(path.join(LEARNING_DIR, "layout.tsx"), "utf8");
    assert.ok(hasFlagCheck(layout), "learning/layout.tsx must call notFound() when lms is off");
  });

  it("keeps the subject layout's flag check before its data loads", async () => {
    const subjectLayout = await readFile(path.join(LEARNING_DIR, "[slug]", "layout.tsx"), "utf8");
    assert.ok(hasFlagCheck(subjectLayout));
    assert.ok(subjectLayout.indexOf("isFeatureEnabled(") < subjectLayout.indexOf("getSubjectBySlug("));
  });

  it("checks the flag in every learning page, so a page without it fails", async () => {
    await assertEveryPageGuarded(LEARNING_DIR);
  });

  it("fails the page-discovery check on a temporary unguarded page and names that page", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "learning-gate-"));
    try {
      await mkdir(path.join(dir, "x"));
      await writeFile(path.join(dir, "x", "page.tsx"), `export default async function Page() { return <main>x</main>; }`);
      await assert.rejects(
        assertEveryPageGuarded(dir),
        (error: unknown) => error instanceof Error && error.message.includes("x/page.tsx"),
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects a page source without the lms flag check", () => {
    const withoutGuard = `export default async function Page() { return <main>subject</main>; }`;
    const withGuardOnly = `import { notFound } from "next/navigation";\nexport default async function Page() { notFound(); }`;
    const withoutNotFound = `if (await isFeatureEnabled(owner, "lms")) { return null; }`;
    assert.equal(hasFlagCheck(withoutGuard), false);
    assert.equal(hasFlagCheck(withGuardOnly), false);
    assert.equal(hasFlagCheck(withoutNotFound), false);
  });

  it("accepts a page source with the lms flag check", () => {
    const guarded = `if (!(await isFeatureEnabled(owner, "lms"))) { notFound(); }`;
    assert.equal(hasFlagCheck(guarded), true);
  });

  it("lists the learning pages, so a new page cannot skip review", async () => {
    const pages = await listPages(LEARNING_DIR);
    assert.deepEqual(pages, [
      "[slug]/graph/page.tsx",
      "[slug]/module/[nodeId]/page.tsx",
      "[slug]/module/page.tsx",
      "[slug]/page.tsx",
      "[slug]/quiz/[quizId]/page.tsx",
      "[slug]/quiz/page.tsx",
      "[slug]/research/page.tsx",
      "[slug]/review/page.tsx",
      "[slug]/sources/page.tsx",
      "page.tsx",
      "review/page.tsx",
    ]);
  });
});
