import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { render } from "ink";

import type { SimpleGit } from "simple-git";

import { InteractiveResolver } from "../components/InteractiveResolver.js";
import { explainConflict, getLLMClient, type ConflictExplanation } from "../lib/openai.js";
import {
  createGitClient,
  ensureGitRepository,
  ensureRemoteConfigured,
  fetchRemote,
  getConflictedFiles,
  getFileCommitDetails,
  getMergeHead,
  isMergeInProgress,
  resolveTargetBranch,
  type FileCommitDetails
} from "../lib/git.js";

export interface ConflictHunk {
  id: number;
  filePath: string;
  startLine: number;
  currentLabel: string;
  incomingLabel: string;
  currentText: string;
  incomingText: string;
  surroundingContext: string;
}

export interface ParsedConflictFile {
  filePath: string;
  hasTrailingNewline: boolean;
  segments: ConflictSegment[];
  hunks: ConflictHunk[];
}

export interface ConflictFileSession {
  filePath: string;
  hunks: ConflictHunk[];
  incomingCommit: FileCommitDetails | null;
  isResolved: boolean;
  staged: boolean;
}

export interface ResolverCommandOptions {
  requestedBranch?: string;
}

type ConflictSegment =
  | {
      type: "plain";
      lines: string[];
    }
  | {
      type: "conflict";
      hunk: ConflictHunk;
    };

type ResolutionChoice = "mine" | "theirs" | "both" | "suggestion";

interface ResolveRuntimeContext {
  git: SimpleGit;
  targetBranch: string;
  stashRef: string | null;
  mergeStartedByResolver: boolean;
}

export async function runResolveCommand(
  options: ResolverCommandOptions = {}
): Promise<void> {
  const git = createGitClient();
  await ensureGitRepository(git);
  await ensureRemoteConfigured(git);

  const targetBranch = await resolveTargetBranch(git, options.requestedBranch);
  await fetchRemote(git, targetBranch);

  const runtime = await prepareResolveSession(git, targetBranch);
  const sessions = await loadConflictSessions(git, targetBranch);

  if (sessions.length === 0) {
    printNonInteractiveResolveSummary(runtime, targetBranch);
    return;
  }

  const ink = render(
    React.createElement(InteractiveResolver, {
      initialSessions: sessions,
      targetBranch,
      aiEnabled: getLLMClient().enabled,
      onExplain: (session, hunk, question) =>
        explainCurrentConflict(git, targetBranch, session, hunk, question),
      onApplyChoice: (session, hunk, choice, mergedText) =>
        applyResolutionChoice(git, targetBranch, session.filePath, hunk.id, choice, mergedText),
      onStageFile: (filePath) => stageResolvedFile(git, filePath),
      onRefresh: () => loadConflictSessions(git, targetBranch),
      onAbort: () => abortResolveSession(runtime),
      mergeStartedByResolver: runtime.mergeStartedByResolver,
      stashRef: runtime.stashRef
    }),
    {
      exitOnCtrlC: true
    }
  );

  await ink.waitUntilExit();
}

export function parseConflictText(
  filePath: string,
  content: string
): ParsedConflictFile {
  const normalized = content.replace(/\r/g, "");
  const hasTrailingNewline = normalized.endsWith("\n");
  const lines = normalized.split("\n");
  const segments: ConflictSegment[] = [];
  const hunks: ConflictHunk[] = [];
  let plainBuffer: string[] = [];
  let plainHistory: string[] = [];
  let hunkId = 1;
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";

    if (line.startsWith("<<<<<<< ")) {
      if (plainBuffer.length > 0) {
        segments.push({ type: "plain", lines: [...plainBuffer] });
        plainHistory = [...plainHistory, ...plainBuffer];
        plainBuffer = [];
      }

      const startLine = index + 1;
      const currentLabel = line.slice("<<<<<<< ".length).trim() || "HEAD";
      index += 1;

      const currentLines: string[] = [];

      while (index < lines.length && lines[index] !== "=======") {
        currentLines.push(lines[index] ?? "");
        index += 1;
      }

      if (index >= lines.length) {
        plainBuffer.push(line, ...currentLines);
        break;
      }

      index += 1;
      const incomingLines: string[] = [];

      while (index < lines.length && !(lines[index] ?? "").startsWith(">>>>>>> ")) {
        incomingLines.push(lines[index] ?? "");
        index += 1;
      }

      const incomingLabel =
        index < lines.length ? (lines[index] ?? "").slice(">>>>>>> ".length).trim() || "incoming" : "incoming";
      const afterContext = lines.slice(index + 1, index + 4).filter((candidate) => !candidate.startsWith("<<<<<<< "));
      const surroundingContext = [...plainHistory.slice(-3), ...afterContext].join("\n").trim();
      const hunk: ConflictHunk = {
        id: hunkId,
        filePath,
        startLine,
        currentLabel,
        incomingLabel,
        currentText: currentLines.join("\n"),
        incomingText: incomingLines.join("\n"),
        surroundingContext
      };

      hunks.push(hunk);
      segments.push({ type: "conflict", hunk });
      hunkId += 1;
      index += 1;
      continue;
    }

    plainBuffer.push(line);
    index += 1;
  }

  if (plainBuffer.length > 0) {
    segments.push({ type: "plain", lines: [...plainBuffer] });
  }

  return {
    filePath,
    hasTrailingNewline,
    segments,
    hunks
  };
}

