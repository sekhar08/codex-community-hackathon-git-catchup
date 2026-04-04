import {
  CheckRepoActions,
  GitError,
  simpleGit,
  type BranchSummary,
  type SimpleGit,
  type StatusResult
} from "simple-git";

export interface LocalChange {
  path: string;
  state: string;
}

export interface IncomingCommit {
  hash: string;
  message: string;
  date: string;
  files: string[];
}

export class CatchupError extends Error {
  readonly code:
    | "NOT_GIT_REPO"
    | "NO_REMOTE"
    | "FETCH_FAILED"
    | "DETACHED_HEAD"
    | "TARGET_MISSING";

  constructor(code: CatchupError["code"], message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "CatchupError";
    this.code = code;

    if (options?.cause) {
      this.cause = options.cause;
    }
  }
}

export function createGitClient(baseDir: string = process.cwd()): SimpleGit {
  return simpleGit({
    baseDir,
    binary: "git",
    maxConcurrentProcesses: 4
  });
}

export async function ensureGitRepository(git: SimpleGit): Promise<void> {
  const isRepoRoot = await git.checkIsRepo(CheckRepoActions.IS_REPO_ROOT).catch(() => false);

  if (isRepoRoot) {
    return;
  }

  const insideWorkTree = await git.revparse(["--is-inside-work-tree"]).catch(() => "false");

  if (insideWorkTree.trim() !== "true") {
    throw new CatchupError("NOT_GIT_REPO", "This command must be run inside a git repository.");
  }
}

export async function ensureRemoteConfigured(git: SimpleGit): Promise<void> {
  const remotes = await git.getRemotes(true);

  if (remotes.length === 0) {
    throw new CatchupError("NO_REMOTE", "No git remote is configured for this repository.");
  }
}

export async function fetchRemote(git: SimpleGit, targetBranch: string): Promise<boolean> {
  try {
    const remotes = await git.getRemotes(true);
    const remoteName = targetBranch.includes("/") ? targetBranch.split("/")[0] : remotes[0]?.name;

    if (!remoteName) {
      throw new CatchupError("NO_REMOTE", "No git remote is configured for this repository.");
    }

    const before = await git.revparse([targetBranch]).catch(() => null);
    await git.fetch(remoteName, { "--prune": null });
    const after = await git.revparse([targetBranch]).catch(() => null);

    return before !== after;
  } catch (error) {
    if (error instanceof CatchupError) {
      throw error;
    }

    throw new CatchupError("FETCH_FAILED", "Unable to fetch the latest changes from the remote.", {
      cause: error
    });
  }
}

export async function getStatus(git: SimpleGit): Promise<StatusResult> {
  return git.status();
}

export async function getCurrentBranch(git: SimpleGit): Promise<string> {
  const summary = await git.branchLocal();
  return readCurrentBranch(summary);
}

