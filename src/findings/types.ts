import type { ProjectKind } from "../discovery/types";

export type FindingStatus = "pass" | "warning" | "fail" | "skipped";

export type Severity = "info" | "low" | "medium" | "high";

export type RuleCategory =
  | "discovery"
  | "runtime"
  | "dependencies"
  | "configuration"
  | "environment";

export interface RuleDefinition {
  id: string;
  title: string;
  category: RuleCategory;
  description: string;
  severity: Severity;
  weight: number;
  appliesTo: readonly (ProjectKind | "any")[];
}

export interface Finding {
  id: string;
  title: string;
  category: RuleCategory;
  status: FindingStatus;
  severity: Severity;
  message: string;
  evidence: string[];
  impact: string;
  recommendation: string;
}

export interface ScoreDeduction {
  id: string;
  title: string;
  status: "warning" | "fail";
  points: number;
  reason: string;
}

export type ScoreBand = "ready" | "attention" | "at-risk";

export interface ScoreResult {
  value: number;
  band: ScoreBand;
  coverage: number;
  deductions: ScoreDeduction[];
  limitations: string[];
}

export interface FindingSummary {
  pass: number;
  warning: number;
  fail: number;
  skipped: number;
  total: number;
}

export interface ReportEnvironment {
  node: string;
  platform: string;
  arch: string;
  python: {
    executable: string;
    version: string;
  } | null;
  pythonChecked: boolean;
}

export interface Report {
  schemaVersion: "1.0";
  generatedAt: string;
  toolVersion: string;
  project: {
    name: string;
    kinds: ProjectKind[];
    markers: string[];
  };
  environment: ReportEnvironment;
  findings: Finding[];
  summary: FindingSummary;
  score: ScoreResult | null;
  limitations: string[];
}
