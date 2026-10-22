import { createCheckContext } from "./checks/context";
import { rulesForProject } from "./checks/rules";
import { runChecks } from "./checks/run";
import type { CheckOptions } from "./checks/types";
import { discoverProject, SUPPORTED_MARKER_NAMES } from "./discovery/discover";
import { inspectRuntime, type RuntimeInfo } from "./environment/runtime";
import type {
  Finding,
  FindingSummary,
  Report,
} from "./findings/types";
import { calculateScore, RUNTIME_REQUIREMENT_RULE_IDS } from "./scoring/score";
import { TOOL_VERSION } from "./version";

export class UnsupportedProjectError extends Error {
  constructor() {
    super(
      `No supported project markers were found. Supported markers: ${SUPPORTED_MARKER_NAMES.join(", ")}`,
    );
    this.name = "UnsupportedProjectError";
  }
}

export interface ScanOptions extends CheckOptions {
  runtime?: RuntimeInfo;
  now?: Date;
}

function summarize(findings: readonly Finding[]): FindingSummary {
  return {
    pass: findings.filter((finding) => finding.status === "pass").length,
    warning: findings.filter((finding) => finding.status === "warning").length,
    fail: findings.filter((finding) => finding.status === "fail").length,
    skipped: findings.filter((finding) => finding.status === "skipped").length,
    total: findings.length,
  };
}

function defaultCheckOptions(options: ScanOptions): CheckOptions {
  return {
    checkEnv: options.checkEnv ?? false,
    ...(options.envFile === undefined ? {} : { envFile: options.envFile }),
  };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

export async function scanProject(
  target: string,
  options: ScanOptions = {},
): Promise<Report> {
  const project = await discoverProject(target);
  if (project.kinds.length === 0) {
    throw new UnsupportedProjectError();
  }

  const runtime = options.runtime ?? (await inspectRuntime(project.kinds.includes("python")));
  const context = createCheckContext(project, runtime, defaultCheckOptions(options));
  const findings = await runChecks(context);
  const relevantRules = rulesForProject(project.kinds);
  const score = calculateScore(findings, relevantRules);
  const limitations: string[] = [];

  if (score) {
    limitations.push(...score.limitations);
  } else {
    const applicable = findings.filter((finding) => finding.status !== "skipped");
    if (applicable.length < 2) {
      limitations.push(
        "Readiness score withheld: fewer than two checks had enough reliable data.",
      );
    }
    if (!applicable.some((finding) => RUNTIME_REQUIREMENT_RULE_IDS.includes(finding.id))) {
      limitations.push(
        "Readiness score withheld: no runtime version requirement could be evaluated.",
      );
    }

    const relevantWeight = relevantRules.reduce((sum, rule) => sum + rule.weight, 0);
    const applicableWeight = applicable.reduce((sum, finding) => {
      const rule = relevantRules.find((entry) => entry.id === finding.id);
      return sum + (rule?.weight ?? 0);
    }, 0);
    if (relevantWeight > 0 && applicableWeight / relevantWeight < 0.5) {
      limitations.push(
        `Readiness score withheld: less than half of relevant checks had reliable data (${Math.round((applicableWeight / relevantWeight) * 100)}% coverage).`,
      );
    }
  }

  const envTemplate = findings.find((finding) => finding.id === "env-template");
  if (!context.options.checkEnv && envTemplate?.status !== "skipped") {
    limitations.push(
      "Local .env key comparison was skipped. Use --check-env to compare key names only.",
    );
  }

  if (project.kinds.includes("node")) {
    const engines = findings.find((finding) => finding.id === "node-runtime-engines");
    if (engines?.status === "skipped") {
      limitations.push("Node.js runtime compatibility was not evaluated because no engines.node range was available.");
    }
    limitations.push(
      "Package manager executables were not invoked; package manager checks use declarations and lockfile evidence only.",
    );
  }

  if (project.kinds.includes("python")) {
    const pythonVersion = findings.find((finding) => finding.id === "python-runtime-version");
    if (pythonVersion?.status === "skipped") {
      limitations.push("Python version compatibility was not evaluated because no supported requirement was available.");
    }
  }

  const nodeLock = findings.find((finding) => finding.id === "node-lockfile-consistency");
  if (nodeLock?.status === "skipped" && nodeLock.message.includes("no lockfile")) {
    limitations.push("Node.js lockfile consistency was not evaluated because no lockfile was present.");
  }

  return {
    schemaVersion: "1.0",
    generatedAt: (options.now ?? new Date()).toISOString(),
    toolVersion: TOOL_VERSION,
    project: {
      name: project.name,
      kinds: project.kinds,
      markers: project.markers,
    },
    environment: {
      node: runtime.nodeVersion,
      platform: runtime.platform,
      arch: runtime.arch,
      python: runtime.python
        ? {
            executable: runtime.python.executable,
            version: runtime.python.version,
          }
        : null,
      pythonChecked: project.kinds.includes("python"),
    },
    findings,
    summary: summarize(findings),
    score,
    limitations: unique(limitations),
  };
}
