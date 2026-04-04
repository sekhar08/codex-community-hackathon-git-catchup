import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import type { DashboardData } from "./fetch.js";
import type { ImpactAnalysisResult } from "./impact.js";
import type { CommitGroup } from "./analyze.js";
import type { ConflictPrediction } from "./predict.js";
import { createGitClient } from "../lib/git.js";

export interface CommandActionResult {
  title: string;
  summary: string;
  tone: "info" | "success" | "warning" | "danger";
  lines: string[];
  exitCode?: number;
}

interface ActionContext {
  git: ReturnType<typeof createGitClient>;
  data: DashboardData;
  impactData: ImpactAnalysisResult;
  groups: CommitGroup[];
  conflictPredictions: ConflictPrediction[];
}

interface ResolveOptions {
  launchMergetool?: boolean;
}

const MAX_RESULT_LINES = 120;

export async function runPreviewAction(context: ActionContext): Promise<CommandActionResult> {
  const riskyFiles = getRiskyFiles(context.impactData);

  if (riskyFiles.length === 0) {
    return {
      title: "Preview",
      summary: "No risky files were detected.",
      tone: "success",
      lines: ["No risky files detected. Nothing to preview."]
    };
  }

  const diff = await context.git.raw(["diff", "--unified=3", `HEAD..${context.data.targetBranch}`, "--", ...riskyFiles]);
  const diffLines = diff.length > 0 ? truncateLines(diff.split("\n")) : ["No incoming diff was produced for the risky files."];

  return {
    title: "Preview",
    summary: `Showing risky-file diff against ${context.data.targetBranch}.`,
    tone: "info",
    lines: [`Previewing incoming diff for ${riskyFiles.length} risky file(s):`, ...diffLines]
  };
}

export async function runIsolateAction(context: ActionContext): Promise<CommandActionResult> {
  const safeHashes = context.data.incomingCommits
    .filter((commit) => !context.impactData.riskyCommits.has(commit.hash))
    .map((commit) => commit.hash)
    .reverse();
  const hasLocalChanges = context.impactData.localChanges.length > 0;
  let stashed = false;

  if (safeHashes.length === 0) {
    return {
      title: "Isolate",
      summary: "There are no safe incoming commits to isolate.",
      tone: "warning",
      lines: ["No safe incoming commits were found. Review the hot groups before isolating changes."]
    };
  }

  try {
    if (hasLocalChanges) {
      await context.git.raw(["stash", "push", "--include-untracked", "-m", "git-catchup isolate"]);
      stashed = true;
    }

    for (const hash of safeHashes) {
      await context.git.raw(["cherry-pick", hash]);
    }

    if (stashed) {
      await context.git.raw(["stash", "pop"]);
    }

    const safeGroups = context.groups.filter((group) => !group.isRisky).map((group) => group.title);

    return {
      title: "Isolate",
      summary: `Applied ${safeHashes.length} safe commit(s) from ${context.data.targetBranch}.`,
      tone: "success",
      lines: [
        `Applied ${safeHashes.length} safe commits from ${context.data.targetBranch}.`,
        safeGroups.length > 0 ? `Safe groups applied: ${safeGroups.join(", ")}` : "No safe groups were identified.",
        "This preserves safe content first, but branch history may still differ from the target because isolate cherry-picks commits."
      ]
    };
  } catch (error) {
    await context.git.raw(["cherry-pick", "--abort"]).catch(() => undefined);

    if (stashed) {
      await context.git.raw(["stash", "pop"]).catch(() => undefined);
    }

    throw error;
  }
}

