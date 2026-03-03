import { classifyCategoryFromDescription } from "./classify";

export function classifyExpense(descNormalized: string): "fixed" | "variable" | "unknown" {
  const result = classifyCategoryFromDescription({
    kind: "expense",
    description: descNormalized,
  });
  if (result.category === "fixed" || result.category === "variable") {
    return result.category;
  }
  return "unknown";
}
