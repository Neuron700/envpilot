import { parse as parseToml } from "smol-toml";
import { isRequirementFile } from "../../discovery/discover";
import type { CheckContext } from "../types";

export interface ParsedPythonFile {
  exists: boolean;
  text: string | null;
  document: Record<string, unknown> | null;
  error: string | null;
}

export interface RequirementFile extends ParsedPythonFile {
  file: string;
}

export interface PythonProjectFiles {
  pyproject: ParsedPythonFile;
  pipfile: ParsedPythonFile;
  requirements: RequirementFile[];
  pythonVersion: {
    exists: boolean;
    value: string | null;
    error: string | null;
  };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function recordAt(
  value: unknown,
  ...path: string[]
): Record<string, unknown> | null {
  let current = value;
  for (const key of path) {
    if (!isRecord(current)) return null;
    current = current[key];
  }
  return isRecord(current) ? current : null;
}

async function readTomlFile(context: CheckContext, file: string): Promise<ParsedPythonFile> {
  if (!(await context.fileExists(file))) {
    return { exists: false, text: null, document: null, error: null };
  }

  try {
    const text = await context.readFile(file);
    const parsed: unknown = parseToml(text);
    if (!isRecord(parsed)) {
      return { exists: true, text, document: null, error: `${file} is not a TOML object` };
    }
    return { exists: true, text, document: parsed, error: null };
  } catch {
    return {
      exists: true,
      text: null,
      document: null,
      error: `${file} is not valid TOML`,
    };
  }
}

async function readTextFile(context: CheckContext, file: string): Promise<ParsedPythonFile> {
  if (!(await context.fileExists(file))) {
    return { exists: false, text: null, document: null, error: null };
  }

  try {
    return { exists: true, text: await context.readFile(file), document: null, error: null };
  } catch (error) {
    return {
      exists: true,
      text: null,
      document: null,
      error: error instanceof Error ? error.message : `${file} could not be read`,
    };
  }
}

export async function readPythonFiles(context: CheckContext): Promise<PythonProjectFiles> {
  const requirementNames = context.project.markers.filter(isRequirementFile);
  const [pyproject, pipfile, requirements] = await Promise.all([
    readTomlFile(context, "pyproject.toml"),
    readTomlFile(context, "Pipfile"),
    Promise.all(
      requirementNames.map(async (file) => ({
        file,
        ...(await readTextFile(context, file)),
      })),
    ),
  ]);

  let pythonVersion: PythonProjectFiles["pythonVersion"] = {
    exists: false,
    value: null,
    error: null,
  };

  if (await context.fileExists(".python-version")) {
    try {
      const text = await context.readFile(".python-version");
      const value =
        text
          .split(/\r?\n/)
          .map((line) => line.trim())
          .find((line) => line !== "" && !line.startsWith("#")) ?? null;
      pythonVersion = { exists: true, value, error: null };
    } catch (error) {
      pythonVersion = {
        exists: true,
        value: null,
        error: error instanceof Error ? error.message : ".python-version could not be read",
      };
    }
  }

  return { pyproject, pipfile, requirements, pythonVersion };
}

export function activeRequirementLines(text: string): Array<{ line: number; value: string }> {
  return text
    .split(/\r?\n/)
    .map((value, index) => ({ line: index + 1, value: value.trim() }))
    .filter(
      ({ value }) =>
        value !== "" && !value.startsWith("#") && !value.startsWith("-"),
    );
}
