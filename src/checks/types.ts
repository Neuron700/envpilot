import type { ProjectDiscovery } from "../discovery/types";
import type { RuntimeInfo } from "../environment/runtime";
import type { Finding } from "../findings/types";

export interface CheckOptions {
  checkEnv?: boolean;
  envFile?: string;
}

export interface ResolvedCheckOptions {
  checkEnv: boolean;
  envFile: string | null;
}

export interface CheckContext {
  project: ProjectDiscovery;
  runtime: RuntimeInfo;
  options: ResolvedCheckOptions;
  readFile(relativePath: string, maxBytes?: number): Promise<string>;
  fileExists(relativePath: string): Promise<boolean>;
}

export interface Check {
  id: string;
  run(context: CheckContext): Promise<Finding>;
}
