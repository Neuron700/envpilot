import type { ProjectKind } from "../discovery/types";
import type { RuleDefinition } from "../findings/types";

export const RULES: readonly RuleDefinition[] = [
  {
    id: "node-manifest",
    title: "Node.js package manifest",
    category: "dependencies",
    description: "Verifies that package.json exists, parses as JSON, and has a usable shape.",
    severity: "high",
    weight: 10,
    appliesTo: ["node"],
  },
  {
    id: "node-runtime-engines",
    title: "Node.js runtime requirement",
    category: "runtime",
    description: "Compares the active Node.js version with the declared engines.node range.",
    severity: "high",
    weight: 25,
    appliesTo: ["node"],
  },
  {
    id: "node-package-manager",
    title: "Node.js package manager",
    category: "runtime",
    description:
      "Checks the packageManager declaration against lockfile evidence without executing package managers.",
    severity: "medium",
    weight: 15,
    appliesTo: ["node"],
  },
  {
    id: "node-lockfile",
    title: "Node.js lockfile presence",
    category: "dependencies",
    description: "Checks that a dependency lockfile exists and that only one manager owns the project.",
    severity: "medium",
    weight: 15,
    appliesTo: ["node"],
  },
  {
    id: "node-lockfile-consistency",
    title: "Node.js lockfile consistency",
    category: "dependencies",
    description: "Checks that manifest dependency names are represented in the available lockfile.",
    severity: "medium",
    weight: 15,
    appliesTo: ["node"],
  },
  {
    id: "node-dependency-metadata",
    title: "Node.js dependency metadata",
    category: "dependencies",
    description: "Validates dependency entries in package.json without resolving or installing them.",
    severity: "medium",
    weight: 10,
    appliesTo: ["node"],
  },
  {
    id: "python-interpreter",
    title: "Python interpreter availability",
    category: "runtime",
    description: "Probes a short allowlist of Python executables and reports the available version.",
    severity: "high",
    weight: 15,
    appliesTo: ["python"],
  },
  {
    id: "python-runtime-version",
    title: "Python runtime requirement",
    category: "runtime",
    description: "Compares the detected interpreter with .python-version, Pipfile, and requires-python.",
    severity: "high",
    weight: 25,
    appliesTo: ["python"],
  },
  {
    id: "python-dependency-sources",
    title: "Python dependency sources",
    category: "dependencies",
    description: "Identifies dependency declaration files and warns when more than one source competes.",
    severity: "medium",
    weight: 10,
    appliesTo: ["python"],
  },
  {
    id: "python-dependency-parse",
    title: "Python dependency syntax",
    category: "dependencies",
    description: "Parses pyproject.toml, requirements*.txt, and Pipfile without installing anything.",
    severity: "medium",
    weight: 10,
    appliesTo: ["python"],
  },
  {
    id: "env-template",
    title: "Environment template",
    category: "environment",
    description: "Checks for .env.example or a related template and verifies that it is readable.",
    severity: "low",
    weight: 5,
    appliesTo: ["any"],
  },
  {
    id: "env-required-keys",
    title: "Required environment keys",
    category: "environment",
    description: "Reads key names from environment templates without reading or displaying values.",
    severity: "medium",
    weight: 15,
    appliesTo: ["any"],
  },
  {
    id: "env-local-keys",
    title: "Local environment keys",
    category: "environment",
    description:
      "When requested, compares required key names with a local env file and never prints values.",
    severity: "high",
    weight: 15,
    appliesTo: ["any"],
  },
];

export const RULE_BY_ID = new Map(RULES.map((rule) => [rule.id, rule]));

export function rulesForProject(kinds: readonly ProjectKind[]): RuleDefinition[] {
  return RULES.filter(
    (rule) =>
      rule.appliesTo.includes("any") ||
      kinds.some((kind) => rule.appliesTo.includes(kind)),
  );
}
