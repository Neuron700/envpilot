import { parse as parseYaml } from "yaml";
import { createFinding } from "../../findings/create";
import { isRecord, manifestDependencyNames, readPackageManifest } from "./manifest-reader";
import { presentNodeLockfiles } from "./package-manager";
import type { CheckContext } from "../types";
import { RULE_BY_ID } from "../rules";

interface ParsedLockfile {
  names: Set<string>;
  limited: boolean;
}

function collectMapKeys(value: unknown, target: Set<string>): void {
  if (!isRecord(value)) return;
  for (const name of Object.keys(value)) target.add(name);
}

function parseNpmLockfile(text: string): ParsedLockfile {
  const parsed: unknown = JSON.parse(text);
  if (!isRecord(parsed)) throw new Error("Lockfile root is not an object");

  const names = new Set<string>();
  const packages = parsed.packages;
  if (isRecord(packages) && isRecord(packages[""])) {
    const root = packages[""];
    collectMapKeys(root.dependencies, names);
    collectMapKeys(root.devDependencies, names);
    collectMapKeys(root.optionalDependencies, names);
    collectMapKeys(root.peerDependencies, names);
  }

  if (names.size === 0) {
    collectMapKeys(parsed.dependencies, names);
  }

  return { names, limited: false };
}

function parsePnpmLockfile(text: string): ParsedLockfile {
  const parsed: unknown = parseYaml(text);
  if (!isRecord(parsed)) throw new Error("Lockfile root is not an object");

  const importers = parsed.importers;
  const root = isRecord(importers) && isRecord(importers["."]) ? importers["."] : parsed;
  if (!isRecord(root)) throw new Error("Lockfile has no root importer");

  const names = new Set<string>();
  collectMapKeys(root.dependencies, names);
  collectMapKeys(root.devDependencies, names);
  collectMapKeys(root.optionalDependencies, names);

  return { names, limited: true };
}

function parseYarnLockfile(text: string): ParsedLockfile {
  const names = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "" || line.trimStart().startsWith("#") || line.startsWith(" ")) {
      continue;
    }
    const match = line.match(/^"?((?:@[^/\s]+\/)?[^@\s]+)@/);
    if (match?.[1]) names.add(match[1]);
  }
  return { names, limited: true };
}

function parseLockfile(file: string, text: string): ParsedLockfile {
  if (file === "package-lock.json") return parseNpmLockfile(text);
  if (file === "pnpm-lock.yaml") return parsePnpmLockfile(text);
  return parseYarnLockfile(text);
}

export async function checkNodeLockfile(context: CheckContext) {
  const rule = RULE_BY_ID.get("node-lockfile")!;
  const lockfiles = await presentNodeLockfiles(context);

  if (lockfiles.length === 0) {
    return createFinding(rule, "warning", {
      message: "No Node.js dependency lockfile was found.",
      impact: "Dependency versions may differ between machines and CI runs.",
      recommendation: "Commit package-lock.json, pnpm-lock.yaml, or yarn.lock for the package manager in use.",
    });
  }

  if (lockfiles.length > 1) {
    return createFinding(rule, "warning", {
      message: "Multiple Node.js dependency lockfiles are present.",
      evidence: lockfiles,
      impact: "Different package managers may resolve different dependency graphs.",
      recommendation: "Keep only the lockfile that matches the project's package manager.",
    });
  }

  return createFinding(rule, "pass", {
    message: `A dependency lockfile is present: ${lockfiles[0]}.`,
    evidence: lockfiles,
    impact: "No missing or competing lockfile was found.",
    recommendation: "No action required.",
  });
}

export async function checkNodeLockfileConsistency(context: CheckContext) {
  const rule = RULE_BY_ID.get("node-lockfile-consistency")!;
  const manifest = await readPackageManifest(context);

  if (!manifest.exists || manifest.error || !manifest.raw) {
    return createFinding(rule, "skipped", {
      message: "Lockfile consistency could not be checked without a valid package.json.",
      impact: "Manifest and lockfile agreement is unknown.",
      recommendation: "Fix package.json first, then run EnvPilot again.",
    });
  }

  const lockfiles = await presentNodeLockfiles(context);
  if (lockfiles.length === 0) {
    return createFinding(rule, "skipped", {
      message: "Lockfile consistency could not be checked because no lockfile is present.",
      impact: "Manifest and lockfile agreement is unknown.",
      recommendation: "Generate and commit a lockfile for the chosen package manager.",
    });
  }

  const declaredManager =
    typeof manifest.raw.packageManager === "string"
      ? manifest.raw.packageManager.trim().split("@")[0]
      : null;
  const declaredLockfile =
    declaredManager === "npm"
      ? "package-lock.json"
      : declaredManager === "pnpm"
        ? "pnpm-lock.yaml"
        : declaredManager === "yarn"
          ? "yarn.lock"
          : null;

  const selected =
    (declaredLockfile && lockfiles.includes(declaredLockfile) ? declaredLockfile : null) ??
    lockfiles.find((file) => file === "package-lock.json") ??
    lockfiles.find((file) => file === "pnpm-lock.yaml") ??
    lockfiles[0]!;

  let parsed: ParsedLockfile;
  try {
    parsed = parseLockfile(selected, await context.readFile(selected));
  } catch {
    return createFinding(rule, "warning", {
      message: `The ${selected} lockfile could not be parsed for consistency checks.`,
      evidence: [`lockfile: ${selected}`],
      impact: "EnvPilot cannot confirm that manifest dependencies are represented in the lockfile.",
      recommendation: "Regenerate the lockfile with the matching package manager, then scan again.",
    });
  }

  const required = manifestDependencyNames(manifest.raw);
  const missing = required.filter((name) => !parsed.names.has(name));

  if (missing.length > 0) {
    return createFinding(rule, "warning", {
      message: `${missing.length} manifest dependenc${missing.length === 1 ? "y is" : "ies are"} missing from ${selected}.`,
      evidence: missing.slice(0, 20).map((name) => `missing: ${name}`),
      impact: "Installs may fail or silently resolve a different dependency graph.",
      recommendation: `Regenerate ${selected} from the current package.json using the matching package manager.`,
    });
  }

  return createFinding(rule, "pass", {
    message: parsed.limited
      ? `Manifest dependency names are present in ${selected}. ${selected} verification is name-based only.`
      : `All manifest dependency names are represented in ${selected}.`,
    evidence: [`lockfile: ${selected}`, `manifest dependencies checked: ${required.length}`],
    impact: "No obvious manifest/lockfile name mismatch was found.",
    recommendation: parsed.limited
      ? "Run the package manager's own frozen-install check in CI for deeper lockfile verification."
      : "No action required.",
  });
}
