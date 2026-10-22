import type { Report } from "../findings/types";

export function renderJson(report: Report): string {
  return JSON.stringify(report, null, 2);
}
