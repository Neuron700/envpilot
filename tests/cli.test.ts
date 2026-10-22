import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const cli = path.resolve("dist", "cli", "index.js");
const fixtures = path.resolve("fixtures");

async function run(args: string[]): Promise<{
  stdout: string;
  stderr: string;
  code: number;
}> {
  try {
    const result = await execFileAsync(process.execPath, [cli, ...args], {
      cwd: path.resolve("."),
      windowsHide: true,
    });
    return { ...result, code: 0 };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? "",
      code: typeof failure.code === "number" ? failure.code : 1,
    };
  }
}

describe("CLI", () => {
  it("scans a project and emits parseable JSON", async () => {
    const result = await run(["scan", path.join(fixtures, "node-healthy"), "--format", "json"]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    const parsed = JSON.parse(result.stdout) as { schemaVersion: string; findings: unknown[] };
    expect(parsed.schemaVersion).toBe("1.0");
    expect(parsed.findings.length).toBeGreaterThan(0);
  });

  it("reports unsupported projects with a non-zero exit code", async () => {
    const result = await run(["scan", path.join(fixtures, "unsupported")]);

    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/supported|unsupported/i);
  });

  it("reports a missing project path with exit code 2", async () => {
    const result = await run(["scan", path.join(fixtures, "does-not-exist")]);

    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/does not exist/i);
  });

  it("renders a Markdown report", async () => {
    const result = await run(["report", path.join(fixtures, "node-healthy"), "--format", "markdown"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("# EnvPilot report");
    expect(result.stdout).toContain("Readiness score");
  });

  it("lists diagnostic rules with weights", async () => {
    const result = await run(["rules"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("node-runtime-engines");
    expect(result.stdout).toContain("python-runtime-version");
    expect(result.stdout).toMatch(/weight/i);
    expect(result.stdout).toMatch(/severity/i);
  });

  it("shows help", async () => {
    const result = await run(["--help"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("scan");
    expect(result.stdout).toContain("doctor");
    expect(result.stdout).toContain("report");
  });

  it("accepts a local env file flag without exposing values", async () => {
    const result = await run([
      "scan",
      path.join(fixtures, "node-broken"),
      "--local-env-file",
      ".env",
      "--check-env",
      "--format",
      "json",
    ]);

    expect(result.stderr).toBe("");
    const parsed = JSON.parse(result.stdout) as {
      findings: Array<{ id: string; status: string }>;
    };
    expect(parsed.findings.find((finding) => finding.id === "env-local-keys")?.status).toBe(
      "fail",
    );
    expect(result.stdout).not.toContain("super-secret-value");
  });

  it("treats a local env file as enabling key comparison", async () => {
    const result = await run([
      "scan",
      path.join(fixtures, "node-broken"),
      "--local-env-file",
      ".env",
      "--format",
      "json",
    ]);

    expect(result.stderr).toBe("");
    const parsed = JSON.parse(result.stdout) as {
      findings: Array<{ id: string; status: string }>;
    };
    expect(parsed.findings.find((finding) => finding.id === "env-local-keys")?.status).toBe(
      "fail",
    );
  });

  it.each([
    ["unknown command", ["bogus"]],
    ["extra arguments", ["scan", path.join(fixtures, "node-healthy"), "extra"]],
    ["invalid format", ["scan", path.join(fixtures, "node-healthy"), "--format", "xml"]],
    ["missing command", []],
  ])("rejects %s with exit code 2", async (_label, args) => {
    const result = await run(args);

    expect(result.code).toBe(2);
  });
});
