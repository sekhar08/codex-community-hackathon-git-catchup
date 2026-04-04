import "dotenv/config";

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import OpenAI from "openai";

import type { IncomingCommit } from "./git.js";
import type { CommitGroup } from "../commands/analyze.js";
import type { ConflictPrediction } from "../commands/predict.js";
import type { DashboardData } from "../commands/fetch.js";
import type { ImpactedLocalChange } from "../commands/impact.js";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatContext {
  commits: IncomingCommit[];
  groups: CommitGroup[];
  localChanges: ImpactedLocalChange[];
  conflicts: ConflictPrediction[];
  dashboardData: DashboardData;
}

export interface AISuggestedCommand {
  command: string;
  description: string;
}

export interface SmartCommitGroupSuggestion {
  emoji: string;
  title: string;
  commitHashes: string[];
}

export interface LLMClientInfo {
  enabled: boolean;
  provider: "Gemini" | "Groq" | "OpenAI" | null;
  model: string | null;
  displayModel: string | null;
  client: OpenAI | null;
  statusMessage: string;
  reason?: string;
}

interface ProviderConfig {
  provider: "Gemini" | "Groq" | "OpenAI";
  apiKeyEnv: string;
  modelEnv: string;
  defaultModel: string;
  displayModel: string;
  baseURL: string;
}

const PROVIDERS: ProviderConfig[] = [
  {
    provider: "OpenAI",
    apiKeyEnv: "OPENAI_API_KEY",
    modelEnv: "OPENAI_MODEL",
    defaultModel: "gpt-4o-mini",
    displayModel: "GPT-4o Mini",
    baseURL: "https://api.openai.com/v1"
  },
  {
    provider: "Gemini",
    apiKeyEnv: "GEMINI_API_KEY",
    modelEnv: "GEMINI_MODEL",
    defaultModel: "gemini-2.5-flash",
    displayModel: "Gemini 2.5 Flash",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/"
  },
  {
    provider: "Groq",
    apiKeyEnv: "GROQ_API_KEY",
    modelEnv: "GROQ_MODEL",
    defaultModel: "llama-3.3-70b-versatile",
    displayModel: "Llama 3.3 70B Versatile",
    baseURL: "https://api.groq.com/openai/v1"
  },
];

let cachedClientInfo: LLMClientInfo | null = null;

export type AIProvider = ProviderConfig["provider"];

export function isAIEnabled(): boolean {
  return getLLMClient().enabled;
}

export function getLLMClient(): LLMClientInfo {
  if (cachedClientInfo) {
    return cachedClientInfo;
  }

  for (const config of PROVIDERS) {
    const apiKey = process.env[config.apiKeyEnv];

    if (!apiKey) {
      continue;
    }

    const model = process.env[config.modelEnv] || config.defaultModel;

    cachedClientInfo = {
      enabled: true,
      provider: config.provider,
      model,
      displayModel: config.displayModel,
      client: new OpenAI({
        apiKey,
        baseURL: config.baseURL
      }),
      statusMessage: `✨ AI enabled • ${config.displayModel}`
    };

    return cachedClientInfo;
  }

  cachedClientInfo = {
    enabled: false,
    provider: null,
    model: null,
    displayModel: null,
    client: null,
    reason: "Set OPENAI_API_KEY=... for smarter AI grouping",
    statusMessage: "Set OPENAI_API_KEY=... for smarter AI grouping"
  };

  return cachedClientInfo;
}

export function resetLLMClientCache(): void {
  cachedClientInfo = null;
}

export function getSupportedProviders(): Array<{
  provider: AIProvider;
  displayModel: string;
}> {
  return PROVIDERS.map((provider) => ({
    provider: provider.provider,
    displayModel: provider.displayModel
  }));
}

