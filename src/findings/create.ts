import type { Finding, FindingStatus, RuleDefinition, Severity } from "./types";

export interface FindingDetails {
  message: string;
  evidence?: string[];
  impact: string;
  recommendation: string;
  severity?: Severity;
}

export function createFinding(
  rule: RuleDefinition,
  status: FindingStatus,
  details: FindingDetails,
): Finding {
  return {
    id: rule.id,
    title: rule.title,
    category: rule.category,
    status,
    severity: details.severity ?? rule.severity,
    message: details.message,
    evidence: details.evidence ?? [],
    impact: details.impact,
    recommendation: details.recommendation,
  };
}
