import semver from "semver";
import { createFinding } from "../../findings/create";
import { dependencyFieldNames, isRecord, readPackageManifest } from "./manifest-reader";
import type { CheckContext } from "../types";
import { RULE_BY_ID } from "../rules";

export async function checkNodeManifest(context: CheckContext) {
  const rule = RULE_BY_ID.get("node-manifest")!;
  const manifest = await readPackageManifest(context);

  if (!manifest.exists) {
    return createFinding(rule, "fail", {
      message: "package.json is missing from this Node.js project.",
      impact: "Dependency installation and scripts cannot be resolved reliably without a manifest.",
      recommendation: "Create a package.json or confirm that this directory is the project root.",
    });
  }

  if (manifest.error) {
    return createFinding(rule, "fail", {
      message: manifest.error,
      evidence: ["package.json"],
      impact: "Tooling cannot read the project manifest, so all Node.js checks are limited.",
      recommendation: "Fix the JSON syntax and required manifest fields, then scan again.",
    });
  }

  return createFinding(rule, "pass", {
    message: "package.json exists and is valid JSON.",
    evidence: ["package.json"],
    impact: "No manifest parsing problem was found.",
    recommendation: "No action required.",
  });
}

export async function checkNodeRuntime(context: CheckContext) {
  const rule = RULE_BY_ID.get("node-runtime-engines")!;
  const manifest = await readPackageManifest(context);

  if (!manifest.exists || manifest.error || !manifest.raw) {
    return createFinding(rule, "skipped", {
      message: "Node.js engine requirements could not be read because package.json is unavailable or invalid.",
      impact: "Runtime compatibility was not evaluated.",
      recommendation: "Fix package.json first, then run EnvPilot again.",
    });
  }

  const engines = manifest.raw.engines;
  if (engines === undefined) {
    return createFinding(rule, "skipped", {
      message: "No engines.node requirement is declared.",
      impact: "EnvPilot cannot judge whether the active Node.js version is expected by this project.",
      recommendation: "Add an engines.node range to package.json if the project has a runtime requirement.",
    });
  }

  if (!isRecord(engines) || typeof engines.node !== "string" || engines.node.trim() === "") {
    return createFinding(rule, "warning", {
      message: "engines.node is present but cannot be evaluated as a version range.",
      evidence: ["package.json: engines.node must be a non-empty string"],
      impact: "The runtime requirement is not machine-readable, so compatibility is unknown.",
      recommendation: "Use a valid semver range such as \">=20\" in engines.node.",
    });
  }

  const requirement = engines.node.trim();
  if (!semver.validRange(requirement, { loose: true })) {
    return createFinding(rule, "warning", {
      message: `The engines.node range "${requirement}" is invalid, so compatibility cannot be evaluated reliably.`,
      evidence: [`engines.node: ${requirement}`, `active Node.js: ${context.runtime.nodeVersion}`],
      impact: "EnvPilot will not claim compatibility from an unparseable requirement.",
      recommendation: "Replace engines.node with a valid semver range, then scan again.",
    });
  }

  const compatible = semver.satisfies(context.runtime.nodeVersion, requirement, {
    includePrerelease: true,
    loose: true,
  });

  if (compatible) {
    return createFinding(rule, "pass", {
      message: "The active Node.js version satisfies engines.node.",
      evidence: [`engines.node: ${requirement}`, `active Node.js: ${context.runtime.nodeVersion}`],
      impact: "No Node.js runtime mismatch was found.",
      recommendation: "No action required.",
    });
  }

  return createFinding(rule, "fail", {
    message: `The active Node.js version ${context.runtime.nodeVersion} does not satisfy engines.node ${requirement}.`,
    evidence: [`engines.node: ${requirement}`, `active Node.js: ${context.runtime.nodeVersion}`],
    impact: "Install or build steps may fail or behave differently on this machine.",
    recommendation: `Switch to a Node.js version satisfying ${requirement}, or update engines.node if the project requirement changed.`,
  });
}

export async function checkNodeDependencyMetadata(context: CheckContext) {
  const rule = RULE_BY_ID.get("node-dependency-metadata")!;
  const manifest = await readPackageManifest(context);

  if (!manifest.exists || manifest.error || !manifest.raw) {
    return createFinding(rule, "skipped", {
      message: "Dependency metadata could not be checked because package.json is unavailable or invalid.",
      impact: "Malformed dependency entries may go unnoticed.",
      recommendation: "Fix package.json first, then run EnvPilot again.",
    });
  }

  const invalid: string[] = [];
  let declaredCount = 0;

  for (const { field, value } of dependencyFieldNames(manifest.raw)) {
    if (value === undefined) continue;
    if (!isRecord(value)) {
      invalid.push(`${field} is not an object`);
      continue;
    }

    for (const [name, version] of Object.entries(value)) {
      declaredCount += 1;
      if (typeof version !== "string" || version.trim() === "") {
        invalid.push(`${field}.${name}`);
      }
    }
  }

  if (invalid.length > 0) {
    return createFinding(rule, "warning", {
      message: `${invalid.length} dependency entr${invalid.length === 1 ? "y has" : "ies have"} unusable metadata.`,
      evidence: invalid.slice(0, 20),
      impact: "Installers may fail or resolve unexpected versions for these dependencies.",
      recommendation: "Use non-empty version strings for every declared dependency entry.",
    });
  }

  if (declaredCount === 0) {
    return createFinding(rule, "pass", {
      message: "No dependencies are declared in package.json.",
      impact: "There are no dependency metadata entries to validate.",
      recommendation: "No action required.",
    });
  }

  return createFinding(rule, "pass", {
    message: `${declaredCount} dependency metadata entr${declaredCount === 1 ? "y is" : "ies are"} valid.`,
    impact: "No malformed dependency metadata was found.",
    recommendation: "No action required.",
  });
}
