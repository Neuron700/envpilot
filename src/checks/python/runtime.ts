import { satisfies, validRange } from "@renovatebot/pep440";
import { createFinding } from "../../findings/create";
import { readPythonFiles, recordAt } from "./files";
import type { CheckContext } from "../types";
import { RULE_BY_ID } from "../rules";

interface VersionRequirement {
  source: string;
  value: string;
  kind: "exact" | "range";
}

interface Evaluation {
  requirement: VersionRequirement;
  outcome: "pass" | "fail" | "unsupported";
  detail?: string;
}

function exactMatches(required: string, active: string): boolean | null {
  const cleaned = required.trim().replace(/^v/i, "");
  if (!/^\d+(?:\.\d+){0,2}$/.test(cleaned)) return null;

  const requiredParts = cleaned.split(".").map(Number);
  const activeParts = active.split(".").map((part) => Number.parseInt(part, 10));
  if (activeParts.some((part) => Number.isNaN(part))) return null;

  return requiredParts.every((part, index) => activeParts[index] === part);
}

function collectRequirements(
  files: Awaited<ReturnType<typeof readPythonFiles>>,
): VersionRequirement[] {
  const requirements: VersionRequirement[] = [];

  if (files.pythonVersion.value) {
    requirements.push({
      source: ".python-version",
      value: files.pythonVersion.value,
      kind: "exact",
    });
  }

  const project = files.pyproject.document ? recordAt(files.pyproject.document, "project") : null;
  const requiresPython = project?.["requires-python"];
  if (typeof requiresPython === "string" && requiresPython.trim() !== "") {
    requirements.push({
      source: "pyproject.toml project.requires-python",
      value: requiresPython.trim(),
      kind: "range",
    });
  }

  const pipfileRequires = files.pipfile.document
    ? recordAt(files.pipfile.document, "requires")
    : null;
  const pipfileVersion = pipfileRequires?.python_version;
  if (typeof pipfileVersion === "string" && pipfileVersion.trim() !== "") {
    requirements.push({
      source: "Pipfile requires.python_version",
      value: pipfileVersion.trim(),
      kind: "exact",
    });
  }

  return requirements;
}

function evaluate(requirement: VersionRequirement, active: string): Evaluation {
  if (requirement.kind === "exact") {
    const matched = exactMatches(requirement.value, active);
    if (matched === null) {
      return {
        requirement,
        outcome: "unsupported",
        detail: `${requirement.source} uses an unsupported version format`,
      };
    }
    return { requirement, outcome: matched ? "pass" : "fail" };
  }

  try {
    if (!validRange(requirement.value)) {
      return {
        requirement,
        outcome: "unsupported",
        detail: `${requirement.source} is not a supported PEP 440 range`,
      };
    }
    const matched = satisfies(active, requirement.value, { prereleases: true });
    return { requirement, outcome: matched ? "pass" : "fail" };
  } catch {
    return {
      requirement,
      outcome: "unsupported",
      detail: `${requirement.source} could not be evaluated reliably`,
    };
  }
}

export async function checkPythonInterpreter(context: CheckContext) {
  const rule = RULE_BY_ID.get("python-interpreter")!;
  const python = context.runtime.python;

  if (!python) {
    return createFinding(rule, "fail", {
      message: "No Python executable from the safe allowlist could be found.",
      evidence: context.runtime.pythonError ? [context.runtime.pythonError] : [],
      impact: "Python commands, virtual environments, and installs may not work on this machine.",
      recommendation:
        "Install Python or activate the project virtual environment, then run EnvPilot again.",
    });
  }

  return createFinding(rule, "pass", {
    message: `Python ${python.version} is available via ${python.executable}.`,
    evidence: [`executable: ${python.executable}`, `version: ${python.version}`],
    impact: "No missing Python executable was found.",
    recommendation: "No action required.",
  });
}

export async function checkPythonRuntimeVersion(context: CheckContext) {
  const rule = RULE_BY_ID.get("python-runtime-version")!;
  const files = await readPythonFiles(context);
  const requirements = collectRequirements(files);

  if (requirements.length === 0) {
    return createFinding(rule, "skipped", {
      message: "No supported Python version requirement was declared.",
      impact: "EnvPilot cannot compare the interpreter with an expected Python version.",
      recommendation:
        "Add .python-version, project.requires-python, or Pipfile requires.python_version.",
    });
  }

  const active = context.runtime.python;
  if (!active) {
    return createFinding(rule, "skipped", {
      message: "A Python version requirement exists, but no interpreter is available to compare.",
      evidence: requirements.map((requirement) => `${requirement.source}: ${requirement.value}`),
      impact: "Python version compatibility was not evaluated.",
      recommendation:
        "Install Python or activate the project virtual environment, then run EnvPilot again.",
    });
  }

  const evaluations = requirements.map((requirement) => evaluate(requirement, active.version));
  const failures = evaluations.filter((evaluation) => evaluation.outcome === "fail");
  const unsupported = evaluations.filter((evaluation) => evaluation.outcome === "unsupported");
  const evidence = [
    `active Python: ${active.version}`,
    ...requirements.map(
      (requirement) => `${requirement.source}: ${requirement.value}`,
    ),
  ];

  if (failures.length > 0) {
    return createFinding(rule, "fail", {
      message: `The active Python ${active.version} does not satisfy ${failures.length} of ${requirements.length} declared requirement${requirements.length === 1 ? "" : "s"}.`,
      evidence,
      impact: "Installs or runtime behavior may differ from what the project expects.",
      recommendation:
        "Switch to a matching Python version or update the declared requirement if it is stale.",
    });
  }

  if (unsupported.length > 0) {
    return createFinding(rule, "warning", {
      message: "At least one Python version requirement cannot be evaluated reliably.",
      evidence: [
        ...evidence,
        ...unsupported.map((evaluation) => evaluation.detail ?? "unsupported requirement"),
      ],
      impact: "EnvPilot will not claim Python version compatibility for this requirement.",
      recommendation:
        "Use a plain version such as 3.12 or a supported PEP 440 range such as >=3.11,<4.",
    });
  }

  return createFinding(rule, "pass", {
    message: `The active Python ${active.version} satisfies all parsed requirements.`,
    evidence,
    impact: "No Python version mismatch was found.",
    recommendation: "No action required.",
  });
}
