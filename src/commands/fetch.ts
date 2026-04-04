import type { SimpleGit } from "simple-git";

import {
  getIncomingCommits,
  getTimeSpanOfCommits,
  ensureGitRepository,
  ensureRemoteConfigured,
  fetchRemote,
  getCurrentBranch,
  getUpstream,
  resolveTargetBranch,
  type IncomingCommit
} from "../lib/git.js";

export interface FetchCommandOptions {
  branch?: string;
  preview?: boolean;
  isolate?: boolean;
  resolve?: boolean;
  test?: boolean;
}

export interface DashboardData {
  branch: string;
  upstream: string | null;
  targetBranch: string;
  commitCount: number;
  daysOfChanges: number;
  timeSpanLabel: string;
  incomingCommits: IncomingCommit[];
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
  const [upstream, incomingCommits] = await Promise.all([
    getUpstream(git, currentBranch),
    getIncomingCommits(git, targetBranch)
  ]);
  const timeSpanLabel = getTimeSpanOfCommits(incomingCommits);
  const commitCount = incomingCommits.length;
  const daysOfChanges = Number.parseInt(timeSpanLabel, 10) || 0;

  return {
    branch: currentBranch,
    upstream,
    targetBranch,
    commitCount,
    daysOfChanges,
    timeSpanLabel,
    incomingCommits,
    fetchChangedRefs,
    preview: options.preview ?? false
  };
}
