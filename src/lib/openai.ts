import "dotenv/config";

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import OpenAI from "openai";

import type { IncomingCommit } from "./git.js";

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
