import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  fetchVercelDashboard,
  getEnvFallbackVercelConfig,
  matchWorkspaceAppId,
  normalizeBuildLogEvents,
  normalizeDeploymentRecord,
  triggerVercelRedeploy,
} from "./vercel";

describe("Vercel Deployment Integration (src/lib/vercel.ts)", () => {
  it("resolves env fallback configuration cleanly", () => {
    const empty = getEnvFallbackVercelConfig("u1", {});
    assert.equal(Boolean(empty.apiToken), false);
    assert.equal(empty.source, "none");

    const withEnv = getEnvFallbackVercelConfig("u1", {
      VERCEL_ACCESS_TOKEN: "  vcp_secret_1234567890  ",
      VERCEL_TEAM_ID: " team_abc ",
    });
    assert.equal(withEnv.apiToken, "vcp_secret_1234567890");
    assert.equal(withEnv.teamId, "team_abc");
    assert.equal(withEnv.source, "env");
  });

  it("normalizes deployment records with duration and GitHub commit links", () => {
    const dep = normalizeDeploymentRecord({
      uid: "dpl_123",
      name: "my_kaneki",
      projectId: "prj_kaneki",
      url: "my-kaneki-git-main.vercel.app",
      inspectorUrl: "https://vercel.com/nnminh/my_kaneki/dpl_123",
      readyState: "READY",
      target: "production",
      createdAt: 1_700_000_000_000,
      buildingAt: 1_700_000_005_000,
      ready: 1_700_000_047_000,
      creator: { username: "nnminh" },
      meta: {
        githubCommitRef: "main",
        githubCommitSha: "9f8e7d6c5b4a3210",
        githubCommitMessage: "feat: add vercel deployments dashboard",
        githubCommitAuthorName: "Minh Nguyen",
        githubCommitOrg: "nnminh",
        githubCommitRepo: "my_kaneki",
      },
    });

    assert.equal(dep.id, "dpl_123");
    assert.equal(dep.name, "my_kaneki");
    assert.equal(dep.url, "https://my-kaneki-git-main.vercel.app");
    assert.equal(dep.state, "READY");
    assert.equal(dep.target, "production");
    assert.equal(dep.durationMs, 42_000);
    assert.equal(dep.branch, "main");
    assert.equal(dep.commitSha, "9f8e7d6c5b4a3210");
    assert.equal(dep.repoSlug, "nnminh/my_kaneki");
    assert.equal(
      dep.commitUrl,
      "https://github.com/nnminh/my_kaneki/commit/9f8e7d6c5b4a3210",
    );
  });

  it("matches workspace apps by project name or alias domain", () => {
    assert.equal(matchWorkspaceAppId("my_kaneki"), "my_kaneki");
    assert.equal(matchWorkspaceAppId("my-finance"), "my_finance");
    assert.equal(
      matchWorkspaceAppId("finance-tracker", [
        "myfinance-one-hazel.vercel.app",
      ]),
      "my_finance",
    );
    assert.equal(matchWorkspaceAppId("my_pm_agent"), "my_pm_agent");
    assert.equal(matchWorkspaceAppId("unrelated-blog"), null);
  });

  it("aggregates projects, counts, and externalAppStatuses in fetchVercelDashboard", async () => {
    const fakeFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("/v6/deployments")) {
        return new Response(
          JSON.stringify({
            deployments: [
              {
                uid: "dpl_fin_1",
                name: "my_finance",
                url: "myfinance-one-hazel.vercel.app",
                readyState: "READY",
                target: "production",
                createdAt: 2000,
                buildingAt: 2000,
                ready: 2500,
                meta: { githubCommitRef: "main", githubCommitSha: "abc1234" },
              },
              {
                uid: "dpl_pm_1",
                name: "my_pm_agent",
                url: "my-pm-agent-rouge.vercel.app",
                readyState: "BUILDING",
                target: "preview",
                createdAt: 3000,
                meta: { githubCommitRef: "feat/pm", githubCommitSha: "def5678" },
              },
              {
                uid: "dpl_err_1",
                name: "my_kaneki",
                url: "my-kaneki.vercel.app",
                readyState: "ERROR",
                target: "preview",
                createdAt: 1000,
                errorCode: "BUILD_FAILED",
                errorMessage: "Command `npm run build` exited with 1",
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.includes("/v9/projects")) {
        return new Response(
          JSON.stringify({
            projects: [
              {
                id: "prj_1",
                name: "my_finance",
                framework: "nextjs",
                targets: {
                  production: { alias: ["myfinance-one-hazel.vercel.app"] },
                },
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response("Not Found", { status: 404 });
    };

    const dash = await fetchVercelDashboard("u1", {
      fetchImpl: fakeFetch,
      configOverride: {
        ownerId: "u1",
        apiToken: "vcp_test_token_12345",
        teamId: "",
        source: "db",
      },
    });

    assert.equal(dash.config.configured, true);
    assert.equal(dash.counts.total, 3);
    assert.equal(dash.counts.ready, 1);
    assert.equal(dash.counts.building, 1);
    assert.equal(dash.counts.error, 1);
    assert.equal(dash.externalAppStatuses.my_finance?.state, "READY");
    assert.equal(dash.externalAppStatuses.my_pm_agent?.state, "BUILDING");
    assert.equal(dash.externalAppStatuses.my_kaneki?.state, "ERROR");
  });

  it("normalizes build log events and classifies error/warn levels", () => {
    const events = normalizeBuildLogEvents([
      { id: "1", created: 1000, type: "stdout", text: "Running next build..." },
      { id: "2", created: 1001, type: "stdout", text: "Warning: unused var" },
      {
        id: "3",
        created: 1002,
        type: "stderr",
        payload: { text: "Failed to compile: Type error" },
      },
    ]);

    assert.equal(events.length, 3);
    assert.equal(events[0].level, "info");
    assert.equal(events[1].level, "warn");
    assert.equal(events[2].level, "error");
  });

  it("triggers redeploy via POST /v13/deployments", async () => {
    let capturedBody = "";
    const fakeFetch: typeof fetch = async (_input, init) => {
      capturedBody = String(init?.body || "");
      return new Response(
        JSON.stringify({
          uid: "dpl_new_999",
          name: "my_kaneki",
          url: "my-kaneki-redeploy.vercel.app",
          readyState: "QUEUED",
          target: "production",
          createdAt: 5000,
        }),
        { status: 200 },
      );
    };

    const redeployed = await triggerVercelRedeploy(
      "u1",
      {
        deploymentId: "dpl_old_1",
        name: "my_kaneki",
        target: "production",
      },
      {
        fetchImpl: fakeFetch,
        configOverride: {
          ownerId: "u1",
          apiToken: "vcp_token",
          teamId: "team_1",
          source: "db",
        },
      },
    );

    assert.equal(redeployed.id, "dpl_new_999");
    assert.equal(redeployed.state, "QUEUED");
    assert.deepEqual(JSON.parse(capturedBody), {
      name: "my_kaneki",
      deploymentId: "dpl_old_1",
      target: "production",
    });
  });
});
