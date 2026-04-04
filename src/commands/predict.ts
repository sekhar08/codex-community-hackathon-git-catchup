import type { ImpactAnalysisResult } from "./impact.js";
import { getLLMClient, requestStructuredJson } from "../lib/openai.js";

export interface ConflictPrediction {
  path: string;
  severity: "high" | "medium";
  explanation: string;
  localContext: string;
  incomingContext: string;
  source: "ai" | "heuristic";
}

export async function predictConflicts(
  impactData: ImpactAnalysisResult
): Promise<ConflictPrediction[]> {
  const candidates = impactData.localChanges
    .filter((change) => (impactData.impactedFiles.get(change.path) ?? []).length > 0)
    .map((change) => ({
      path: change.path,
      status: change.status,
      localMessage: change.message ?? "Local change detected",
      touchingMessages: impactData.impactedFiles.get(change.path) ?? [],
      touchingCommits: impactData.impactedCommits.get(change.path) ?? []
    }));

  if (candidates.length === 0) {
    return [];
  }

  const clientInfo = getLLMClient();

  if (clientInfo.enabled) {
    try {
      const parsed = await requestStructuredJson<{ predictions?: Array<Record<string, unknown>> }>(
        "You explain likely git merge conflicts for a CLI. Return a JSON object with a predictions array. Each item must include path, severity, explanation, localContext, and incomingContext.",
        {
          task: "Explain why each file is likely to conflict, based on local uncommitted work and incoming commits from main.",
          files: candidates.map((candidate) => ({
            path: candidate.path,
            status: candidate.status,
            localMessage: candidate.localMessage,
            incomingMessages: candidate.touchingMessages,
            incomingFiles: candidate.touchingCommits.flatMap((commit) => commit.files)
          }))
        }
      );

      const aiPredictions = new Map(
        (Array.isArray(parsed.predictions) ? parsed.predictions : [])
          .map((prediction) => normalizePrediction(prediction))
          .filter((prediction): prediction is ConflictPrediction => prediction !== null)
          .map((prediction) => [prediction.path, prediction])
      );

      return candidates.map((candidate) => aiPredictions.get(candidate.path) ?? buildHeuristicPrediction(candidate));
    } catch {
      return candidates.map(buildHeuristicPrediction);
    }
  }

  return candidates.map(buildHeuristicPrediction);
}

function buildHeuristicPrediction(candidate: {
  path: string;
  status: string;
  localMessage: string;
  touchingMessages: string[];
}): ConflictPrediction {
  return {
    path: candidate.path,
    severity: candidate.touchingMessages.length > 1 ? "high" : "medium",
    explanation:
      candidate.touchingMessages.length > 1
        ? "Multiple incoming commits touch this file, so both your local edits and upstream changes may need manual reconciliation."
        : "An incoming commit touches this file, so your local edits may overlap with upstream changes.",
    localContext: candidate.localMessage,
    incomingContext: candidate.touchingMessages.join("; "),
    source: "heuristic"
  };
}

function normalizePrediction(prediction: Record<string, unknown>): ConflictPrediction | null {
  if (typeof prediction.path !== "string") {
    return null;
  }

  return {
    path: prediction.path,
    severity: prediction.severity === "high" ? "high" : "medium",
    explanation:
      typeof prediction.explanation === "string"
        ? prediction.explanation
        : "Incoming and local changes may overlap in this file.",
    localContext:
      typeof prediction.localContext === "string"
        ? prediction.localContext
        : "Local changes are present.",
    incomingContext:
      typeof prediction.incomingContext === "string"
        ? prediction.incomingContext
        : "Incoming commits touched this file.",
    source: "ai"
  };
}
