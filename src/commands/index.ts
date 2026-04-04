import React from "react";
import { Command } from "commander";
import { render } from "ink";
import ora from "ora";

import { Dashboard } from "../components/Dashboard.js";
import { runFetchCommand, type FetchCommandOptions } from "./fetch.js";
import { analyzeImpact } from "./impact.js";
import { analyzeCommits } from "./analyze.js";
import { predictConflicts } from "./predict.js";
import { createGitClient, describeGitError } from "../lib/git.js";

const program = new Command();

program
  .name("git-catchup")
  .description("Analyze incoming mainline changes before you sync your local branch.")
  .version("0.1.0")
  .option("--branch <name>", "Target branch to compare against (defaults to origin/main or main)")
  .option("--preview", "Reserved for future preview behavior")
  .option("--isolate", "Pull safe commit groups first")
  .option("--resolve", "Start guided conflict resolution")
  .option("--test", "Run relevant tests after analysis")
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
  const quickAction = selectQuickAction(options);

  if (quickAction) {
    console.log(quickAction.message);
    console.log(quickAction.command);
    process.exit(0);
  }

  const git = createGitClient();
  const spinner = ora({
    text: "Fetching latest changes from remote...",
    color: "cyan"
  });

  try {
    spinner.start();
    const data = await runFetchCommand(git, options);
    const impactData = await analyzeImpact(git, data.targetBranch);
    const { groups, aiStatus } = await analyzeCommits(data.incomingCommits, impactData);
    const conflictPredictions = await predictConflicts(impactData);
    spinner.stop();

    const ink = render(
      React.createElement(Dashboard, { data, groups, impactData, conflictPredictions, aiStatus }),
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

function selectQuickAction(options: FetchCommandOptions): { message: string; command: string } | null {
  if (options.isolate) {
    return {
      message: "Isolate mode is a Phase 2 guided placeholder. Start by reviewing safe groups first:",
      command: "git catchup --isolate"
    };
  }

  if (options.resolve) {
    return {
      message: "Resolve mode is a Phase 2 guided placeholder. Start the guided conflict workflow with:",
      command: "git catchup --resolve"
    };
  }

  if (options.test) {
    return {
      message: "Test mode is a Phase 2 guided placeholder. Run the relevant verification workflow with:",
      command: "git catchup --test"
    };
  }

  return null;
}