export function saveProjectAIConfig(
  projectRoot: string,
  provider: AIProvider,
  apiKey: string
): void {
  const selected = PROVIDERS.find((entry) => entry.provider === provider);

  if (!selected) {
    throw new Error(`Unsupported AI provider: ${provider}`);
  }

  const envPath = join(projectRoot, ".env");
  const existing = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  const lines = existing.length > 0 ? existing.split(/\r?\n/) : [];
  const managedKeys = new Set(PROVIDERS.flatMap((entry) => [entry.apiKeyEnv, entry.modelEnv]));
  const preserved = lines.filter((line) => {
    const key = line.split("=")[0]?.trim();
    return key && !managedKeys.has(key);
  });
  const nextLines = [
    ...preserved.filter((line) => line.length > 0),
    `${selected.apiKeyEnv}=${apiKey}`,
    `${selected.modelEnv}=${selected.defaultModel}`
  ];
  const content = `${nextLines.join("\n")}\n`;

  writeFileSync(envPath, content, "utf8");

  for (const entry of PROVIDERS) {
    delete process.env[entry.apiKeyEnv];
    delete process.env[entry.modelEnv];
  }

  process.env[selected.apiKeyEnv] = apiKey;
  process.env[selected.modelEnv] = selected.defaultModel;

  resetLLMClientCache();
}

export async function smartGroupCommits(
  commits: IncomingCommit[],
  userFiles: string[]
): Promise<SmartCommitGroupSuggestion[]> {
  const parsed = await requestStructuredJson<{ groups?: Array<Record<string, unknown>> }>(
    "You group git commits for a terminal UI. Return strict JSON only with a top-level object containing a groups array. Each group must contain emoji, title, and commitHashes.",
    {
      task: "Group incoming commits into user-friendly features. Prefer feature-oriented names, keep related commits together, and highlight areas touching user files.",
      userFiles,
      commits: commits.map((commit) => ({
        hash: commit.hash,
        message: commit.message,
        files: commit.files
      }))
    }
  );
  const hashes = new Set(commits.map((commit) => commit.hash));

  return (Array.isArray(parsed.groups) ? parsed.groups : [])
    .map((group) => ({
      emoji: typeof group.emoji === "string" ? group.emoji : "📁",
      title: typeof group.title === "string" ? group.title : "General updates",
      commitHashes: Array.isArray(group.commitHashes)
        ? group.commitHashes.filter((value): value is string => typeof value === "string" && hashes.has(value))
        : []
    }))
    .filter((group) => group.commitHashes.length > 0);
}

export async function requestStructuredJson<T>(systemPrompt: string, payload: unknown): Promise<T> {
  const clientInfo = getLLMClient();

  if (!clientInfo.enabled || !clientInfo.client || !clientInfo.model) {
    throw new Error(clientInfo.reason ?? "AI is not configured.");
  }

  const response = await clientInfo.client.chat.completions.create({
    model: clientInfo.model,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: `${systemPrompt} Return JSON only. Do not include markdown fences.`
      },
      {
        role: "user",
        content: JSON.stringify(payload)
      }
    ]
  });

  const content = response.choices[0]?.message?.content;

  if (!content) {
    throw new Error("AI returned an empty response.");
  }

  return parseJsonResponse(content) as T;
}

function parseJsonResponse(content: string): unknown {
  const normalized = content
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");

  return JSON.parse(normalized);
}

export async function streamChat(
  messages: ChatMessage[],
  onChunk: (text: string) => void
): Promise<string> {
  const clientInfo = getLLMClient();

  if (!clientInfo.enabled || !clientInfo.client || !clientInfo.model) {
    throw new Error("AI is not configured. Run 'git catchup --configure' to set up AI.");
  }

  const stream = await clientInfo.client.chat.completions.create({
    model: clientInfo.model ?? "gpt-4o-mini",
    temperature: 0.7,
    messages: messages.map((msg) => ({
      role: msg.role,
      content: msg.content
    })),
    stream: true,
    stream_options: { include_usage: true }
  });

  let fullResponse = "";

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;

    if (content) {
      fullResponse += content;
      onChunk(content);
    }
  }

  return fullResponse;
}

