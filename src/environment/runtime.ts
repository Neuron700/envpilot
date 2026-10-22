import { execFile } from "node:child_process";

export interface PythonRuntime {
  executable: string;
  version: string;
  raw: string;
}

export interface RuntimeInfo {
  nodeVersion: string;
  platform: NodeJS.Platform;
  arch: string;
  python: PythonRuntime | null;
  pythonError: string | null;
}

interface ProbeCandidate {
  command: string;
  args: string[];
  label: string;
}

interface ExecResult {
  stdout: string;
  stderr: string;
}

const MAX_OUTPUT_BYTES = 64 * 1024;

function runExecutable(candidate: ProbeCandidate, timeoutMs: number): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    execFile(
      candidate.command,
      candidate.args,
      {
        shell: false,
        windowsHide: true,
        timeout: timeoutMs,
        maxBuffer: MAX_OUTPUT_BYTES,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(error);
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
}

function pythonCandidates(platform: NodeJS.Platform): ProbeCandidate[] {
  if (platform === "win32") {
    return [
      { command: "python", args: ["--version"], label: "python --version" },
      { command: "py", args: ["-3", "--version"], label: "py -3 --version" },
    ];
  }

  return [
    { command: "python3", args: ["--version"], label: "python3 --version" },
    { command: "python", args: ["--version"], label: "python --version" },
  ];
}

async function probePython(platform: NodeJS.Platform): Promise<{
  python: PythonRuntime | null;
  error: string | null;
}> {
  const failures: string[] = [];

  for (const candidate of pythonCandidates(platform)) {
    try {
      const result = await runExecutable(candidate, 3000);
      const output = `${result.stdout}\n${result.stderr}`.trim();
      const match = output.match(/Python\s+(\d+\.\d+(?:\.\d+)?)/i);
      if (!match?.[1]) {
        failures.push(`${candidate.label} returned an unrecognized version`);
        continue;
      }
      return {
        python: {
          executable: candidate.command,
          version: match[1],
          raw: output,
        },
        error: null,
      };
    } catch {
      failures.push(`${candidate.label} is unavailable`);
    }
  }

  return {
    python: null,
    error: failures.length > 0 ? failures.join("; ") : "Python executable not found",
  };
}

export async function inspectRuntime(needPython: boolean): Promise<RuntimeInfo> {
  const base: RuntimeInfo = {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    python: null,
    pythonError: null,
  };

  if (!needPython) {
    return base;
  }

  const { python, error } = await probePython(process.platform);
  return { ...base, python, pythonError: error };
}
