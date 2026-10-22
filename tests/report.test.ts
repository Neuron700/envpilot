import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderJson } from "../src/report/json";
import { renderMarkdown } from "../src/report/markdown";
import { renderTerminal } from "../src/report/terminal";
import { scanProject } from "../src/scan";
import { fakeRuntime, makeProject, removeProject, snapshotDirectory } from "./helpers";

const fixtures = path.resolve("fixtures");

describe("reports", () => {
  it("produces parseable JSON without absolute paths or secret values", async () => {
    const report = await scanProject(path.join(fixtures, "node-healthy"), {
      runtime: fakeRuntime(),
      checkEnv: true,
      now: new Date("2026-01-02T03:04:05.000Z"),
    });

    const json = renderJson(report);
    const parsed = JSON.parse(json) as Record<string, unknown>;

    expect(parsed.schemaVersion).toBe("1.0");
    expect(parsed.generatedAt).toBe("2026-01-02T03:04:05.000Z");
    expect((parsed.environment as { pythonChecked: boolean }).pythonChecked).toBe(false);
    expect(json).not.toContain(path.join(fixtures, "node-healthy"));
    expect(json).not.toContain("super-secret-value");
  });

  it("writes a Markdown report with score, findings, and recommendations", async () => {
    const report = await scanProject(path.join(fixtures, "node-healthy"), {
      runtime: fakeRuntime(),
      checkEnv: true,
      now: new Date("2026-01-02T03:04:05.000Z"),
    });

    const markdown = renderMarkdown(report);

    expect(markdown).toContain("# EnvPilot report");
    expect(markdown).toContain("Readiness score");
    expect(markdown).toContain("Recommendation");
    expect(markdown).toContain("node-runtime-engines");
    expect(markdown).toContain("## Environment");
    expect(markdown).toContain("Node.js");
    expect(markdown).not.toContain("super-secret-value");
    expect(markdown).not.toMatch(/\u001b\[/);
  });

  it("renders a detailed doctor view with evidence and skips", async () => {
    const report = await scanProject(path.join(fixtures, "node-healthy"), {
      runtime: fakeRuntime(),
      now: new Date("2026-01-02T03:04:05.000Z"),
    });

    const output = renderTerminal(report, { mode: "doctor", color: false });

    expect(output).toContain("EnvPilot doctor");
    expect(output).toContain("Evidence");
    expect(output).toContain("Skipped");
    expect(output).toContain("Python: not checked");
  });

  it("explains a withheld score and its limitations in scan output", async () => {
    const root = await makeProject({
      "package.json": JSON.stringify({ name: "minimal", engines: { node: ">=20" } }),
    });
    try {
      const report = await scanProject(root, {
        runtime: fakeRuntime(),
        now: new Date("2026-01-02T03:04:05.000Z"),
      });

      const output = renderTerminal(report, { mode: "scan", color: false });

      expect(report.score).toBeNull();
      expect(output).toContain("Limitations:");
      expect(output).toMatch(/less than half|no runtime version|fewer than two/i);
      expect(output).not.toContain("Local .env key comparison");
    } finally {
      await removeProject(root);
    }
  });

  it("neutralizes terminal controls and Markdown HTML in rendered output", async () => {
    const malicious = "<script>alert(1)</script>\u001b[31m";
    const root = await makeProject({
      "package.json": JSON.stringify({
        name: "injection",
        engines: { node: malicious },
      }),
    });
    try {
      const report = await scanProject(root, {
        runtime: fakeRuntime(),
        now: new Date("2026-01-02T03:04:05.000Z"),
      });

      const markdown = renderMarkdown(report);
      const terminal = renderTerminal(report, { mode: "scan", color: false });

      expect(markdown).not.toContain("<script>");
      expect(markdown).not.toContain("\u001b");
      expect(markdown).toContain("&lt;script&gt;");
      expect(terminal).not.toContain("\u001b");
    } finally {
      await removeProject(root);
    }
  });

  it("shows safe evidence for scan failures without exposing values", async () => {
    const report = await scanProject(path.join(fixtures, "node-broken"), {
      runtime: fakeRuntime(),
      checkEnv: true,
      now: new Date("2026-01-02T03:04:05.000Z"),
    });

    const output = renderTerminal(report, { mode: "scan", color: false });

    expect(output).toContain("DB_URL");
    expect(output).not.toContain("super-secret-value");
  });

  it("does not modify fixture files while scanning", async () => {
    const root = path.join(fixtures, "node-broken");
    const before = await snapshotDirectory(root);

    await scanProject(root, {
      runtime: fakeRuntime(),
      checkEnv: true,
      now: new Date("2026-01-02T03:04:05.000Z"),
    });

    const after = await snapshotDirectory(root);
    expect(after).toEqual(before);
  });
});

