import type { ImpactAnalysisResult } from "./impact.js";
import type { IncomingCommit } from "../lib/git.js";

export type CommitGroup = {
  emoji: string;
  title: string;
  count: number;
  files: string[];
  isRisky: boolean;
  riskyFiles?: string[];
};

interface GroupAccumulator {
  emoji: string;
  title: string;
  commits: IncomingCommit[];
  files: Set<string>;
  riskyFiles: Set<string>;
  isRisky: boolean;
}

export async function analyzeCommits(
  commits: IncomingCommit[],
  impactData: ImpactAnalysisResult
): Promise<CommitGroup[]> {
  const groups = new Map<string, GroupAccumulator>();

  for (const commit of commits) {
    const descriptor = describeCommitGroup(commit);
    const key = `${descriptor.title}:${descriptor.emoji}`;
    const existing = groups.get(key) ?? {
      emoji: descriptor.emoji,
      title: descriptor.title,
      commits: [],
      files: new Set<string>(),
      riskyFiles: new Set<string>(),
      isRisky: false
    };

    existing.commits.push(commit);

    for (const file of commit.files) {
      existing.files.add(file);

      if (impactData.impactedFiles.has(file)) {
        existing.riskyFiles.add(file);
      }
    }

    if (impactData.riskyCommits.has(commit.hash)) {
      existing.isRisky = true;
    }

    groups.set(key, existing);
  }

  return [...groups.values()]
    .map((group) => ({
      emoji: group.emoji,
      title: group.title,
      count: group.commits.length,
      files: [...group.files].sort(),
      isRisky: group.isRisky,
      riskyFiles: group.riskyFiles.size > 0 ? [...group.riskyFiles].sort() : undefined
    }))
    .sort((left, right) => {
      if (left.isRisky !== right.isRisky) {
        return left.isRisky ? -1 : 1;
      }

      return right.count - left.count || left.title.localeCompare(right.title);
    });
}

function describeCommitGroup(commit: IncomingCommit): { emoji: string; title: string } {
  const folderCandidate = derivePathGroup(commit.files);

  if (folderCandidate) {
    return folderCandidate;
  }

  return deriveConventionalGroup(commit.message);
}

function derivePathGroup(files: string[]): { emoji: string; title: string } | null {
  const relevant = files.filter((file) => file.length > 0);

  if (relevant.length === 0) {
    return null;
  }

  const ranked = relevant
    .map((file) => {
      const normalized = file.replace(/\\/g, "/");
      const parts = normalized.split("/").filter(Boolean);

      if (parts.length === 0) {
        return null;
      }

      if (parts[0] === "src" && parts.length > 1) {
        return parts.length > 2 ? parts[1] : stripExtension(parts[parts.length - 1]);
      }

      if (parts[0] === "packages" && parts.length > 1) {
        return parts[1];
      }

      if (parts.length > 1) {
        return parts[0];
      }

      return stripExtension(parts[0]);
    })
    .filter((value): value is string => Boolean(value));

  const groupKey = ranked[0];

  if (!groupKey) {
    return null;
  }

  return {
    emoji: pickEmoji(groupKey),
    title: humanizeGroupKey(groupKey)
  };
}

function deriveConventionalGroup(message: string): { emoji: string; title: string } {
  const normalized = message.toLowerCase();

  if (normalized.startsWith("feat")) {
    return { emoji: "✨", title: "Features" };
  }

  if (normalized.startsWith("fix")) {
    return { emoji: "🐛", title: "Bug fixes" };
  }

  if (normalized.startsWith("docs")) {
    return { emoji: "📝", title: "Documentation" };
  }

  if (normalized.startsWith("deps") || normalized.includes("depend")) {
    return { emoji: "📦", title: "Dependencies" };
  }

  if (normalized.startsWith("chore")) {
    return { emoji: "🧹", title: "Chores" };
  }

  if (normalized.startsWith("refactor")) {
    return { emoji: "♻️", title: "Refactors" };
  }

  if (normalized.startsWith("test")) {
    return { emoji: "🧪", title: "Tests" };
  }

  return { emoji: "📁", title: "General updates" };
}

function humanizeGroupKey(value: string): string {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}

function pickEmoji(value: string): string {
  const normalized = value.toLowerCase();

  if (normalized.includes("notif")) {
    return "🔔";
  }

  if (normalized.includes("pay")) {
    return "💳";
  }

  if (normalized.includes("auth")) {
    return "🔐";
  }

  if (normalized.includes("doc") || normalized.includes("readme")) {
    return "📝";
  }

  if (normalized.includes("test")) {
    return "🧪";
  }

  if (normalized.includes("dep") || normalized.includes("package")) {
    return "📦";
  }

  return "📁";
}
