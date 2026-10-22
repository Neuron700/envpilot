import { Command, Option } from "commander";
import type { Finding } from "../findings/types";
import { renderJson } from "../report/json";
import { renderMarkdown } from "../report/markdown";
import { renderTerminal } from "../report/terminal";
import { scanProject, type ScanOptions } from "../scan";
import { TOOL_VERSION } from "../version";
import { renderRules } from "./rules-output";

interface CheckCommandOptions {
  checkEnv?: boolean;
  localEnvFile?: string;
  color?: boolean;
}

function scanOptions(options: CheckCommandOptions): ScanOptions {
  return {
    checkEnv: options.checkEnv ?? options.localEnvFile !== undefined,
    ...(options.localEnvFile === undefined ? {} : { envFile: options.localEnvFile }),
  };
}

function exitForFindings(findings: readonly Finding[]): void {
  process.exitCode = findings.some((finding) => finding.status === "fail") ? 1 : 0;
}

function colorEnabled(command: Command): boolean {
  const options = command.optsWithGlobals();
  return options.color !== false;
}

const checkOptions = (command: Command): Command =>
  command.option("--check-env", "compare required key names with a local env file").option(
    "--local-env-file <path>",
    "local env file to inspect, relative to the project or inside it",
  );

export function createProgram(): Command {
  const program = new Command();

  program
    .name("envpilot")
    .description("Read-only developer environment doctor for Node.js and Python projects")
    .version(TOOL_VERSION)
    .option("--no-color", "disable terminal colors");

  checkOptions(
    program
      .command("scan [path]")
      .description("run a compact project and environment diagnosis")
      .addOption(
        new Option("-f, --format <format>", "output format")
          .choices(["terminal", "json", "markdown"])
          .default("terminal"),
      ),
  ).action(async (path: string | undefined, options: CheckCommandOptions & { format: string }, command: Command) => {
    const report = await scanProject(path ?? ".", scanOptions(options));
    let output: string;

    if (options.format === "json") {
      output = renderJson(report);
    } else if (options.format === "markdown") {
      output = renderMarkdown(report);
    } else {
      output = renderTerminal(report, { mode: "scan", color: colorEnabled(command) });
    }

    console.log(output);
    exitForFindings(report.findings);
  });

  checkOptions(
    program
      .command("doctor [path]")
      .description("show detailed diagnostics including passes and skipped checks"),
  ).action(async (path: string | undefined, options: CheckCommandOptions, command: Command) => {
    const report = await scanProject(path ?? ".", scanOptions(options));
    console.log(renderTerminal(report, { mode: "doctor", color: colorEnabled(command) }));
    exitForFindings(report.findings);
  });

  checkOptions(
    program
      .command("report [path]")
      .description("export a clean JSON or Markdown report to stdout")
      .addOption(
        new Option("-f, --format <format>", "export format")
          .choices(["json", "markdown"])
          .default("markdown"),
      ),
  ).action(async (path: string | undefined, options: CheckCommandOptions & { format: "json" | "markdown" }) => {
    const report = await scanProject(path ?? ".", scanOptions(options));
    console.log(options.format === "json" ? renderJson(report) : renderMarkdown(report));
    exitForFindings(report.findings);
  });

  program
    .command("rules")
    .description("list diagnostic rules, weights, and scoring rationale")
    .action(() => {
      console.log(renderRules());
    });

  return program;
}
