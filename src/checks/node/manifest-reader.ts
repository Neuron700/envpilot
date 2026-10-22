import { z } from "zod";
import type { CheckContext } from "../types";

const manifestSchema = z.looseObject({
  name: z.string().optional(),
  engines: z.unknown().optional(),
  packageManager: z.unknown().optional(),
  dependencies: z.unknown().optional(),
  devDependencies: z.unknown().optional(),
  optionalDependencies: z.unknown().optional(),
  peerDependencies: z.unknown().optional(),
});

export interface ManifestReadResult {
  exists: boolean;
  raw: Record<string, unknown> | null;
  error: string | null;
}

export async function readPackageManifest(context: CheckContext): Promise<ManifestReadResult> {
  if (!(await context.fileExists("package.json"))) {
    return { exists: false, raw: null, error: null };
  }

  let text: string;
  try {
    text = await context.readFile("package.json");
  } catch (error) {
    return {
      exists: true,
      raw: null,
      error: error instanceof Error ? error.message : "package.json could not be read",
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    return {
      exists: true,
      raw: null,
      error: "package.json is not valid JSON",
    };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {
      exists: true,
      raw: null,
      error: "package.json must contain a JSON object",
    };
  }

  const validation = manifestSchema.safeParse(parsed);
  if (!validation.success) {
    const issue = validation.error.issues[0];
    const location = issue?.path.length ? issue.path.join(".") : "manifest";
    return {
      exists: true,
      raw: null,
      error: `package.json has an invalid shape at ${location}`,
    };
  }

  return {
    exists: true,
    raw: parsed as Record<string, unknown>,
    error: null,
  };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function dependencyFieldNames(
  manifest: Record<string, unknown>,
): Array<{ field: string; value: unknown }> {
  return [
    { field: "dependencies", value: manifest.dependencies },
    { field: "devDependencies", value: manifest.devDependencies },
    { field: "optionalDependencies", value: manifest.optionalDependencies },
    { field: "peerDependencies", value: manifest.peerDependencies },
  ];
}

export function manifestDependencyNames(manifest: Record<string, unknown>): string[] {
  const names = new Set<string>();
  for (const { value } of dependencyFieldNames(manifest)) {
    if (!isRecord(value)) continue;
    for (const name of Object.keys(value)) names.add(name);
  }
  return [...names].sort();
}
