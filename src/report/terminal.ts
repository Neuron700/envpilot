import pc from "picocolors";
import type { Finding, FindingStatus, Report, ScoreBand } from "../findings/types";
import { terminalText } from "./sanitize";

type Mode = "scan" | "doctor";

interface RenderTerminalOptions {
  mode: Mode;
  color: boolean;
}

const BAND_LABEL: Record<ScoreBand, string> = {
  ready: "Ready",
  attention: "Needs attention",
  "at-risk": "At risk",
};

function statusText(status: FindingStatus, colors: ReturnType<typeof pc.createColors>): string {
  if (status === "fail") return colors.red("[FAIL]");
  if (status === "warning") return colors.yellow("[WARN]");
  if (status === "pass") return colors.green("[PASS]");
  return colors.gray("[SKIP]");
}

function scoreText(report: Report, colors: ReturnType<typeof pc.createColors>): string[] {
  if (!report.score) {
    return [
      "Readiness score: withheld (insufficient data)",
      "The checklist did not receive enough reliable observations for a score.",
    ];
  }

  const value = `${report.score.value}/100 (${BAND_LABEL[report.score.band]})`;
  const colored =
    report.score.band === "ready"
      ? colors.green(value)
      : report.score.band === "attention"
        ? colors.yellow(value)
        : colors.red(value);

  const lines = [
    `Readiness score: ${colored}`,
    `Checklist coverage: ${Math.round(report.score.coverage * 100)}%`,
  ];

  if (report.score.deductions.length > 0) {
    lines.push("Score deductions:");
    for (const deduction of report.score.deductions) {
      lines.push(
        `  -${deduction.points} ${terminalText(deduction.id)} (${terminalText(deduction.status)})`,
      );
    }
  }

  return lines;
}

function renderFinding(
  finding: Finding,
  mode: Mode,
  colors: ReturnType<typeof pc.createColors>,
): string[] {
  const prefix = statusText(finding.status, colors);
  const lines = [
    `${prefix} ${colors.bold(terminalText(finding.title))} (${terminalText(finding.id)})`,
  ];
  lines.push(`  ${terminalText(finding.message)}`);

  if (mode === "doctor") {
    if (finding.evidence.length > 0) {
      lines.push("  Evidence:");
      for (const evidence of finding.evidence) {
        lines.push(`    - ${terminalText(evidence)}`);
      }
    }
    lines.push(`  Impact: ${terminalText(finding.impact)}`);
    lines.push(`  Recommendation: ${terminalText(finding.recommendation)}`);
  } else if (finding.status === "fail" || finding.status === "warning") {
    if (finding.evidence.length > 0) {
      lines.push("  Evidence:");
      for (const evidence of finding.evidence) {
        lines.push(`    - ${terminalText(evidence)}`);
      }
    }
    lines.push(`  Recommendation: ${terminalText(finding.recommendation)}`);
  }

  return lines;
}

export function renderTerminal(report: Report, options: RenderTerminalOptions): string {
  const colors = pc.createColors(options.color && process.stdout.isTTY === true);
  const lines: string[] = [];
  const python =
    report.environment.pythonChecked
      ? (report.environment.python?.version ?? "not found")
      : "not checked";

  lines.push(colors.bold(`EnvPilot ${options.mode}`));
  lines.push(`Project: ${terminalText(report.project.name)}`);
  lines.push(`Detected: ${report.project.kinds.join(", ") || "unsupported"}`);
  lines.push(`Markers: ${terminalText(report.project.markers.join(", ")) || "none"}`);
  lines.push(
    `Environment: Node.js ${terminalText(report.environment.node)} | Python: ${terminalText(python)}`,
  );
  lines.push("");
  lines.push(...scoreText(report, colors));
  lines.push("");
  lines.push(
    `Findings: Fail ${report.summary.fail} | Warning ${report.summary.warning} | Pass ${report.summary.pass} | Skipped ${report.summary.skipped}`,
  );
  lines.push("");

  const visible =
    options.mode === "doctor"
      ? report.findings
      : report.findings.filter(
          (finding) => finding.status === "fail" || finding.status === "warning",
        );

  if (visible.length === 0) {
    lines.push("No warnings or failures were found.");
  } else {
    for (const finding of visible) {
      lines.push(...renderFinding(finding, options.mode, colors));
      lines.push("");
    }
  }

  if (options.mode === "doctor" || report.score === null) {
    lines.push("Limitations:");
    if (report.limitations.length === 0) {
      lines.push("  None recorded.");
    } else {
      for (const limitation of report.limitations) {
        lines.push(`  - ${terminalText(limitation)}`);
      }
    }
  }

  return lines.join("\n").trimEnd();
}