export function buildSystemPrompt(context: ChatContext): string {
  const { commits, groups, localChanges, conflicts, dashboardData } = context;

  const riskyFiles = conflicts.map((c) => c.path);
  const localFileNames = localChanges.map((c) => c.path);

  let prompt = `You are Git Catchup Assistant, helping a developer understand and safely merge ${dashboardData.commitCount} incoming commits from ${dashboardData.targetBranch} into their branch (${dashboardData.branch}).

`;

  if (groups.length > 0) {
    prompt += `INCOMING CHANGES (grouped by feature):
${groups.map((g) => `  ${g.emoji} ${g.title} (${g.count} commits)${g.isRisky ? " ⚠️" : ""}`).join("\n")}

`;
  }

  if (riskyFiles.length > 0) {
    prompt += `CONFLICT RISK: These files are modified locally AND changed in incoming commits:
  ${riskyFiles.join(", ")}

`;
  }

  if (localChanges.length > 0) {
    prompt += `LOCAL UNCOMMITTED CHANGES:
${localChanges.map((c) => `  ${c.path} (${c.status})`).join("\n")}

`;
  }

  if (commits.length > 0) {
    const sampleCommits = commits.slice(0, 10);
    prompt += `SAMPLE COMMITS (showing recent ones):
${sampleCommits.map((c) => `  ${c.hash.slice(0, 7)}: ${c.message}`).join("\n")}
${commits.length > 10 ? `  ... and ${commits.length - 10} more commits\n` : ""}
`;
  }

  prompt += `
Your role is to help the developer:
1. Understand what changed while they were away
2. Prioritize what to review first
3. Identify potential merge conflicts and how to resolve them
4. Suggest git commands to safely catch up

Be concise, actionable, and focus on what matters most.`;

  return prompt;
}

export async function getSuggestedCommands(context: ChatContext): Promise<AISuggestedCommand[]> {
  const clientInfo = getLLMClient();

  if (!clientInfo.enabled || !clientInfo.client) {
    return getDefaultCommands(context);
  }

  try {
    const response = await clientInfo.client.chat.completions.create({
      model: clientInfo.model ?? "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: `Based on the git catchup context provided, suggest 3-4 most relevant git-catchup commands for the user to run. Return JSON only with an object containing a "commands" array. Each command must have "command" (git-catchup flag like "--preview", "--isolate", "--resolve", "--test") and "description" (brief explanation in 5-10 words).

Example output: {"commands": [{"command": "--preview", "description": "See risky file diffs"}, {"command": "--isolate", "description": "Pull safe commits first"}]}`
        },
        {
          role: "user",
          content: JSON.stringify({
            branch: context.dashboardData.branch,
            targetBranch: context.dashboardData.targetBranch,
            commitCount: context.dashboardData.commitCount,
            localChanges: context.localChanges.map((c) => c.path),
            conflicts: context.conflicts.map((c) => ({ path: c.path, reason: c.explanation })),
            groups: context.groups.map((g) => ({ title: g.title, count: g.count, risky: g.isRisky }))
          })
        }
      ]
    });

    const content = response.choices[0]?.message?.content;

    if (!content) {
      return getDefaultCommands(context);
    }

    const parsed = JSON.parse(content.replace(/^```json\s*/i, "").replace(/\s*```$/i, ""));

    if (Array.isArray(parsed.commands)) {
      return parsed.commands.slice(0, 4) as AISuggestedCommand[];
    }

    return getDefaultCommands(context);
  } catch {
    return getDefaultCommands(context);
  }
}

function getDefaultCommands(context: ChatContext): AISuggestedCommand[] {
  const commands: AISuggestedCommand[] = [
    { command: "--preview", description: "See risky file diffs" },
    { command: "--isolate", description: "Pull safe commits first" }
  ];

  if (context.conflicts.length > 0) {
    commands.push({ command: "--resolve", description: "Guided conflict resolution" });
  }

  commands.push({ command: "--test", description: "Run affected tests" });

  return commands;
}
