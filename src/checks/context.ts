import type { ProjectDiscovery } from "../discovery/types";
import type { RuntimeInfo } from "../environment/runtime";
import { projectFileExists, readProjectFile } from "../security/safe-fs";
import type { CheckContext, CheckOptions, ResolvedCheckOptions } from "./types";

export function createCheckContext(
  project: ProjectDiscovery,
  runtime: RuntimeInfo,
  options: CheckOptions = {},
): CheckContext {
  const resolved: ResolvedCheckOptions = {
    checkEnv: options.checkEnv ?? false,
    envFile: options.envFile ?? null,
  };

  return {
    project,
    runtime,
    options: resolved,
    readFile: (relativePath, maxBytes) =>
      maxBytes === undefined
        ? readProjectFile(project.root, relativePath)
        : readProjectFile(project.root, relativePath, { maxBytes }),
    fileExists: (relativePath) => projectFileExists(project.root, relativePath),
  };
}