export async function runResolveAction(
  context: ActionContext,
  options: ResolveOptions = {}
): Promise<CommandActionResult> {
  const status = await context.git.status();
  const conflictedFiles = status.conflicted ?? [];
  const lines = [
    "Guided conflict resolution:",
    "1. Review the files below and compare your local changes with incoming commits."
  ];

  for (const prediction of context.conflictPredictions) {
    lines.push(`   - ${prediction.path}: ${prediction.explanation}`);
  }

  lines.push("2. Resolve each file, then stage it with git add <file>.");
  lines.push("3. Finish your merge or cherry-pick after conflicts are resolved.");

  if (conflictedFiles.length > 0 && options.launchMergetool) {
    lines.push("Launching git mergetool...");
    spawnSync("git", ["mergetool"], { stdio: "inherit" });
  } else if (conflictedFiles.length > 0) {
    lines.push("Active merge conflicts were detected. Run `git mergetool` outside the workspace if you want the external merge tool.");
  } else {
    lines.push("No active merge conflicts were detected, so git mergetool was not launched.");
  }

  return {
    title: "Resolve",
    summary:
      context.conflictPredictions.length > 0
        ? `Review ${context.conflictPredictions.length} predicted conflict area(s).`
        : "No predicted conflict areas were found.",
    tone: context.conflictPredictions.length > 0 ? "warning" : "success",
    lines
  };
}

export async function runTestAction(context: ActionContext): Promise<CommandActionResult> {
  const affectedFiles = Array.from(
    new Set([
      ...context.impactData.localChanges.map((change) => change.path),
      ...context.groups.flatMap((group) => group.riskyFiles ?? [])
    ])
  );
  const command = detectTestCommand(process.cwd(), affectedFiles);

  if (!command) {
    return {
      title: "Test",
      summary: "No supported test runner was detected.",
      tone: "warning",
      lines: ["No supported test runner was detected for the current repository."]
    };
  }

  const result = spawnSync(command.bin, command.args, {
    encoding: "utf8"
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();

  return {
    title: "Test",
    summary: `Ran ${command.bin} ${command.args.join(" ")}.`,
    tone: result.status && result.status !== 0 ? "danger" : "success",
    exitCode: result.status ?? 0,
    lines: [
      `Running tests with: ${command.bin} ${command.args.join(" ")}`,
      ...(output.length > 0 ? truncateLines(output.split("\n")) : ["The test command did not produce terminal output."])
    ]
  };
}

export function printActionResult(result: CommandActionResult): void {
  console.log(result.summary);

  for (const line of result.lines) {
    console.log(line);
  }
}

function getRiskyFiles(impactData: ImpactAnalysisResult): string[] {
  return impactData.localChanges
    .filter((change) => (impactData.impactedFiles.get(change.path) ?? []).length > 0)
    .map((change) => change.path);
}

function truncateLines(lines: string[]): string[] {
  if (lines.length <= MAX_RESULT_LINES) {
    return lines;
  }

  return [...lines.slice(0, MAX_RESULT_LINES), `... truncated ${lines.length - MAX_RESULT_LINES} more lines ...`];
}

function detectTestCommand(
  cwd: string,
  affectedFiles: string[]
): { bin: string; args: string[] } | null {
  const packageJsonPath = join(cwd, "package.json");

  if (existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      scripts?: Record<string, string>;
    };
    const testScript = packageJson.scripts?.test;
    const manager = detectPackageManager(cwd);

    if (testScript) {
      if (testScript.includes("jest") && affectedFiles.length > 0) {
        return {
          bin: manager,
          args:
            manager === "npm"
              ? ["test", "--", "--findRelatedTests", ...affectedFiles]
              : ["test", "--findRelatedTests", ...affectedFiles]
        };
      }

      return {
        bin: manager,
        args: ["test"]
      };
    }
  }

  if (existsSync(join(cwd, "Cargo.toml"))) {
    return { bin: "cargo", args: ["test"] };
  }

  if (existsSync(join(cwd, "go.mod"))) {
    return { bin: "go", args: ["test", "./..."] };
  }

  if (existsSync(join(cwd, "pyproject.toml")) || existsSync(join(cwd, "pytest.ini"))) {
    return { bin: "pytest", args: [] };
  }

  return null;
}

function detectPackageManager(cwd: string): "pnpm" | "yarn" | "npm" {
  if (existsSync(join(cwd, "pnpm-lock.yaml"))) {
    return "pnpm";
  }

  if (existsSync(join(cwd, "yarn.lock"))) {
    return "yarn";
  }

  return "npm";
}
