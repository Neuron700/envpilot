import type { FindingStatus, Report, ScoreBand } from "../findings/types";
import { markdownText } from "./sanitize";

const BAND_LABEL: Record<ScoreBand, string> = {
  ready: "Ready",
  attention: "Needs attention",
  "at-risk": "At risk",
};

function statusLabel(status: FindingStatus): string {
  return status.toUpperCase();
}

function inline(value: string): string {
  return markdownText(value);
}

function sectionText(value: string): string {
  const text = inline(value);
  return text === "" ? "_None_" : text;
}

export function renderMarkdown(report: Report): string {
  const lines: string[] = [];

  lines.push(`# EnvPilot report — ${inline(report.project.name)}`);
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`EnvPilot version: ${report.toolVersion}`);
  lines.push(`Detected project: ${report.project.kinds.join(", ") || "unsupported"}`);
  lines.push(`Markers: ${inline(report.project.markers.join(", ")) || "none"}`);
  lines.push("");

  lines.push("## Environment");
  lines.push("");
  lines.push(`- Node.js: ${inline(report.environment.node)}`);
  lines.push(
    `- Platform: ${inline(report.environment.platform)} (${inline(report.environment.arch)})`,
  );
  if (!report.environment.pythonChecked) {
    lines.push("- Python: not checked (not a detected project runtime)");
  } else if (report.environment.python) {
    lines.push(
      `- Python: ${inline(report.environment.python.version)} (${inline(report.environment.python.executable)})`,
    );
  } else {
    lines.push("- Python: checked, but no executable was found");
  }
  lines.push("");

  lines.push("## Summary");
  lines.push("");
  lines.push("| Status | Count |");
  lines.push("| --- | ---: |");
  lines.push(`| Fail | ${report.summary.fail} |`);
  lines.push(`| Warning | ${report.summary.warning} |`);
  lines.push(`| Pass | ${report.summary.pass} |`);
  lines.push(`| Skipped | ${report.summary.skipped} |`);
  lines.push(`| Total | ${report.summary.total} |`);
  lines.push("");

  lines.push("## Readiness score");
  lines.push("");
  if (report.score) {
    lines.push(
      `**${report.score.value} / 100 — ${BAND_LABEL[report.score.band]}**`,
    );
    lines.push("");
    lines.push(`Checklist coverage: ${Math.round(report.score.coverage * 100)}%.`);
    lines.push("");
    if (report.score.deductions.length === 0) {
      lines.push("No score deductions.");
    } else {
      lines.push("| Rule | Status | Points | Reason |");
      lines.push("| --- | --- | ---: | --- |");
      for (const deduction of report.score.deductions) {
        lines.push(
          `| ${inline(deduction.id)} | ${inline(deduction.status)} | -${deduction.points} | ${inline(deduction.reason)} |`,
        );
      }
    }
  } else {
    lines.push("_Score withheld because there is not enough reliable data._");
  }
  lines.push("");

  lines.push("## Findings");
  lines.push("");
  for (const finding of report.findings) {
    lines.push(
      `### [${statusLabel(finding.status)}] ${inline(finding.title)} (\`${inline(finding.id)}\`)`,
    );
    lines.push("");
    lines.push(sectionText(finding.message));
    lines.push("");
    if (finding.evidence.length > 0) {
      lines.push("**Evidence**");
      lines.push("");
      for (const evidence of finding.evidence) {
        lines.push(`- ${inline(evidence)}`);
      }
      lines.push("");
    }
    lines.push(`**Impact:** ${inline(finding.impact)}`);
    lines.push("");
    lines.push(`**Recommendation:** ${inline(finding.recommendation)}`);
    lines.push("");
  }

  lines.push("## Limitations");
  lines.push("");
  if (report.limitations.length === 0) {
    lines.push("_No additional limitations were recorded._");
  } else {
    for (const limitation of report.limitations) {
      lines.push(`- ${inline(limitation)}`);
    }
  }
  lines.push("");
  lines.push("---");
  lines.push(
    "EnvPilot performs read-only checks. It does not install packages, rewrite lockfiles, or print environment values.",
  );

  return lines.join("\n");
}
