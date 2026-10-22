import { createFinding } from "../findings/create";
import type { Finding } from "../findings/types";
import { checkEnvLocalKeys, checkEnvRequiredKeys, checkEnvTemplate } from "./env";
import {
  checkNodeDependencyMetadata,
  checkNodeManifest,
  checkNodeRuntime,
} from "./node/manifest";
import {
  checkNodeLockfile,
  checkNodeLockfileConsistency,
} from "./node/lockfile";
import { checkNodePackageManager } from "./node/package-manager";
import { checkPythonDependencyParse, checkPythonDependencySources } from "./python/dependencies";
import {
  checkPythonInterpreter,
  checkPythonRuntimeVersion,
} from "./python/runtime";
import { rulesForProject } from "./rules";
import type { Check, CheckContext } from "./types";

const CHECKS: readonly Check[] = [
  { id: "node-manifest", run: checkNodeManifest },
  { id: "node-runtime-engines", run: checkNodeRuntime },
  { id: "node-package-manager", run: checkNodePackageManager },
  { id: "node-lockfile", run: checkNodeLockfile },
  { id: "node-lockfile-consistency", run: checkNodeLockfileConsistency },
  { id: "node-dependency-metadata", run: checkNodeDependencyMetadata },
  { id: "python-interpreter", run: checkPythonInterpreter },
  { id: "python-runtime-version", run: checkPythonRuntimeVersion },
  { id: "python-dependency-sources", run: checkPythonDependencySources },
  { id: "python-dependency-parse", run: checkPythonDependencyParse },
  { id: "env-template", run: checkEnvTemplate },
  { id: "env-required-keys", run: checkEnvRequiredKeys },
  { id: "env-local-keys", run: checkEnvLocalKeys },
];

export async function runChecks(
  context: CheckContext,
  checks: readonly Check[] = CHECKS,
): Promise<Finding[]> {
  const rules = rulesForProject(context.project.kinds);
  const findings: Finding[] = [];
  const checkById = new Map(checks.map((check) => [check.id, check]));

  for (const rule of rules) {
    const check = checkById.get(rule.id);
    if (!check) continue;

    try {
      findings.push(await check.run(context));
    } catch {
      findings.push(
        createFinding(rule, "skipped", {
          message: "This check could not finish, so its result is unknown.",
          impact: "The result is incomplete for this rule and is excluded from scoring data.",
          recommendation: "Please report this issue with the project structure and EnvPilot version.",
        }),
      );
    }
  }

  return findings;
}
