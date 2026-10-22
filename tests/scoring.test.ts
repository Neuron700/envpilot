import { describe, expect, it } from "vitest";
import type { Finding, RuleDefinition } from "../src/findings/types";
import { calculateScore } from "../src/scoring/score";

const runtimeRule: RuleDefinition = {
  id: "node-runtime-engines",
  title: "Node runtime",
  category: "runtime",
  description: "Checks Node",
  severity: "high",
  weight: 25,
  appliesTo: ["node"],
};

const depsRule: RuleDefinition = {
  id: "node-lockfile",
  title: "Lockfile",
  category: "dependencies",
  description: "Checks lockfile",
  severity: "medium",
  weight: 15,
  appliesTo: ["node"],
};

function finding(rule: RuleDefinition, status: Finding["status"]): Finding {
  return {
    id: rule.id,
    title: rule.title,
    category: rule.category,
    severity: rule.severity,
    status,
    message: "test",
    evidence: [],
    impact: "test",
    recommendation: "test",
  };
}

describe("readiness score", () => {
  it("deducts full weight for failures and half for warnings", () => {
    const score = calculateScore(
      [finding(runtimeRule, "fail"), finding(depsRule, "warning")],
      [runtimeRule, depsRule],
    );

    expect(score).not.toBeNull();
    expect(score?.value).toBe(67);
    expect(score?.deductions).toEqual([
      {
        id: "node-runtime-engines",
        title: "Node runtime",
        status: "fail",
        points: 25,
        reason: "Failed: Node runtime",
      },
      {
        id: "node-lockfile",
        title: "Lockfile",
        status: "warning",
        points: 8,
        reason: "Warning: Lockfile",
      },
    ]);
  });

  it("returns 100 when every applicable check passes", () => {
    const score = calculateScore(
      [finding(runtimeRule, "pass"), finding(depsRule, "pass")],
      [runtimeRule, depsRule],
    );

    expect(score?.value).toBe(100);
    expect(score?.deductions).toEqual([]);
  });

  it("withholds a score without runtime evidence", () => {
    const score = calculateScore([finding(depsRule, "fail")], [runtimeRule, depsRule]);

    expect(score).toBeNull();
  });

  it("withholds a score when fewer than two checks apply", () => {
    const score = calculateScore([finding(runtimeRule, "pass")], [runtimeRule]);

    expect(score).toBeNull();
  });

  it("withholds a score when less than half of relevant checks have data", () => {
    const largeRule: RuleDefinition = {
      ...depsRule,
      id: "env-local-keys",
      category: "environment",
      weight: 60,
    };
    const score = calculateScore(
      [finding(runtimeRule, "pass"), finding(depsRule, "pass"), finding(largeRule, "skipped")],
      [runtimeRule, depsRule, largeRule],
    );

    expect(score).toBeNull();
  });
});
