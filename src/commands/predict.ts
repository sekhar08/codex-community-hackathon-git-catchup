import type { ImpactAnalysisResult } from "./impact.js";

export interface ConflictPrediction {
  path: string;
  severity: "high" | "medium";
  explanation: string;
}

export async function predictConflicts(
  impactData: ImpactAnalysisResult
): Promise<ConflictPrediction[]> {
  return impactData.localChanges
    .filter((change) => (impactData.impactedFiles.get(change.path) ?? []).length > 0)
    .map((change) => {
      const touchingMessages = impactData.impactedFiles.get(change.path) ?? [];

      return {
        path: change.path,
        severity: touchingMessages.length > 1 ? "high" : "medium",
        explanation:
          touchingMessages.length > 1
            ? `Multiple incoming commits touch this file, so a manual merge is likely. Latest overlap: ${touchingMessages[0]}`
            : `An incoming commit touches this file. Review before merging. Latest overlap: ${touchingMessages[0]}`
      };
    });
}
