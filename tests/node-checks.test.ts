import { afterEach, describe, expect, it } from "vitest";
import { runChecks } from "../src/checks/run";
import { fakeRuntime, contextFor, makeProject, removeProject } from "./helpers";

const roots: string[] = [];

async function project(files: Record<string, string>) {
  const root = await makeProject(files);
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(removeProject));
});

function finding(findings: Awaited<ReturnType<typeof runChecks>>, id: string) {
  const item = findings.find((entry) => entry.id === id);
  if (!item) throw new Error(`Finding ${id} was not produced`);
  return item;
}

describe("Node.js checks", () => {
  it("passes when the active Node version satisfies engines.node", async () => {
    const root = await project({
      "package.json": JSON.stringify({ name: "ok", engines: { node: ">=20" } }),
      "package-lock.json": JSON.stringify({ lockfileVersion: 3, packages: { "": {} } }),
    });

    const findings = await runChecks(await contextFor(root));
    const result = finding(findings, "node-runtime-engines");

    expect(result.status).toBe("pass");
    expect(result.evidence.join(" ")).toContain("v20.11.1");
  });

  it("fails when the active Node version does not satisfy engines.node", async () => {
    const root = await project({
      "package.json": JSON.stringify({ name: "bad", engines: { node: ">=22" } }),
      "package-lock.json": JSON.stringify({ lockfileVersion: 3, packages: { "": {} } }),
    });

    const findings = await runChecks(await contextFor(root));
    const result = finding(findings, "node-runtime-engines");

    expect(result.status).toBe("fail");
    expect(result.recommendation).toMatch(/node/i);
  });

  it("warns instead of claiming compatibility for an invalid range", async () => {
    const root = await project({
      "package.json": JSON.stringify({ name: "bad-range", engines: { node: "not-a-range" } }),
    });

    const findings = await runChecks(await contextFor(root));
    const result = finding(findings, "node-runtime-engines");

    expect(result.status).toBe("warning");
    expect(result.message).toMatch(/cannot|invalid|evaluate/i);
  });

  it("skips engine comparison when no requirement is declared", async () => {
    const root = await project({ "package.json": JSON.stringify({ name: "bare" }) });

    const findings = await runChecks(await contextFor(root));
    expect(finding(findings, "node-runtime-engines").status).toBe("skipped");
  });

  it("treats a crashed check as skipped without leaking its error path", async () => {
    const root = await project({
      "package.json": JSON.stringify({ name: "crash", engines: { node: ">=20" } }),
    });
    const context = await contextFor(root);

    const findings = await runChecks(context, [
      {
        id: "node-manifest",
        run: async () => {
          throw new Error(`boom at ${root}`);
        },
      },
    ]);
    const result = finding(findings, "node-manifest");

    expect(result.status).toBe("skipped");
    expect(result.message).toMatch(/could not finish/i);
    expect(JSON.stringify(result)).not.toContain(root);
  });

  it("accepts a UTF-8 byte order mark in package.json", async () => {
    const root = await project({
      "package.json": `\uFEFF${JSON.stringify({
        name: "bom",
        engines: { node: ">=20" },
      })}`,
    });

    const findings = await runChecks(await contextFor(root));

    expect(finding(findings, "node-manifest").status).toBe("pass");
    expect(finding(findings, "node-runtime-engines").status).toBe("pass");
  });

  it("reports a malformed package manifest", async () => {
    const root = await project({ "package.json": "{ not json" });

    const findings = await runChecks(await contextFor(root));
    const result = finding(findings, "node-manifest");

    expect(result.status).toBe("fail");
    expect(result.message).toMatch(/JSON/i);
  });

  it("detects a declared package manager that conflicts with the lockfile", async () => {
    const root = await project({
      "package.json": JSON.stringify({ name: "pm", packageManager: "pnpm@9.0.0" }),
      "package-lock.json": JSON.stringify({ lockfileVersion: 3, packages: { "": {} } }),
    });

    const findings = await runChecks(await contextFor(root));
    const result = finding(findings, "node-package-manager");

    expect(result.status).toBe("warning");
    expect(result.message).toMatch(/pnpm/i);
  });

  it("warns when no lockfile exists", async () => {
    const root = await project({ "package.json": JSON.stringify({ name: "no-lock" }) });

    const findings = await runChecks(await contextFor(root));
    expect(finding(findings, "node-lockfile").status).toBe("warning");
  });

  it("identifies manifest dependencies missing from an npm lockfile", async () => {
    const root = await project({
      "package.json": JSON.stringify({
        name: "lock-mismatch",
        dependencies: { express: "^4.18.2" },
      }),
      "package-lock.json": JSON.stringify({
        lockfileVersion: 3,
        packages: {
          "": { dependencies: {} },
        },
      }),
    });

    const findings = await runChecks(await contextFor(root));
    const result = finding(findings, "node-lockfile-consistency");

    expect(result.status).toBe("warning");
    expect(result.evidence.join(" ")).toContain("express");
  });

  it("warns about malformed dependency metadata", async () => {
    const root = await project({
      "package.json": JSON.stringify({
        name: "metadata",
        dependencies: { express: "", broken: 42 },
      }),
    });

    const findings = await runChecks(await contextFor(root));
    const result = finding(findings, "node-dependency-metadata");

    expect(result.status).toBe("warning");
    expect(result.evidence.join(" ")).toContain("express");
  });
});
