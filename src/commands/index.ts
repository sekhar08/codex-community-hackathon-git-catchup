import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import React from "react";
import { Command } from "commander";
import { render } from "ink";
import ora from "ora";

import { Dashboard } from "../components/Dashboard.js";
import { runFetchCommand, type DashboardData, type FetchCommandOptions } from "./fetch.js";
import { analyzeImpact, type ImpactAnalysisResult } from "./impact.js";
import { analyzeCommits, type CommitGroup } from "./analyze.js";
import { predictConflicts, type ConflictPrediction } from "./predict.js";
import { createGitClient, describeGitError } from "../lib/git.js";
import { getLLMClient, getSupportedProviders, saveProjectAIConfig, type AIProvider } from "../lib/openai.js";

const program = new Command();

program
  .name("git-catchup")
  .description("Analyze incoming mainline changes before you sync your local branch.")
  .version("0.1.0")
  .option("--branch <name>", "Target branch to compare against (defaults to origin/main or main)")
  .option("--preview", "Show unified diff for risky files only")
  .option("--isolate", "Stash local changes, apply safe incoming commits first, then restore your stash")
  .option("--resolve", "Print guided conflict steps and launch git mergetool when conflicts exist")
  .option("--test", "Detect and run relevant tests for affected files")
  .addHelpText(
    "after",
    `
Examples:
  $ git-catchup
  $ git-catchup --branch origin/main
  $ git-catchup --preview
  $ git-catchup --isolate
  $ git-catchup --resolve
  $ git-catchup --test
`
  )
  .action(async (options: FetchCommandOptions) => {
    await runCli(options);
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  const described = describeGitError(error);
  if (described.message) {
    console.error(`Git Catchup failed\n${described.message}`);
    if (described.details) {
      console.error(described.details);
    }
  }
  process.exit(1);
});

export async function runCli(options: FetchCommandOptions): Promise<void> {
  await maybeConfigureAI(process.cwd());

  const git = createGitClient();
  const spinner = ora({
    text: "Fetching latest changes from remote...",
    color: "cyan"
  });

  try {
    spinner.start();
    const data = await runFetchCommand(git, options);
    spinner.text = "Analyzing impact on your local files...";
    const impactData = await analyzeImpact(git, data.targetBranch, data.incomingCommits);
    spinner.text = "Grouping incoming commits...";
    const { groups, aiStatus } = await analyzeCommits(data.incomingCommits, impactData);
    spinner.text = "Predicting conflicts...";
    const conflictPredictions = await predictConflicts(impactData);
    spinner.stop();

    if (options.preview || options.isolate || options.resolve || options.test) {
      await runQuickAction(git, data, impactData, groups, conflictPredictions, options);
      process.exit(0);
    }

    const ink = render(
      React.createElement(Dashboard, {
        data,
        groups,
        impactData,
        conflictPredictions,
        aiStatus
      }),
      {
        exitOnCtrlC: false
      }
    );

    await ink.waitUntilExit();
    process.exit(0);
  } catch (error) {
    spinner.stop();
    const described = describeGitError(error);
    console.error("Git Catchup failed");
    console.error(described.message);

    if (described.details) {
      console.error(described.details);
    }

    process.exit(1);
  }
}

async function maybeConfigureAI(projectRoot: string): Promise<void> {
  const clientInfo = getLLMClient();

  if (clientInfo.enabled || !process.stdin.isTTY || !process.stdout.isTTY) {
    return;
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    const answer = (await rl.question("No AI provider is configured. Configure AI now? (Y/n) ")).trim().toLowerCase();

    if (answer === "n" || answer === "no") {
      return;
    }

    const providers = getSupportedProviders();
    console.log("Choose your AI provider:");

    providers.forEach((provider, index) => {
      console.log(`  ${index + 1}. ${provider.provider} (${provider.displayModel})`);
    });

    const selectedProvider = await promptForProvider(rl, providers);
    const apiKey = await promptHiddenInput(`Paste your ${selectedProvider} API key: `);

    if (!apiKey.trim()) {
      console.log("AI setup skipped because no API key was entered.");
      return;
    }

    saveProjectAIConfig(projectRoot, selectedProvider, apiKey.trim());
    const refreshed = getLLMClient();
    console.log(`Saved ${selectedProvider} AI config to .env`);
    console.log(refreshed.statusMessage);
    console.log("");
  } finally {
    rl.close();
  }
}

async function runQuickAction(
  git: ReturnType<typeof createGitClient>,
  data: DashboardData,
  impactData: ImpactAnalysisResult,
  groups: CommitGroup[],
  conflictPredictions: ConflictPrediction[],
  options: FetchCommandOptions
): Promise<void> {
  if (options.isolate) {
    await runIsolateAction(git, data, impactData, groups);
    return;
  }

  if (options.resolve) {
    await runResolveAction(git, conflictPredictions);
    return;
  }

  if (options.test) {
    await runTestAction(impactData, groups);
    return;
  }

  if (options.preview) {
    await runPreviewAction(git, data, impactData);
  }
}