export function applyConflictChoice(
  parsed: ParsedConflictFile,
  hunkId: number,
  choice: ResolutionChoice,
  mergedText?: string
): string {
  const renderedLines: string[] = [];

  for (const segment of parsed.segments) {
    if (segment.type === "plain") {
      renderedLines.push(...segment.lines);
      continue;
    }

    if (segment.hunk.id !== hunkId) {
      renderedLines.push(...renderUnresolvedHunk(segment.hunk));
      continue;
    }

    const resolvedText = resolveHunkText(segment.hunk, choice, mergedText);

    if (resolvedText.length > 0) {
      renderedLines.push(...resolvedText.split("\n"));
    }
  }

  const output = renderedLines.join("\n");
  return parsed.hasTrailingNewline ? `${output}\n` : output;
}

async function prepareResolveSession(
  git: SimpleGit,
  targetBranch: string
): Promise<ResolveRuntimeContext> {
  if (await isMergeInProgress(git)) {
    return {
      git,
      targetBranch,
      stashRef: null,
      mergeStartedByResolver: false
    };
  }

  const status = await git.status();
  let stashRef: string | null = null;

  if (status.files.length > 0 || status.not_added.length > 0) {
    await git.raw(["stash", "push", "--include-untracked", "-m", "git-catchup resolve savepoint"]);
    stashRef = (await git.raw(["stash", "list", "-1", "--format=%gd"])).trim() || null;
  }

  try {
    await git.raw(["merge", "--no-commit", "--no-ff", targetBranch]);
  } catch {
    if (!(await isMergeInProgress(git))) {
      throw new Error(`Unable to start a guarded merge against ${targetBranch}.`);
    }
  }

  return {
    git,
    targetBranch,
    stashRef,
    mergeStartedByResolver: true
  };
}

async function loadConflictSessions(
  git: SimpleGit,
  targetBranch: string
): Promise<ConflictFileSession[]> {
  const files = await getConflictedFiles(git);
  const sessions = await Promise.all(
    files.map(async (filePath) => loadConflictFileSession(git, targetBranch, filePath))
  );

  return sessions.filter((session): session is ConflictFileSession => session !== null);
}

async function loadConflictFileSession(
  git: SimpleGit,
  targetBranch: string,
  filePath: string
): Promise<ConflictFileSession | null> {
  const absolutePath = join(process.cwd(), filePath);

  if (!existsSync(absolutePath)) {
    return null;
  }

  const parsed = parseConflictText(filePath, readFileSync(absolutePath, "utf8"));
  const status = await git.status();
  const staged = status.staged.includes(filePath) || status.created.includes(filePath);

  if (parsed.hunks.length === 0) {
    return {
      filePath,
      hunks: [],
      incomingCommit: await getFileCommitDetails(git, filePath, targetBranch),
      isResolved: true,
      staged
    };
  }

  return {
    filePath,
    hunks: parsed.hunks,
    incomingCommit: await getFileCommitDetails(git, filePath, targetBranch),
    isResolved: false,
    staged
  };
}

