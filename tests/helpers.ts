import { mkdtemp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { discoverProject } from "../src/discovery/discover";
import { createCheckContext } from "../src/checks/context";
import type { CheckOptions } from "../src/checks/types";
import type { RuntimeInfo } from "../src/environment/runtime";

export async function makeProject(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "envpilot-test-"));
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(root, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
  }
  return root;
}

export async function removeProject(root: string): Promise<void> {
  await rm(root, { recursive: true, force: true });
}

export function fakeRuntime(overrides: Partial<RuntimeInfo> = {}): RuntimeInfo {
  return {
    nodeVersion: "v20.11.1",
    platform: "win32",
    arch: "x64",
    python: {
      executable: "python",
      version: "3.14.7",
      raw: "Python 3.14.7",
    },
    pythonError: null,
    ...overrides,
  };
}

export async function contextFor(
  root: string,
  options: CheckOptions = {},
  runtime: RuntimeInfo = fakeRuntime(),
) {
  const project = await discoverProject(root);
  return createCheckContext(project, runtime, options);
}

export async function snapshotDirectory(root: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};

  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).replaceAll("\\", "/");
      if (entry.isDirectory()) {
        result[`${relative}/`] = "";
        await visit(absolute);
      } else if (entry.isFile()) {
        const info = await stat(absolute);
        const body = await readFile(absolute);
        result[relative] = `${info.size}:${body.toString("base64")}`;
      }
    }
  }

  await visit(root);
  return result;
}
