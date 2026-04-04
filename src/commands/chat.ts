import { createInterface } from "node:readline/promises";
import { isAIEnabled, buildSystemPrompt, getSuggestedCommands, streamChat, type ChatContext, type ChatMessage, type AISuggestedCommand } from "../lib/openai.js";
import type { DashboardData } from "./fetch.js";
import type { CommitGroup } from "./analyze.js";
import type { ImpactAnalysisResult } from "./impact.js";
import type { ConflictPrediction } from "./predict.js";

const MAX_CONVERSATION_HISTORY = 5;

export interface ChatOptions {
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
}

export async function runChatMode(
  data: DashboardData,
  groups: CommitGroup[],
  impactData: ImpactAnalysisResult,
  conflictPredictions: ConflictPrediction[],
  aiStatus: string,
  options: ChatOptions = { input: process.stdin, output: process.stdout }
): Promise<void> {
  const { input, output } = options;
  const rl = createInterface({ input, output });

  const context: ChatContext = {
    commits: data.incomingCommits,
    groups,
    localChanges: impactData.localChanges,
    conflicts: conflictPredictions,
    dashboardData: data
  };

  const conversationHistory: ChatMessage[] = [
    {
      role: "system",
      content: buildSystemPrompt(context)
    }
  ];

  output.write("\n");
  output.write("\x1b[36m┌─────────────────────────────────────────────────────\x1b[0m\n");
  output.write("\x1b[36m│\x1b[0m \x1b[1m💬 Git Catchup Chat Mode\x1b[0m\n");
  output.write("\x1b[36m├─────────────────────────────────────────────────────\x1b[0m\n");

  if (isAIEnabled()) {
    output.write("\x1b[36m│\x1b[0m AI: Connected\n");
    output.write("\x1b[36m│\x1b[0m Ask me anything about the incoming changes.\n");
  } else {
    output.write("\x1b[36m│\x1b[0m \x1b[33m⚠️  AI not configured\x1b[0m\n");
    output.write("\x1b[36m│\x1b[0m Run \x1b[1mgit-catchup\x1b[0m and follow the AI setup prompt to enable chat.\n");
  }

  output.write("\x1b[36m├─────────────────────────────────────────────────────\x1b[0m\n");
  output.write("\x1b[36m│\x1b[0m Commands: \x1b[2m--preview --isolate --resolve --test\x1b[0m\n");
  output.write("\x1b[36m│\x1b[0m Type \x1b[1m--suggest\x1b[0m for AI-powered suggestions\n");
  output.write("\x1b[36m│\x1b[0m Type \x1b[1mhelp\x1b[0m to see available commands\n");
  output.write("\x1b[36m│\x1b[0m Type \x1b[1mexit\x1b[0m to quit\n");
  output.write("\x1b[36m└─────────────────────────────────────────────────────\x1b[0m\n");
  output.write("\n");

  if (!isAIEnabled()) {
    output.write("Chat mode requires AI to be configured.\n");
    output.write("Configure AI by running: git catchup --configure\n");
    output.write("\nYou can still use command mode: --preview, --isolate, etc.\n");
    rl.close();
    return;
  }

  while (true) {
    try {
      const userInput = (await rl.question("\x1b[32mYou:\x1b[0m ")).trim();

      if (!userInput) {
        continue;
      }

      if (userInput.toLowerCase() === "exit" || userInput.toLowerCase() === "quit" || userInput.toLowerCase() === "q") {
        output.write("\n\x1b[36mGoodbye! Run \x1b[1mgit catchup\x1b[0m\x1b[36m anytime to return.\x1b[0m\n");
        break;
      }

      if (userInput.toLowerCase() === "help") {
        printHelp(output);
        continue;
      }

      if (userInput.toLowerCase() === "--suggest" || userInput.toLowerCase() === "suggest") {
        await printSuggestions(context, output);
        continue;
      }

      if (userInput.startsWith("--")) {
        output.write(`\x1b[33mCommand mode:\x1b[0m Run \x1b[1mgit catchup ${userInput}\x1b[0m to execute.\n`);
        output.write("Exit chat mode first with 'exit'.\n\n");
        continue;
      }

      output.write("\x1b[35mAI:\x1b[0m ");
      let fullResponse = "";

      try {
        conversationHistory.push({ role: "user", content: userInput });

        const response = await streamChat(conversationHistory, (chunk) => {
          output.write(chunk);
          fullResponse += chunk;
        });

        conversationHistory.push({ role: "assistant", content: fullResponse });

        if (conversationHistory.length > MAX_CONVERSATION_HISTORY * 2 + 1) {
          conversationHistory.splice(1, 2);
        }

        output.write("\n\n");
      } catch (error) {
        output.write(`\n\n\x1b[31mError: ${error instanceof Error ? error.message : "Unknown error"}\x1b[0m\n`);
        conversationHistory.pop();
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EOF") {
        output.write("\n\nExiting chat mode.\n");
        break;
      }
      output.write(`\n\x1b[31mError: ${error instanceof Error ? error.message : "Unknown error"}\x1b[0m\n`);
    }
  }

  rl.close();
}