async function explainCurrentConflict(
  git: SimpleGit,
  targetBranch: string,
  session: ConflictFileSession,
  hunk: ConflictHunk,
  question: string
): Promise<ConflictExplanation> {
  return explainConflict({
    filePath: session.filePath,
    branch: (await git.branchLocal()).current,
    targetBranch,
    localCode: hunk.currentText,
    incomingCode: hunk.incomingText,
    surroundingContext: hunk.surroundingContext,
    incomingCommit: session.incomingCommit,
    userQuestion: question
  });
}

async function applyResolutionChoice(
  git: SimpleGit,
  targetBranch: string,
  filePath: string,
  hunkId: number,
  choice: ResolutionChoice,
  mergedText?: string
): Promise<{ sessions: ConflictFileSession[]; message: string }> {
  const absolutePath = join(process.cwd(), filePath);
  const parsed = parseConflictText(filePath, readFileSync(absolutePath, "utf8"));
  const nextContent = applyConflictChoice(parsed, hunkId, choice, mergedText);
  writeFileSync(absolutePath, nextContent, "utf8");

  return {
    sessions: await loadConflictSessions(git, targetBranch),
    message: `Applied ${describeChoice(choice)} to ${filePath} hunk ${hunkId}.`
  };
}

async function stageResolvedFile(
  git: SimpleGit,
  filePath: string
): Promise<string> {
  const absolutePath = join(process.cwd(), filePath);
  const content = readFileSync(absolutePath, "utf8");

  if (content.includes("<<<<<<< ") || content.includes("=======\n") || content.includes(">>>>>>> ")) {
    throw new Error(`Cannot stage ${filePath} while conflict markers are still present.`);
  }

  await git.add(filePath);
  return `Staged ${filePath}.`;
}

async function abortResolveSession(runtime: ResolveRuntimeContext): Promise<string> {
  if (await isMergeInProgress(runtime.git)) {
    await runtime.git.raw(["merge", "--abort"]).catch(() => undefined);
  }

  if (runtime.stashRef) {
    await runtime.git.raw(["stash", "pop", runtime.stashRef]).catch((error: unknown) => {
      throw new Error(
        error instanceof Error
          ? `Merge aborted, but failed to restore the saved working tree: ${error.message}`
          : "Merge aborted, but failed to restore the saved working tree."
      );
    });
  }

  return runtime.stashRef
    ? "Aborted the guarded merge and restored the saved working tree."
    : "Aborted the merge session.";
}

function printNonInteractiveResolveSummary(
  runtime: ResolveRuntimeContext,
  targetBranch: string
): void {
  console.log(`No conflicted files were detected after starting the guarded merge against ${targetBranch}.`);
  if (runtime.mergeStartedByResolver) {
    console.log("The merge applied cleanly and is staged in your working tree.");
    console.log("Review the result, then commit the merge or run `git merge --abort` to back out.");
  }
  if (runtime.stashRef) {
    console.log(`Your previous local changes were saved in ${runtime.stashRef}. Restore them after you finish the merge.`);
  }
}

function renderUnresolvedHunk(hunk: ConflictHunk): string[] {
  return [
    `<<<<<<< ${hunk.currentLabel}`,
    ...splitLines(hunk.currentText),
    "=======",
    ...splitLines(hunk.incomingText),
    `>>>>>>> ${hunk.incomingLabel}`
  ];
}

function resolveHunkText(
  hunk: ConflictHunk,
  choice: ResolutionChoice,
  mergedText?: string
): string {
  switch (choice) {
    case "mine":
      return hunk.currentText;
    case "theirs":
      return hunk.incomingText;
    case "both":
      return [hunk.currentText, hunk.incomingText].filter((value) => value.length > 0).join("\n");
    case "suggestion":
      return mergedText?.trim().length ? mergedText : [hunk.incomingText, hunk.currentText].filter(Boolean).join("\n");
  }
}

function splitLines(content: string): string[] {
  return content.length > 0 ? content.split("\n") : [];
}

function describeChoice(choice: ResolutionChoice): string {
  switch (choice) {
    case "mine":
      return "keep-mine";
    case "theirs":
      return "keep-theirs";
    case "both":
      return "show-both";
    case "suggestion":
      return "apply-suggestion";
  }
}
