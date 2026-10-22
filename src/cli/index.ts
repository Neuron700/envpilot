#!/usr/bin/env node
import { Command, CommanderError } from "commander";
import { ProjectPathError } from "../discovery/discover";
import { UnsupportedProjectError } from "../scan";
import { createProgram } from "./program";

function overrideExit(command: Command): void {
  command.exitOverride();
  for (const subcommand of command.commands) {
    overrideExit(subcommand);
  }
}

async function main(): Promise<void> {
  const program = createProgram();
  overrideExit(program);

  if (process.argv.slice(2).length === 0) {
    program.outputHelp();
    process.exitCode = 2;
    return;
  }

  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    if (error instanceof CommanderError) {
      process.exitCode = error.exitCode === 0 ? 0 : 2;
      return;
    }

    if (error instanceof UnsupportedProjectError || error instanceof ProjectPathError) {
      console.error(`EnvPilot: ${error.message}`);
      process.exitCode = 2;
      return;
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`EnvPilot could not complete the scan: ${message}`);
    process.exitCode = 2;
  }
}

void main();
