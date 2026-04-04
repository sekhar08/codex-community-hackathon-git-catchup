import React from "react";
import { Command } from "commander";
import { render } from "ink";
import ora from "ora";

import { Dashboard } from "../components/Dashboard.js";
import { runFetchCommand, type FetchCommandOptions } from "./fetch.js";
import { analyzeImpact } from "./impact.js";
import { analyzeCommits } from "./analyze.js";
import { createGitClient, describeGitError } from "../lib/git.js";

const program = new Command();

program
  .name("git-catchup")
  .description("Analyze incoming mainline changes before you sync your local branch.")
  .version("0.1.0")
  .option("--branch <name>", "Target branch to compare against (defaults to origin/main or main)")
  .option("--preview", "Reserved for future preview behavior")
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
  const git = createGitClient();
  const spinner = ora({
    text: "Fetching latest changes from remote...",
    color: "cyan"
  });

  try {
    spinner.start();
    const data = await runFetchCommand(git, options);
    const impactData = await analyzeImpact(git, data.targetBranch);
    const groups = await analyzeCommits(data.incomingCommits, impactData);
    spinner.stop();

    const ink = render(React.createElement(Dashboard, { data, groups, impactData }), {
      exitOnCtrlC: false
    });

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
