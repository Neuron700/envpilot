import { createFinding } from "../../findings/create";
import { readPackageManifest } from "./manifest-reader";
import type { CheckContext } from "../types";
import { RULE_BY_ID } from "../rules";

export const NODE_LOCKFILES = ["package-lock.json", "pnpm-lock.yaml", "yarn.lock"] as const;

const expectedLockfile: Record<string, string> = {
  npm: "package-lock.json",
  pnpm: "pnpm-lock.yaml",
  yarn: "yarn.lock",
};

function parsePackageManager(value: string): { name: string; version: string | null } {
  const separator = value.indexOf("@", 1);
  if (separator === -1) {
    return { name: value, version: null };
  }
  return {
    name: value.slice(0, separator),
    version: value.slice(separator + 1).split("+")[0] ?? null,
  };
}

export async function presentNodeLockfiles(context: CheckContext): Promise<string[]> {
  const checks = await Promise.all(
    NODE_LOCKFILES.map(async (file) => ({
      file,
      exists: await context.fileExists(file),
    })),
  );
  return checks.filter((entry) => entry.exists).map((entry) => entry.file);
}

export async function checkNodePackageManager(context: CheckContext) {
  const rule = RULE_BY_ID.get("node-package-manager")!;
  const manifest = await readPackageManifest(context);

  if (!manifest.exists || manifest.error || !manifest.raw) {
    return createFinding(rule, "skipped", {
      message: "The package manager declaration could not be read.",
      impact: "Package manager consistency was not evaluated.",
      recommendation: "Fix package.json first, then run EnvPilot again.",
    });
  }

  const lockfiles = await presentNodeLockfiles(context);
  const declared = manifest.raw.packageManager;

  if (declared !== undefined && typeof declared !== "string") {
    return createFinding(rule, "warning", {
      message: "packageManager is present but is not a string.",
      evidence: ["package.json: packageManager"],
      impact: "Tools cannot determine which package manager the project expects.",
      recommendation: "Set packageManager to a value such as \"npm@10.9.0\".",
    });
  }

  if (typeof declared === "string" && declared.trim() !== "") {
    const parsed = parsePackageManager(declared.trim());
    const expected = expectedLockfile[parsed.name];

    if (!expected) {
      return createFinding(rule, "warning", {
        message: `The declared package manager "${parsed.name}" is not covered by EnvPilot lockfile checks.`,
        evidence: [`packageManager: ${declared}`, `lockfiles: ${lockfiles.join(", ") || "none"}`],
        impact: "Package manager consistency cannot be verified for this tool.",
        recommendation: "Confirm the package manager manually, or use npm, pnpm, or yarn for a supported check.",
      });
    }

    if (lockfiles.length > 1) {
      return createFinding(rule, "warning", {
        message: `packageManager declares ${parsed.name}, but the project contains multiple lockfiles.`,
        evidence: [`packageManager: ${declared}`, `lockfiles: ${lockfiles.join(", ")}`],
        impact: "Different tools may install different dependency graphs.",
        recommendation: `Regenerate dependencies with ${parsed.name} so ${expected} is the only lockfile, then remove the other lockfiles from source control.`,
      });
    }

    if (!lockfiles.includes(expected)) {
      return createFinding(rule, "warning", {
        message: `packageManager declares ${parsed.name}, but ${expected} is not present.`,
        evidence: [`packageManager: ${declared}`, `lockfiles: ${lockfiles.join(", ") || "none"}`],
        impact: "The declared package manager and the available lockfile evidence disagree.",
        recommendation: `Generate ${expected} with ${parsed.name}, or correct packageManager to match the lockfile actually in use.`,
      });
    }

    return createFinding(rule, "pass", {
      message: `The packageManager declaration is consistent with ${expected}. The package manager executable was not invoked.`,
      evidence: [
        `packageManager: ${declared}`,
        `declared version: ${parsed.version ?? "not specified"}`,
        `lockfile: ${expected}`,
      ],
      impact: "No lockfile-level package manager mismatch was found.",
      recommendation: "No action required.",
    });
  }

  if (lockfiles.length === 0) {
    return createFinding(rule, "skipped", {
      message: "No packageManager declaration or lockfile is available.",
      impact: "Package manager consistency was not evaluated.",
      recommendation: "Declare packageManager in package.json and commit the matching lockfile.",
    });
  }

  if (lockfiles.length > 1) {
    return createFinding(rule, "warning", {
      message: "Multiple Node.js lockfiles are present without a packageManager declaration.",
      evidence: [`lockfiles: ${lockfiles.join(", ")}`],
      impact: "Different package managers may produce different installs.",
      recommendation: "Choose one package manager, keep its lockfile, and remove the others.",
    });
  }

  return createFinding(rule, "pass", {
    message: `No packageManager was declared; the single lockfile ${lockfiles[0]} is the only manager evidence.`,
    evidence: [`lockfile: ${lockfiles[0]}`],
    impact: "The lockfile is unambiguous, but the intended package manager is still implicit.",
    recommendation: "Add a packageManager field so other developers and CI use the same tool.",
  });
}
