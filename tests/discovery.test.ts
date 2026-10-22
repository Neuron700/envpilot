import path from "node:path";
import { describe, expect, it } from "vitest";
import { discoverProject } from "../src/discovery/discover";

const fixture = (name: string) => path.resolve("fixtures", name);

describe("project discovery", () => {
  it("detects a Node.js project and its evidence files", async () => {
    const project = await discoverProject(fixture("node-healthy"));

    expect(project.kinds).toEqual(["node"]);
    expect(project.markers).toContain("package.json");
    expect(project.markers).toContain("package-lock.json");
    expect(project.markers).toContain(".nvmrc");
    expect(project.name).toBe("node-healthy");
  });

  it("detects a Python project", async () => {
    const project = await discoverProject(fixture("python-healthy"));

    expect(project.kinds).toEqual(["python"]);
    expect(project.markers).toContain("pyproject.toml");
    expect(project.markers).toContain(".python-version");
  });

  it("detects both kinds in a mixed project", async () => {
    const project = await discoverProject(fixture("mixed"));

    expect(project.kinds).toEqual(["node", "python"]);
    expect(project.markers).toContain("package.json");
    expect(project.markers).toContain("requirements.txt");
  });

  it("returns an empty kind list for an unsupported directory", async () => {
    const project = await discoverProject(fixture("unsupported"));

    expect(project.kinds).toEqual([]);
    expect(project.markers).toEqual([]);
  });
});
