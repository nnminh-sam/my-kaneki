import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { SESSION_TTL_SECONDS, shouldRenew, signJwt, verifyJwt } from "./jwt";
import { hashPassword, validatePassword, verifyPassword } from "./password";
import { authMode, authenticate, issueSession, safeNext } from "./index";
import { logIn, signUp } from "./users";
import { setDbForTests } from "../db";
import { migrate } from "../migrate";

const TEST_SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef";

describe("JWT signing and verification", () => {
  it("signs and verifies a valid HS256 token", () => {
    const token = signJwt(
      { sub: "U-1", email: "user@example.com", name: "Kaneki" },
      TEST_SECRET,
      { ttlSeconds: 3600, now: 1_700_000_000 },
    );
    const claims = verifyJwt(token, TEST_SECRET, { now: 1_700_000_500 });
    assert.deepEqual(claims, {
      sub: "U-1",
      email: "user@example.com",
      name: "Kaneki",
      iat: 1_700_000_000,
      exp: 1_700_003_600,
      iss: "my_kaneki",
      auth_time: 1_700_000_000,
    });
  });

  it("rejects expired or tampered tokens", () => {
    const token = signJwt(
      { sub: "U-1", email: "user@example.com" },
      TEST_SECRET,
      { ttlSeconds: 60, now: 1_000 },
    );
    assert.equal(verifyJwt(token, TEST_SECRET, { now: 1_060 }), null);
    assert.equal(verifyJwt(`${token}x`, TEST_SECRET, { now: 1_010 }), null);
  });

  it("determines sliding renewal window accurately", () => {
    const authTime = 1_000;
    const exp = authTime + SESSION_TTL_SECONDS;
    assert.equal(shouldRenew({ exp, auth_time: authTime }, authTime + 600), false);
    assert.equal(shouldRenew({ exp, auth_time: authTime }, exp - 1200), true);
  });
});

describe("Password hashing and policy", () => {
  it("hashes and verifies passwords with scrypt", async () => {
    const encoded = await hashPassword("correct-horse-battery-staple", { log2N: 12, r: 8, p: 1 });
    assert.equal(await verifyPassword("correct-horse-battery-staple", encoded), true);
    assert.equal(await verifyPassword("wrong-password-attempt", encoded), false);
  });

  it("enforces password length and email difference", () => {
    assert.match(validatePassword("short") ?? "", /at least/);
    assert.match(validatePassword("user@example.com", "user@example.com") ?? "", /not be the same/);
    assert.equal(validatePassword("strong-passphrase-123", "user@example.com"), null);
  });
});

describe("Auth mode & session helpers", () => {
  it("resolves jwt, open, and locked modes", () => {
    assert.equal(authMode({ JWT_SECRET: TEST_SECRET }), "jwt");
    assert.equal(authMode({ JWT_SECRET: "too-short" }), "locked");
    assert.equal(authMode({ VERCEL: "1" }), "locked");
    assert.equal(authMode({}), "open");
  });

  it("authenticates from cookie or bearer token", () => {
    const env = { JWT_SECRET: TEST_SECRET };
    const session = issueSession({ id: "U-1", email: "kaneki@example.com", name: "Kaneki" }, { env, now: 5_000 });
    assert.equal(authenticate({ sessionCookie: session.token }, { env, now: 5_100 })?.sub, "U-1");
    assert.equal(authenticate({ authorization: `Bearer ${session.token}` }, { env, now: 5_100 })?.email, "kaneki@example.com");
  });

  it("sanitizes next redirect paths", () => {
    assert.equal(safeNext("/notes"), "/notes");
    assert.equal(safeNext("//evil.example"), "/");
    assert.equal(safeNext("https://evil.example"), "/");
  });
});

describe("Neon schema migration & user auth flow (PGlite)", () => {
  it("migrates 001_users.sql, signs up first user, and logs in", async () => {
    const pg = new PGlite();
    setDbForTests({
      query: async (text, params) => (await pg.query(text, params)).rows as Record<string, unknown>[],
      transaction: async (statements) => {
        const out: Record<string, unknown>[][] = [];
        for (const s of statements) {
          out.push((await pg.query(s.text, s.params)).rows as Record<string, unknown>[]);
        }
        return out;
      },
    });

    const applied = await migrate({
      exec: async (sql) => {
        await pg.exec(sql);
      },
      query: async (text, params) => (await pg.query(text, params)).rows as Record<string, unknown>[],
    });
    assert.ok(applied.includes("001_users"));

    const fastScrypt = { log2N: 12, r: 8, p: 1 };
    const signupRes = await signUp(
      {
        name: "Kaneki Ken",
        email: "Kaneki@Example.com",
        password: "super-secret-password",
        confirm: "super-secret-password",
      },
      { env: {}, hashParams: fastScrypt },
    );
    assert.deepEqual(signupRes, {
      ok: true,
      user: { id: "U-1", name: "Kaneki Ken", email: "kaneki@example.com" },
    });

    // Second uninvited signup should be closed by default
    const closedRes = await signUp(
      {
        email: "other@example.com",
        password: "another-secret-password",
        confirm: "another-secret-password",
      },
      { env: {}, hashParams: fastScrypt },
    );
    assert.equal(closedRes.ok, false);
    if (!closedRes.ok) assert.equal(closedRes.error, "signup_closed");

    // Login succeeds with valid credentials
    const loginRes = await logIn({ email: "kaneki@example.com", password: "super-secret-password" });
    assert.deepEqual(loginRes, {
      ok: true,
      user: { id: "U-1", name: "Kaneki Ken", email: "kaneki@example.com" },
    });
  });
});
