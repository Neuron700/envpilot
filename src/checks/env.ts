import { createFinding } from "../findings/create";
import type { CheckContext } from "./types";
import { RULE_BY_ID } from "./rules";

const TEMPLATE_FILES = [".env.example", ".env.template", ".env.sample", ".env.dist"] as const;

export function parseEnvKeyNames(text: string): string[] {
  const keys = new Set<string>();

  for (const rawLine of text.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    if (line.startsWith("export ")) line = line.slice("export ".length).trim();

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (match?.[1]) keys.add(match[1]);
  }

  return [...keys].sort();
}

interface TemplateResult {
  files: string[];
  keys: string[];
  errors: string[];
}

async function readTemplates(context: CheckContext): Promise<TemplateResult> {
  const present: string[] = [];
  for (const file of TEMPLATE_FILES) {
    if (await context.fileExists(file)) present.push(file);
  }

  const results = await Promise.all(
    present.map(async (file) => {
      try {
        return { file, keys: parseEnvKeyNames(await context.readFile(file)), error: null };
      } catch (error) {
        return {
          file,
          keys: [] as string[],
          error: error instanceof Error ? error.message : `${file} could not be read`,
        };
      }
    }),
  );

  const keys = new Set<string>();
  const errors: string[] = [];
  for (const result of results) {
    for (const key of result.keys) keys.add(key);
    if (result.error) errors.push(result.error);
  }

  return { files: present, keys: [...keys].sort(), errors };
}

export async function checkEnvTemplate(context: CheckContext) {
  const rule = RULE_BY_ID.get("env-template")!;
  const templates = await readTemplates(context);

  if (templates.files.length === 0) {
    return createFinding(rule, "skipped", {
      message: "No environment template was found.",
      impact: "EnvPilot has no declared list of required environment keys.",
      recommendation: "Add .env.example or another supported template if the project needs environment variables.",
    });
  }

  if (templates.errors.length > 0) {
    return createFinding(rule, "warning", {
      message: "An environment template exists but could not be read safely.",
      evidence: templates.errors,
      impact: "Required environment key names cannot be determined.",
      recommendation: "Make sure the template is a regular file inside the project and is not too large.",
    });
  }

  if (templates.keys.length === 0) {
    return createFinding(rule, "warning", {
      message: "The environment template does not declare recognizable KEY=value names.",
      evidence: templates.files,
      impact: "The project does not communicate which environment keys are required.",
      recommendation: "List required keys in KEY= form inside the template, using placeholder values only.",
    });
  }

  return createFinding(rule, "pass", {
    message: `Environment template found with ${templates.keys.length} declared key${templates.keys.length === 1 ? "" : "s"}.`,
    evidence: templates.files,
    impact: "The project publishes a readable environment key contract.",
    recommendation: "No action required.",
  });
}

export async function checkEnvRequiredKeys(context: CheckContext) {
  const rule = RULE_BY_ID.get("env-required-keys")!;
  const templates = await readTemplates(context);

  if (templates.files.length === 0) {
    return createFinding(rule, "skipped", {
      message: "No environment template is available to derive required keys.",
      impact: "Required environment key names were not evaluated.",
      recommendation: "Add .env.example or a related template if the project needs environment variables.",
    });
  }

  if (templates.errors.length > 0) {
    return createFinding(rule, "skipped", {
      message: "Required environment keys could not be read from every template.",
      evidence: templates.errors,
      impact: "The required key list may be incomplete.",
      recommendation: "Fix template readability, then scan again.",
    });
  }

  if (templates.keys.length === 0) {
    return createFinding(rule, "skipped", {
      message: "The environment template declares no required keys.",
      impact: "There are no key names to compare.",
      recommendation: "Add required key names to the template if environment variables are part of the project.",
    });
  }

  return createFinding(rule, "pass", {
    message: `${templates.keys.length} required environment key${templates.keys.length === 1 ? " is" : "s are"} declared.`,
    evidence: templates.keys,
    impact: "Required key names are known without reading any local secret values.",
    recommendation: "No action required.",
  });
}

export async function checkEnvLocalKeys(context: CheckContext) {
  const rule = RULE_BY_ID.get("env-local-keys")!;
  const templates = await readTemplates(context);

  if (!context.options.checkEnv) {
    return createFinding(rule, "skipped", {
      message: "Local environment comparison is disabled.",
      impact: "EnvPilot did not read any local .env file.",
      recommendation: "Run with --check-env to compare key names only.",
    });
  }

  if (templates.files.length === 0 || templates.keys.length === 0) {
    return createFinding(rule, "skipped", {
      message: "There are no required key names to compare.",
      impact: "Local environment variables were not evaluated.",
      recommendation: "Add a readable environment template with required keys, then scan again.",
    });
  }

  const localFile = context.options.envFile ?? ".env";
  if (!(await context.fileExists(localFile))) {
    return createFinding(rule, "warning", {
      message: `The local environment file ${localFile} was not found.`,
      evidence: templates.keys.map((key) => `required: ${key}`),
      impact: "The project may fail to start if these keys are not provided another way.",
      recommendation: `Create ${localFile} from the template and fill in local values.`,
    });
  }

  let localKeys: string[];
  try {
    localKeys = parseEnvKeyNames(await context.readFile(localFile));
  } catch (error) {
    return createFinding(rule, "warning", {
      message: `The local environment file ${localFile} could not be read safely.`,
      evidence: [error instanceof Error ? error.message : `${localFile} could not be read`],
      impact: "Required key presence could not be verified.",
      recommendation: "Use a regular file inside the project root, then scan again.",
    });
  }

  const present = new Set(localKeys);
  const missing = templates.keys.filter((key) => !present.has(key));

  if (missing.length > 0) {
    return createFinding(rule, "fail", {
      message: `${missing.length} required environment key${missing.length === 1 ? " is" : "s are"} missing from ${localFile}.`,
      evidence: missing,
      impact: "The application may fail during configuration or startup.",
      recommendation: "Add the missing key names to the local environment file. Values were not read or reported.",
    });
  }

  return createFinding(rule, "pass", {
    message: `All required environment key names are present in ${localFile}.`,
    evidence: [`checked keys: ${templates.keys.length}`, `local file: ${localFile}`],
    impact: "No missing key names were found. Values remain private.",
    recommendation: "No action required.",
  });
}