async function runPreviewAction(
  git: ReturnType<typeof createGitClient>,
  data: DashboardData,
  impactData: ImpactAnalysisResult
): Promise<void> {
  const riskyFiles = getRiskyFiles(impactData);

  if (riskyFiles.length === 0) {
    console.log("No risky files detected. Nothing to preview.");
    return;
  }

  const diff = await git.raw(["diff", "--unified=3", `HEAD..${data.targetBranch}`, "--", ...riskyFiles]);

  console.log(`Previewing incoming diff for risky files against ${data.targetBranch}:`);
  console.log(diff.length > 0 ? diff : "No incoming diff was produced for the risky files.");
}

async function runIsolateAction(
  git: ReturnType<typeof createGitClient>,
  data: DashboardData,
  impactData: ImpactAnalysisResult,
  groups: CommitGroup[]
): Promise<void> {
  const spinner = ora({ text: "Preparing isolate workflow...", color: "yellow" }).start();
  const safeHashes = data.incomingCommits
    .filter((commit) => !impactData.riskyCommits.has(commit.hash))
    .map((commit) => commit.hash)
    .reverse();
  const hasLocalChanges = impactData.localChanges.length > 0;
  let stashed = false;

  if (safeHashes.length === 0) {
    spinner.stop();
    console.log("No safe incoming commits were found. Review the hot groups before isolating changes.");
    return;
  }

  try {
    if (hasLocalChanges) {
      spinner.text = "Stashing local changes...";
      await git.raw(["stash", "push", "--include-untracked", "-m", "git-catchup isolate"]);
      stashed = true;
    }

    spinner.text = "Cherry-picking safe commits...";

    for (const hash of safeHashes) {
      await git.raw(["cherry-pick", hash]);
    }

    if (stashed) {
      spinner.text = "Re-applying stashed changes...";
      await git.raw(["stash", "pop"]);
    }

    spinner.stop();
    console.log(`Applied ${safeHashes.length} safe commits from ${data.targetBranch}.`);
    console.log(
      `Safe groups applied: ${groups.filter((group) => !group.isRisky).map((group) => group.title).join(", ")}`
    );
  } catch (error) {
    spinner.stop();
    await git.raw(["cherry-pick", "--abort"]).catch(() => undefined);

    if (stashed) {
      await git.raw(["stash", "pop"]).catch(() => undefined);
    }

    throw error;
  }
}

async function runResolveAction(
  git: ReturnType<typeof createGitClient>,
  conflictPredictions: ConflictPrediction[]
): Promise<void> {
  const status = await git.status();
  const conflictedFiles = status.conflicted ?? [];

  console.log("Guided conflict resolution:");
  console.log("1. Review the files below and compare your local changes with incoming commits.");

  for (const prediction of conflictPredictions) {
    console.log(`   - ${prediction.path}: ${prediction.explanation}`);
  }

  console.log("2. Resolve each file, then stage it with git add <file>.");
  console.log("3. Finish your merge or cherry-pick after conflicts are resolved.");

  if (conflictedFiles.length > 0) {
    console.log("Launching git mergetool...");
    spawnSync("git", ["mergetool"], { stdio: "inherit" });
  } else {
    console.log("No active merge conflicts were detected, so git mergetool was not launched.");
  }
}

async function runTestAction(
  impactData: ImpactAnalysisResult,
  groups: CommitGroup[]
): Promise<void> {
  const affectedFiles = Array.from(
    new Set([
      ...impactData.localChanges.map((change) => change.path),
      ...groups.flatMap((group) => group.riskyFiles ?? [])
    ])
  );
  const command = detectTestCommand(process.cwd(), affectedFiles);

  if (!command) {
    console.log("No supported test runner was detected for the current repository.");
    return;
  }

  console.log(`Running tests with: ${command.bin} ${command.args.join(" ")}`);
  const result = spawnSync(command.bin, command.args, { stdio: "inherit" });

  if (result.status && result.status !== 0) {
    process.exit(result.status);
  }
}

function getRiskyFiles(impactData: ImpactAnalysisResult): string[] {
  return impactData.localChanges
    .filter((change) => (impactData.impactedFiles.get(change.path) ?? []).length > 0)
    .map((change) => change.path);
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

async function promptForProvider(
  rl: ReturnType<typeof createInterface>,
  providers: Array<{ provider: AIProvider; displayModel: string }>
): Promise<AIProvider> {
  while (true) {
    const answer = (await rl.question("Enter 1, 2, or 3: ")).trim();
    const index = Number.parseInt(answer, 10) - 1;

    if (Number.isInteger(index) && index >= 0 && index < providers.length) {
      return providers[index].provider;
    }

    console.log("Please choose a valid provider number.");
  }
}

async function promptHiddenInput(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const mutableOutput = new Writable({
      write(chunk, encoding, callback) {
        if (!mutableOutput.muted) {
          process.stdout.write(chunk, encoding as BufferEncoding);
        }
        callback();
      }
    }) as Writable & { muted?: boolean };

    mutableOutput.muted = false;

    const rl = createInterface({
      input: process.stdin,
      output: mutableOutput,
      terminal: true
    });

    mutableOutput.muted = true;
    process.stdout.write(prompt);

    rl.question("")
      .then((value) => {
        process.stdout.write("\n");
        rl.close();
        resolve(value);
      })
      .catch((error) => {
        process.stdout.write("\n");
        rl.close();
        reject(error);
      });
  });
}
