import { lstat, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { projectFileExists } from "../security/safe-fs";
import type { ProjectDiscovery, ProjectKind } from "./types";

export class ProjectPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectPathError";
  }
}

interface MarkerDefinition {
  file: string;
  kind: ProjectKind;
}

export const SUPPORTED_MARKERS: readonly MarkerDefinition[] = [
  { file: "package.json", kind: "node" },
  { file: "package-lock.json", kind: "node" },
  { file: "pnpm-lock.yaml", kind: "node" },
  { file: "yarn.lock", kind: "node" },
  { file: ".nvmrc", kind: "node" },
  { file: ".node-version", kind: "node" },
  { file: "pyproject.toml", kind: "python" },
  { file: "Pipfile", kind: "python" },
  { file: ".python-version", kind: "python" },
];

const REQUIREMENT_FILE_PATTERN = /^requirements(?:[._-][A-Za-z0-9._-]+)?\.txt$/i;

export function isRequirementFile(file: string): boolean {
  const normalized = file.replaceAll("\\", "/");
  if (normalized.startsWith("requirements/")) {
    const nested = normalized.slice("requirements/".length);
    return !nested.includes("/") && /\.txt$/i.test(nested);
  }
  return !normalized.includes("/") && REQUIREMENT_FILE_PATTERN.test(normalized);
}

async function discoverRequirementFiles(root: string): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = await readdir(root, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && isRequirementFile(entry.name)) {
        files.push(entry.name);
      }
    }
  } catch {
    return files;
  }

  const requirementsRoot = path.join(root, "requirements");
  try {
    const info = await lstat(requirementsRoot);
    if (info.isDirectory() && !info.isSymbolicLink()) {
      const entries = await readdir(requirementsRoot, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.toLowerCase().endsWith(".txt")) {
          files.push(path.posix.join("requirements", entry.name));
        }
      }
    }
  } catch {
    return files.sort();
  }

  return files.sort();
}

export const SUPPORTED_MARKER_NAMES: readonly string[] = [
  ...SUPPORTED_MARKERS.map((marker) => marker.file),
  "requirements*.txt",
  "requirements/*.txt",
];

export async function resolveProjectRoot(input: string): Promise<string> {
  const candidate = path.resolve(input);
  let info;
  try {
    info = await stat(candidate);
  } catch {
    throw new ProjectPathError(`Project path does not exist: ${input}`);
  }

  if (!info.isDirectory()) {
    throw new ProjectPathError(`Project path is not a directory: ${input}`);
  }

  return realpath(candidate);
}

export async function discoverProject(input: string): Promise<ProjectDiscovery> {
  const root = await resolveProjectRoot(input);
  const [checks, requirementFiles] = await Promise.all([
    Promise.all(
      SUPPORTED_MARKERS.map(async (marker) => ({
        marker,
        exists: await projectFileExists(root, marker.file),
      })),
    ),
    discoverRequirementFiles(root),
  ]);

  const present = checks.filter((entry) => entry.exists).map((entry) => entry.marker);
  for (const file of requirementFiles) {
    present.push({ file, kind: "python" });
  }

  const kinds: ProjectKind[] = [];
  for (const kind of ["node", "python"] as const) {
    if (present.some((marker) => marker.kind === kind)) {
      kinds.push(kind);
    }
  }

  return {
    root,
    name: path.basename(root) || "project",
    kinds,
    markers: [...new Set(present.map((marker) => marker.file))],
  };
}