function printHelp(output: NodeJS.WritableStream): void {
  output.write("\n");
  output.write("\x1b[36m┌─────────────────────────────────────────────────────\x1b[0m\n");
  output.write("\x1b[36m│\x1b[0m \x1b[1mAvailable Commands\x1b[0m\n");
  output.write("\x1b[36m├─────────────────────────────────────────────────────\x1b[0m\n");
  output.write("\x1b[36m│\x1b[0m \x1b[1mask a question\x1b[0m - Ask about the incoming changes\n");
  output.write("\x1b[36m│\x1b[0m \x1b[1m--preview\x1b[0m    - Preview risky file diffs (exit first)\n");
  output.write("\x1b[36m│\x1b[0m \x1b[1m--isolate\x1b[0m   - Pull safe commits first (exit first)\n");
  output.write("\x1b[36m│\x1b[0m \x1b[1m--resolve\x1b[0m   - Get conflict resolution help (exit first)\n");
  output.write("\x1b[36m│\x1b[0m \x1b[1m--test\x1b[0m      - Run affected tests (exit first)\n");
  output.write("\x1b[36m│\x1b[0m \x1b[1m--suggest\x1b[0m  - Get AI-powered command suggestions\n");
  output.write("\x1b[36m│\x1b[0m \x1b[1mhelp\x1b[0m       - Show this help message\n");
  output.write("\x1b[36m│\x1b[0m \x1b[1mclear\x1b[0m       - Clear conversation history\n");
  output.write("\x1b[36m│\x1b[0m \x1b[1mexit\x1b[0m       - Exit chat mode\n");
  output.write("\x1b[36m└─────────────────────────────────────────────────────\x1b[0m\n");
  output.write("\n");
}

async function printSuggestions(context: ChatContext, output: NodeJS.WritableStream): Promise<void> {
  output.write("\n\x1b[36m🤖 Generating suggestions based on your context...\x1b[0m\n");

  try {
    const suggestions = await getSuggestedCommands(context);

    output.write("\n");
    output.write("\x1b[36m┌─────────────────────────────────────────────────────\x1b[0m\n");
    output.write("\x1b[36m│\x1b[0m \x1b[1mRecommended Commands\x1b[0m\n");
    output.write("\x1b[36m├─────────────────────────────────────────────────────\x1b[0m\n");

    for (const cmd of suggestions) {
      output.write(`\x1b[36m│\x1b[0m \x1b[1m${cmd.command}\x1b[0m - ${cmd.description}\n`);
    }

    output.write("\x1b[36m├─────────────────────────────────────────────────────\x1b[0m\n");
    output.write("\x1b[36m│\x1b[0m Exit chat mode and run: \x1b[1mgit catchup <command>\x1b[0m\n");
    output.write("\x1b[36m└─────────────────────────────────────────────────────\x1b[0m\n");
    output.write("\n");
  } catch (error) {
    output.write(`\n\x1b[31mFailed to get suggestions: ${error instanceof Error ? error.message : "Unknown error"}\x1b[0m\n`);
  }
}

export async function promptEnterChatMode(input: NodeJS.ReadableStream, output: NodeJS.WritableStream): Promise<boolean> {
  if (!process.stdin.isTTY) {
    return false;
  }

  const rl = createInterface({ input, output });

  try {
    const answer = (await rl.question("\n\x1b[1mEnter chat mode? (Y/n): \x1b[0m")).trim().toLowerCase();
    return answer !== "n" && answer !== "no";
  } finally {
    rl.close();
  }
}
