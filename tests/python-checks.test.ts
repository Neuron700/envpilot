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

const pyproject = (requiresPython: string) => `[project]
name = "python-check"
version = "0.1.0"
requires-python = "${requiresPython}"
dependencies = ["requests>=2.31"]
`;

describe("Python checks", () => {
  it("passes when the interpreter satisfies requires-python", async () => {
    const root = await project({ "pyproject.toml": pyproject(">=3.11") });

    const findings = await runChecks(await contextFor(root));

    expect(finding(findings, "python-runtime-version").status).toBe("pass");
    expect(finding(findings, "python-interpreter").status).toBe("pass");
  });

  it("fails when .python-version does not match the interpreter", async () => {
    const root = await project({
      "pyproject.toml": pyproject(">=3.11"),
      ".python-version": "3.9\n",
    });

    const findings = await runChecks(await contextFor(root));
    const result = finding(findings, "python-runtime-version");

    expect(result.status).toBe("fail");
    expect(result.evidence.join(" ")).toContain("3.9");
  });

  it("explains how many declared requirements failed", async () => {
    const root = await project({
      "pyproject.toml": pyproject(">=3.12"),
      ".python-version": "3.8\n",
      "Pipfile": '[requires]\npython_version = "3.8"\n',
    });

    const findings = await runChecks(await contextFor(root));
    const result = finding(findings, "python-runtime-version");

    expect(result.status).toBe("fail");
    expect(result.message).toMatch(/2 of 3/);
  });

  it("does not leak TOML source lines from parser errors", async () => {
    const secret = "super-secret-toml-value";
    const root = await project({
      "pyproject.toml": `[project]
name = "broken"
dependencies = ["requests>=2.31"
# ${secret}
`,
    });

    const findings = await runChecks(await contextFor(root));

    expect(JSON.stringify(findings)).not.toContain(secret);
  });

  it("warns instead of claiming compatibility for an unsupported range", async () => {
    const root = await project({
      "pyproject.toml": pyproject("banana"),
    });

    const findings = await runChecks(await contextFor(root));
    const result = finding(findings, "python-runtime-version");

    expect(result.status).toBe("warning");
    expect(result.message).toMatch(/cannot|unsupported|evaluate/i);
  });

  it("fails when no Python executable is available", async () => {
    const root = await project({ "pyproject.toml": pyproject(">=3.11") });
    const context = await contextFor(
      root,
      {},
      fakeRuntime({ python: null, pythonError: "Python executable not found" }),
    );

    const findings = await runChecks(context);

    expect(finding(findings, "python-interpreter").status).toBe("fail");
    expect(finding(findings, "python-runtime-version").status).toBe("skipped");
  });

  it("warns when multiple dependency sources compete", async () => {
    const root = await project({
      "pyproject.toml": pyproject(">=3.11"),
      "requirements.txt": "requests==2.31.0\n",
    });

    const findings = await runChecks(await contextFor(root));
    const result = finding(findings, "python-dependency-sources");

    expect(result.status).toBe("warning");
    expect(result.message).toMatch(/multiple/i);
  });

  it("warns when no dependency declarations exist", async () => {
    const root = await project({
      "pyproject.toml": `[project]
name = "empty"
version = "0.1.0"
`,
    });

    const findings = await runChecks(await contextFor(root));
    expect(finding(findings, "python-dependency-sources").status).toBe("warning");
  });

  it("discovers and parses requirements variant files", async () => {
    const root = await project({
      "requirements-dev.txt": "requests==2.31.0\n",
    });
    const context = await contextFor(root);

    expect(context.project.kinds).toContain("python");
    expect(context.project.markers).toContain("requirements-dev.txt");

    const findings = await runChecks(context);
    expect(finding(findings, "python-dependency-parse").status).toBe("pass");
    expect(finding(findings, "python-dependency-sources").message).toContain(
      "requirements-dev.txt",
    );
  });

  it("discovers nested requirements directory files", async () => {
    const root = await project({
      "requirements/base.txt": "requests==2.31.0\n",
    });
    const context = await contextFor(root);

    expect(context.project.kinds).toContain("python");
    expect(context.project.markers).toContain("requirements/base.txt");

    const findings = await runChecks(context);
    expect(finding(findings, "python-dependency-parse").status).toBe("pass");
  });

  it("accepts inline comments and pip hash options", async () => {
    const root = await project({
      "requirements.txt": [
        "requests==2.31.0  # pinned for compatibility",
        "urllib3>=2.0 --hash=sha256:abc123",
        "",
      ].join("\n"),
    });

    const findings = await runChecks(await contextFor(root));

    expect(finding(findings, "python-dependency-parse").status).toBe("pass");
  });
});
