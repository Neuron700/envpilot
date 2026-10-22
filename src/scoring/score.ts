import type {
  Finding,
  RuleDefinition,
  ScoreBand,
  ScoreResult,
} from "../findings/types";

export const RUNTIME_REQUIREMENT_RULE_IDS: readonly string[] = [
  "node-runtime-engines",
  "python-runtime-version",
];

const RUNTIME_REQUIREMENT_RULES = new Set(RUNTIME_REQUIREMENT_RULE_IDS);

function bandFor(value: number): ScoreBand {
  if (value >= 90) return "ready";
  if (value >= 70) return "attention";
  return "at-risk";
}

export function calculateScore(
  findings: readonly Finding[],
  relevantRules: readonly RuleDefinition[],
): ScoreResult | null {
  const relevant = new Map(relevantRules.map((rule) => [rule.id, rule]));
  const applicable = findings.filter((finding) => {
    const rule = relevant.get(finding.id);
    return rule !== undefined && rule.weight > 0 && finding.status !== "skipped";
  });

  if (applicable.length < 2) return null;
  if (!applicable.some((finding) => RUNTIME_REQUIREMENT_RULES.has(finding.id))) {
    return null;
  }

  const deductions = applicable
    .filter(
      (finding): finding is Finding & { status: "warning" | "fail" } =>
        finding.status === "warning" || finding.status === "fail",
    )
    .map((finding) => {
      const rule = relevant.get(finding.id)!;
      const points =
        finding.status === "fail" ? rule.weight : Math.ceil(rule.weight * 0.5);
      return {
        id: finding.id,
        title: finding.title,
        status: finding.status,
        points,
        reason: `${finding.status === "fail" ? "Failed" : "Warning"}: ${finding.title}`,
      };
    });

  const totalDeduction = deductions.reduce((sum, deduction) => sum + deduction.points, 0);
  const value = Math.max(0, 100 - totalDeduction);

  const relevantWeight = [...relevant.values()].reduce(
    (sum, rule) => sum + rule.weight,
    0,
  );
  const applicableWeight = applicable.reduce(
    (sum, finding) => sum + (relevant.get(finding.id)?.weight ?? 0),
    0,
  );
  const coverage =
    relevantWeight === 0
      ? 0
      : Math.round((applicableWeight / relevantWeight) * 100) / 100;

  if (coverage < 0.5) return null;

  return {
    value,
    band: bandFor(value),
    coverage,
    deductions,
    limitations: [],
  };
}
