import { afterEach, describe, expect, it } from "vitest";
import { runChecks } from "../src/checks/run";
import { contextFor, makeProject, removeProject } from "./helpers";

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

describe("environment variable checks", () => {
  it("skips local comparison unless explicitly enabled", async () => {
    const root = await project({
      "package.json": JSON.stringify({ name: "env" }),
      ".env.example": "API_KEY=\nDB_URL=\n",
      ".env": "API_KEY=super-secret-value\nDB_URL=postgres://secret\n",
    });

    const findings = await runChecks(await contextFor(root));
    const result = finding(findings, "env-local-keys");

    expect(result.status).toBe("skipped");
    expect(finding(findings, "env-required-keys").evidence).toEqual(["API_KEY", "DB_URL"]);
    expect(JSON.stringify(findings)).not.toContain("super-secret-value");
    expect(JSON.stringify(findings)).not.toContain("postgres://secret");
  });

  it("reports missing key names without exposing values", async () => {
    const root = await project({
      "package.json": JSON.stringify({ name: "env" }),
      ".env.example": "API_KEY=\nDB_URL=\n",
      ".env": "API_KEY=super-secret-value\n",
    });

    const findings = await runChecks(await contextFor(root, { checkEnv: true }));
    const result = finding(findings, "env-local-keys");

    expect(result.status).toBe("fail");
    expect(result.evidence).toEqual(["DB_URL"]);
    expect(JSON.stringify(findings)).not.toContain("super-secret-value");
  });

  it("passes when every required key exists", async () => {
    const root = await project({
      "package.json": JSON.stringify({ name: "env" }),
      ".env.example": "API_KEY=\nDB_URL=\n",
      ".env": "API_KEY=secret\nDB_URL=also-secret\n",
    });

    const findings = await runChecks(await contextFor(root, { checkEnv: true }));
    expect(finding(findings, "env-local-keys").status).toBe("pass");
    expect(JSON.stringify(findings)).not.toContain("also-secret");
  });

  it("supports an explicit env file relative to the project", async () => {
    const root = await project({
      "package.json": JSON.stringify({ name: "env" }),
      ".env.example": "API_KEY=\n",
      "config/local.env": "API_KEY=secret\n",
    });

    const findings = await runChecks(
      await contextFor(root, { checkEnv: true, envFile: "config/local.env" }),
    );

    expect(finding(findings, "env-local-keys").status).toBe("pass");
  });

  it("unions keys from related templates", async () => {
    const root = await project({
      "package.json": JSON.stringify({ name: "env" }),
      ".env.example": "API_KEY=\n",
      ".env.template": "DB_URL=\n",
    });

    const findings = await runChecks(await contextFor(root));
    expect(finding(findings, "env-required-keys").evidence).toEqual(["API_KEY", "DB_URL"]);
  });
});
