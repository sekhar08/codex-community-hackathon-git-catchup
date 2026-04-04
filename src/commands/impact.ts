import type { SimpleGit } from "simple-git";

import { getIncomingCommits, getLocalModifiedFiles, type IncomingCommit } from "../lib/git.js";

export interface ImpactedLocalChange {
  path: string;
  status: string;
  message?: string;
}

export interface ImpactAnalysisResult {
  localChanges: ImpactedLocalChange[];
  riskyCommits: Set<string>;
  impactedFiles: Map<string, string[]>;
  impactedCommits: Map<string, IncomingCommit[]>;
}

export async function analyzeImpact(
  git: SimpleGit,
  targetBranch?: string,
  incomingCommits?: IncomingCommit[]
): Promise<ImpactAnalysisResult> {
  const localChanges = await getLocalModifiedFiles(git);
  const commits = incomingCommits ?? (await getIncomingCommits(git, targetBranch));
  const indexedCommits = indexIncomingCommitsByFile(commits);
  const riskyCommits = new Set<string>();
  const impactedFiles = new Map<string, string[]>();
  const impactedCommits = new Map<string, IncomingCommit[]>();

  for (const change of localChanges) {
    const touchingCommits = indexedCommits.get(normalizeFilePath(change.path)) ?? [];
    const messages = touchingCommits.map((commit) => commit.message);

    impactedFiles.set(change.path, messages);
    impactedCommits.set(change.path, touchingCommits);

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
    impactedFiles,
    impactedCommits
  };
}

function buildLocalChangeMessage(path: string, status: string, touchingMessages: string[]): string {
  if (touchingMessages.length === 0) {
    return `${path} has ${status} local changes with no matching incoming commits.`;
  }

  return `Incoming overlap: ${touchingMessages[0]}`;
}

function indexIncomingCommitsByFile(commits: IncomingCommit[]): Map<string, IncomingCommit[]> {
  const index = new Map<string, IncomingCommit[]>();

  for (const commit of commits) {
    for (const file of commit.files) {
      const key = normalizeFilePath(file);
      const existing = index.get(key) ?? [];
      existing.push(commit);
      index.set(key, existing);
    }
  }

  return index;
}

function normalizeFilePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}