export async function getUpstream(git: SimpleGit, branch: string): Promise<string | null> {
  try {
    const upstream = await git.raw(["rev-parse", "--abbrev-ref", `${branch}@{upstream}`]);
    const trimmed = upstream.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

export async function resolveTargetBranch(git: SimpleGit, requestedBranch?: string): Promise<string> {
  if (requestedBranch) {
    const exists = await branchExists(git, requestedBranch);

    if (!exists) {
      throw new CatchupError(
        "TARGET_MISSING",
        `The selected branch "${requestedBranch}" does not exist locally or on the fetched remote refs.`
      );
    }

    return requestedBranch;
  }

  if (await branchExists(git, "origin/main")) {
    return "origin/main";
  }

  if (await branchExists(git, "main")) {
    return "main";
  }

  throw new CatchupError(
    "TARGET_MISSING",
    'Unable to find a default target branch. Try passing "--branch <name>".'
  );
}

export async function countIncomingCommits(
  git: SimpleGit,
  currentBranch: string,
  targetBranch: string
): Promise<number> {
  const output = await git.raw(["rev-list", "--count", `${currentBranch}..${targetBranch}`]);
  return Number.parseInt(output.trim(), 10) || 0;
}

export async function getDaysOfChanges(
  git: SimpleGit,
  currentBranch: string,
  targetBranch: string
): Promise<number> {
  const log = await git.log({
    from: currentBranch,
    to: targetBranch,
    maxCount: 1,
    "--reverse": null
  });

  const oldest = log.all[0];

  if (!oldest) {
    return 0;
  }

  const milliseconds = Date.now() - new Date(oldest.date).getTime();
  return Math.max(0, Math.ceil(milliseconds / (1000 * 60 * 60 * 24)));
}

export async function getLocalModifiedFiles(git: SimpleGit): Promise<LocalChange[]> {
  const status = await getStatus(git);
  return mapLocalChanges(status);
}

export async function getIncomingCommits(git: SimpleGit, branch?: string): Promise<IncomingCommit[]> {
  const currentBranch = await getCurrentBranch(git);
  const targetBranch = branch ?? (await resolveTargetBranch(git));

  const output = await git.raw([
    "log",
    "--format=__COMMIT__%n%H%x09%s%x09%cI",
    "--name-only",
    `${currentBranch}..${targetBranch}`
  ]);

  return parseIncomingCommitLog(output);
}

export async function getCommitsTouchingFile(
  git: SimpleGit,
  filePath: string,
  branch?: string
): Promise<IncomingCommit[]> {
  const currentBranch = await getCurrentBranch(git);
  const targetBranch = branch ?? (await resolveTargetBranch(git));
  const normalizedPath = normalizeFilePath(filePath);
  const commits = await getIncomingCommits(git, targetBranch);

  return commits.filter((commit) =>
    commit.files.some((file) => normalizeFilePath(file) === normalizedPath)
  );
}

export function getTimeSpanOfCommits(commits: IncomingCommit[]): string {
  if (commits.length === 0) {
    return "0 days";
  }

  const timestamps = commits
    .map((commit) => new Date(commit.date).getTime())
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);

  if (timestamps.length === 0) {
    return "0 days";
  }

  const span = timestamps[timestamps.length - 1] - timestamps[0];
  const days = Math.max(1, Math.ceil(span / (1000 * 60 * 60 * 24)));
  return days === 1 ? "1 day" : `${days} days`;
}

export function describeGitError(error: unknown): { message: string; details?: string } {
  if (error instanceof CatchupError) {
    return { message: error.message, details: describeCause(error.cause) };
  }

  if (error instanceof GitError) {
    return {
      message: "Git reported an unexpected error while analyzing the repository.",
      details: error.message
    };
  }

  if (error instanceof Error) {
    return {
      message: "An unexpected error occurred while running git-catchup.",
      details: error.message
    };
  }

  return {
    message: "An unknown error occurred while running git-catchup."
  };
}

function readCurrentBranch(summary: BranchSummary): string {
  if (summary.detached) {
    throw new CatchupError(
      "DETACHED_HEAD",
      "Detached HEAD detected. Check out a branch before running git-catchup."
    );
  }

  if (!summary.current) {
    throw new CatchupError("DETACHED_HEAD", "Unable to determine the current branch.");
  }

  return summary.current;
}

async function branchExists(git: SimpleGit, branchName: string): Promise<boolean> {
  try {
    await git.revparse([branchName]);
    return true;
  } catch {
    return false;
  }
}

function mapLocalChanges(status: StatusResult): LocalChange[] {
  const tracked = status.files.map((file) => ({
    path: file.path,
    state: formatStatus(file.working_dir, file.index)
  }));

  const untracked = status.not_added
    .filter((path) => !tracked.some((file) => file.path === path))
    .map((path) => ({
      path,
      state: "untracked"
    }));

  return [...tracked, ...untracked].sort((left, right) => left.path.localeCompare(right.path));
}

function formatStatus(workingDir: string, index: string): string {
  const codes = `${index}${workingDir}`.trim();

  if (codes.includes("R")) {
    return "renamed";
  }

  if (codes.includes("D")) {
    return "deleted";
  }

  if (codes.includes("A")) {
    return "added";
  }

  if (codes.includes("M")) {
    return "modified";
  }

  if (codes.includes("?")) {
    return "untracked";
  }

  return "changed";
}

function parseIncomingCommitLog(output: string): IncomingCommit[] {
  return output
    .split("__COMMIT__")
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .map((block) => {
      const [header = "", ...fileLines] = block.split("\n");
      const [hash = "", message = "", date = ""] = header.split("\t");

      return {
        hash: hash.trim(),
        message: message.trim(),
        date: date.trim(),
        files: fileLines.map((line) => line.trim()).filter((line) => line.length > 0)
      };
    })
    .filter((commit) => commit.hash.length > 0);
}

function normalizeFilePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

function describeCause(cause: unknown): string | undefined {
  if (!cause) {
    return undefined;
  }

  if (cause instanceof Error) {
    return cause.message;
  }

  return String(cause);
}
