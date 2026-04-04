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
import { runResolveCommand } from "./resolve.js";
import { createGitClient, describeGitError } from "../lib/git.js";
import { getLLMClient, getSupportedProviders, saveProjectAIConfig, type AIProvider } from "../lib/openai.js";
import {
  printActionResult,
  runIsolateAction,
  runPreviewAction,
  runResolveAction,
  runTestAction
} from "./actions.js";

const program = new Command();

program
  .name("git-catchup")
  .description("Analyze incoming mainline changes before you sync your local branch.")
  .version("0.1.0")
  .option("--branch <name>", "Target branch to compare against (defaults to origin/main or main)")
  .option("--preview", "Show unified diff for risky files only")
  .option("--isolate", "Stash local changes, apply safe incoming commits first, then restore your stash")
  .option("--resolve", "Launch the interactive AI-guided conflict resolver")
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
        aiStatus,
        actions: {
          preview: () => runPreviewAction({ git, data, impactData, groups, conflictPredictions }),
          isolate: () => runIsolateAction({ git, data, impactData, groups, conflictPredictions }),
          resolve: () => runResolveAction({ git, data, impactData, groups, conflictPredictions }),
          test: () => runTestAction({ git, data, impactData, groups, conflictPredictions })
        }
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
  const context = {
    git,
    data,
    impactData,
    groups,
    conflictPredictions
  };

  if (options.isolate) {
    printActionResult(await runIsolateAction(context));
    return;
  }

  if (options.resolve) {
    await runResolveCommand({ requestedBranch: options.branch });
    return;
  }

  if (options.test) {
    const result = await runTestAction(context);
    printActionResult(result);

    if (result.exitCode && result.exitCode !== 0) {
      process.exit(result.exitCode);
    }

    return;
  }

  if (options.preview) {
    printActionResult(await runPreviewAction(context));
  }
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
