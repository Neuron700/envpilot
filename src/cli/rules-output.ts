import { RULES } from "../checks/rules";

export function renderRules(): string {
  const lines = [
    "EnvPilot diagnostic rules",
    "",
    "ID | Category | Severity | Weight | Applies to | Description",
    "--- | --- | --- | ---: | --- | ---",
  ];

  for (const rule of RULES) {
    lines.push(
      `${rule.id} | ${rule.category} | ${rule.severity} | ${rule.weight} | ${rule.appliesTo.join(", ")} | ${rule.description}`,
    );
  }

  lines.push("");
  lines.push("Score formula: 100 minus the sum of deductions.");
  lines.push("A failed rule deducts its full weight; a warning deducts half its weight, rounded up.");
  lines.push("Passed and skipped rules do not deduct points.");
  lines.push("");
  lines.push("The score is a checklist summary, not a build-success probability or security score.");

  return lines.join("\n");
}
