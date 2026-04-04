import type { SimpleGit } from "simple-git";

import {
  ensureGitRepository,
  ensureRemoteConfigured,
  fetchRemote,
  getCurrentBranch,
  getDaysOfChanges,
  getLocalModifiedFiles,
  getUpstream,
  resolveTargetBranch,
  countIncomingCommits,
  type LocalChange
} from "../lib/git.js";

export interface FetchCommandOptions {
  branch?: string;
  preview?: boolean;
}

export interface DashboardData {
  branch: string;
  upstream: string | null;
  targetBranch: string;
  commitCount: number;
  daysOfChanges: number;
  localChanges: LocalChange[];
  fetchChangedRefs: boolean;
  preview: boolean;
}

export async function runFetchCommand(
  git: SimpleGit,
  options: FetchCommandOptions
): Promise<DashboardData> {
  await ensureGitRepository(git);
  await ensureRemoteConfigured(git);

  const currentBranch = await getCurrentBranch(git);
  const targetBranch = await resolveTargetBranch(git, options.branch);
  const fetchChangedRefs = await fetchRemote(git, targetBranch);
  const [upstream, localChanges, commitCount, daysOfChanges] = await Promise.all([
    getUpstream(git, currentBranch),
    getLocalModifiedFiles(git),
    countIncomingCommits(git, currentBranch, targetBranch),
    getDaysOfChanges(git, currentBranch, targetBranch)
  ]);

  return {
    branch: currentBranch,
    upstream,
    targetBranch,
    commitCount,
    daysOfChanges,
    localChanges,
    fetchChangedRefs,
    preview: options.preview ?? false
  };
}
