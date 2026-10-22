import { createFinding } from "../../findings/create";
import { activeRequirementLines, isRecord, readPythonFiles, recordAt } from "./files";
import type { CheckContext } from "../types";
import { RULE_BY_ID } from "../rules";

function hasEntries(value: unknown): boolean {
  return isRecord(value) && Object.keys(value).length > 0;
}

function pyprojectDeclaresDependencies(document: Record<string, unknown> | null): boolean {
  if (!document) return false;

  const project = recordAt(document, "project");
  const dependencies = project?.dependencies;
  if (Array.isArray(dependencies) && dependencies.length > 0) return true;

  const optional = project?.["optional-dependencies"];
  if (isRecord(optional) && Object.values(optional).some((value) => Array.isArray(value) && value.length > 0)) {
    return true;
  }

  const poetry = recordAt(document, "tool", "poetry", "dependencies");
  if (poetry) {
    return Object.keys(poetry).some((name) => name.toLowerCase() !== "python");
  }

  return false;
}

function pipfileDeclaresDependencies(document: Record<string, unknown> | null): boolean {
  if (!document) return false;
  return (
    hasEntries(recordAt(document, "packages")) ||
    hasEntries(recordAt(document, "dev-packages"))
  );
}

async function declarationSources(context: CheckContext): Promise<string[]> {
  const files = await readPythonFiles(context);
  const sources: string[] = [];

  if (pyprojectDeclaresDependencies(files.pyproject.document)) {
    sources.push("pyproject.toml");
  }
  for (const requirement of files.requirements) {
    if (
      requirement.text !== null &&
      activeRequirementLines(requirement.text).length > 0
    ) {
      sources.push(requirement.file);
    }
  }
  if (pipfileDeclaresDependencies(files.pipfile.document)) {
    sources.push("Pipfile");
  }

  return sources;
}

export async function checkPythonDependencySources(context: CheckContext) {
  const rule = RULE_BY_ID.get("python-dependency-sources")!;
  const sources = await declarationSources(context);

  if (sources.length === 0) {
    return createFinding(rule, "warning", {
      message: "No Python dependency declarations were found.",
      impact: "The project does not state which packages it needs, so dependencies cannot be checked.",
      recommendation:
        "Declare dependencies in pyproject.toml, requirements*.txt, or Pipfile and commit that file.",
    });
  }

  if (sources.length > 1) {
    return createFinding(rule, "warning", {
      message: "Multiple Python dependency declaration files are active.",
      evidence: sources,
      impact: "There is no clear source of truth for dependencies, and tools may install different sets.",
      recommendation:
        "Choose one dependency source or document which file is authoritative and which files are generated.",
    });
  }

  return createFinding(rule, "pass", {
    message: `A single dependency source is active: ${sources[0]}.`,
    evidence: sources,
    impact: "No competing Python dependency declarations were found.",
    recommendation: "No action required.",
  });
}

const requirementPattern =
  /^(?:[A-Za-z0-9][A-Za-z0-9._-]*)(?:\[[^\]]+\])?(?:\s*(?:===|==|~=|!=|<=|>=|<|>)\s*[A-Za-z0-9.*+!_-]+(?:\s*,\s*(?:===|==|~=|!=|<=|>=|<|>)\s*[A-Za-z0-9.*+!_-]+)*)?(?:\s*;.*)?$/;
const directReferencePattern = /^[A-Za-z0-9][A-Za-z0-9._-]*(?:\[[^\]]+\])?\s*@\s*\S+/;
const urlPattern = /^(?:git\+|https?:\/\/|file:|\.{1,2}\/|\/)/i;

function normalizeRequirementLine(value: string): string {
  return value
    .replace(/\s+#.*$/, "")
    .replace(/\s+--[A-Za-z0-9][A-Za-z0-9_-]*(?:\s*=\s*\S+|\s+\S+)?/g, "")
    .trim();
}

function requirementLineIsValid(value: string): boolean {
  const normalized = normalizeRequirementLine(value);
  return (
    normalized !== "" &&
    (requirementPattern.test(normalized) ||
      directReferencePattern.test(normalized) ||
      urlPattern.test(normalized))
  );
}

export async function checkPythonDependencyParse(context: CheckContext) {
  const rule = RULE_BY_ID.get("python-dependency-parse")!;
  const files = await readPythonFiles(context);
  const issues: string[] = [];
  let filesChecked = 0;

  if (files.pyproject.exists) {
    filesChecked += 1;
    if (files.pyproject.error) {
      issues.push(`pyproject.toml: ${files.pyproject.error}`);
    }
  }

  if (files.pipfile.exists) {
    filesChecked += 1;
    if (files.pipfile.error) {
      issues.push(`Pipfile: ${files.pipfile.error}`);
    }
  }

  for (const requirement of files.requirements) {
    filesChecked += 1;
    if (requirement.text === null) {
      issues.push(`${requirement.file}: ${requirement.error ?? "could not be read"}`);
    } else {
      for (const line of activeRequirementLines(requirement.text)) {
        if (!requirementLineIsValid(line.value)) {
          issues.push(`${requirement.file} line ${line.line} has unsupported syntax`);
        }
      }
    }
  }

  if (filesChecked === 0) {
    return createFinding(rule, "skipped", {
      message: "No Python dependency files are available to parse.",
      impact: "Dependency syntax was not evaluated.",
      recommendation: "Add a supported dependency declaration file, then scan again.",
    });
  }

  if (issues.length > 0) {
    return createFinding(rule, "warning", {
      message: "One or more Python dependency files could not be parsed cleanly.",
      evidence: issues.slice(0, 20),
      impact: "EnvPilot cannot fully understand the dependency declarations.",
      recommendation: "Fix the reported files or use standard PEP 508 requirement syntax.",
    });
  }

  return createFinding(rule, "pass", {
    message: `Parsed ${filesChecked} Python dependency file${filesChecked === 1 ? "" : "s"} without syntax errors.`,
    impact: "No supported dependency syntax problem was found.",
    recommendation: "No action required.",
  });
}
