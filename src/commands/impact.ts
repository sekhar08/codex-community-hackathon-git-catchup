import type { SimpleGit } from "simple-git";

import { getCommitsTouchingFile, getLocalModifiedFiles } from "../lib/git.js";

export interface ImpactedLocalChange {
  path: string;
  status: string;
  message?: string;
}

export interface ImpactAnalysisResult {
  localChanges: ImpactedLocalChange[];
  riskyCommits: Set<string>;
  impactedFiles: Map<string, string[]>;
}

export async function analyzeImpact(
  git: SimpleGit,
  targetBranch?: string
): Promise<ImpactAnalysisResult> {
  const localChanges = await getLocalModifiedFiles(git);
  const riskyCommits = new Set<string>();
  const impactedFiles = new Map<string, string[]>();

  for (const change of localChanges) {
    const touchingCommits = await getCommitsTouchingFile(git, change.path, targetBranch);
    const messages = touchingCommits.map((commit) => commit.message);

    impactedFiles.set(change.path, messages);

    for (const commit of touchingCommits) {
      riskyCommits.add(commit.hash);
    }
  }

  return {
    localChanges: localChanges.map((change) => ({
      path: change.path,
      status: change.state,
      message: buildLocalChangeMessage(change.path, change.state, impactedFiles.get(change.path) ?? [])
    })),
    riskyCommits,
    impactedFiles
  };
}

function buildLocalChangeMessage(path: string, status: string, touchingMessages: string[]): string {
  if (touchingMessages.length === 0) {
    return `${path} has ${status} local changes with no matching incoming commits.`;
  }

  return `Incoming overlap: ${touchingMessages[0]}`;
}
