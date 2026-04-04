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
  client: OpenAI | null;
  reason?: string;
}

interface ProviderConfig {
  provider: "Gemini" | "Groq" | "OpenAI";
  apiKeyEnv: string;
  modelEnv?: string;
  defaultModel?: string;
  baseURL: string;
}

const PROVIDERS: ProviderConfig[] = [
  {
    provider: "Gemini",
    apiKeyEnv: "GEMINI_API_KEY",
    modelEnv: "GEMINI_MODEL",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/"
  },
  {
    provider: "Groq",
    apiKeyEnv: "GROQ_API_KEY",
    modelEnv: "GROQ_MODEL",
    baseURL: "https://api.groq.com/openai/v1"
  },
  {
    provider: "OpenAI",
    apiKeyEnv: "OPENAI_API_KEY",
    modelEnv: "OPENAI_MODEL",
    defaultModel: "gpt-4o-mini",
    baseURL: "https://api.openai.com/v1"
  }
];

export function isAIEnabled(): boolean {
  return getLLMClient().enabled;
}

export function getLLMClient(): LLMClientInfo {
  for (const config of PROVIDERS) {
    const apiKey = process.env[config.apiKeyEnv];

    if (!apiKey) {
      continue;
    }

    const model = process.env[config.modelEnv ?? ""] ?? config.defaultModel;

    if (!model) {
      return {
        enabled: false,
        provider: config.provider,
        model: null,
        client: null,
        reason: `${config.provider} detected, but ${config.modelEnv} is not set.`
      };
    }

    return {
      enabled: true,
      provider: config.provider,
      model,
      client: new OpenAI({
        apiKey,
        baseURL: config.baseURL
      })
    };
  }

  return {
    enabled: false,
    provider: null,
    model: null,
    client: null,
    reason: "No AI provider key configured."
  };
}

export async function smartGroupCommits(
  commits: IncomingCommit[],
  userFiles: string[]
): Promise<SmartCommitGroupSuggestion[]> {
  const clientInfo = getLLMClient();

  if (!clientInfo.enabled || !clientInfo.client || !clientInfo.model) {
    throw new Error(clientInfo.reason ?? "AI grouping is not configured.");
  }

  const payload = commits.map((commit) => ({
    hash: commit.hash,
    message: commit.message,
    files: commit.files
  }));

  const response = await clientInfo.client.chat.completions.create({
    model: clientInfo.model,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "You group git commits for a terminal UI. Return strict JSON only with a top-level object containing a groups array. Each group must contain emoji, title, and commitHashes."
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "Group incoming commits into user-friendly features. Prefer feature-oriented names, keep related commits together, and highlight areas touching user files.",
          userFiles,
          commits: payload
        })
      }
    ]
  });

  const content = response.choices[0]?.message?.content;

  if (!content) {
    throw new Error("AI grouping returned an empty response.");
  }

  const parsed = parseJsonResponse(content);
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

function parseJsonResponse(content: string): { groups?: Array<Record<string, unknown>> } {
  const normalized = content
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");

  return JSON.parse(normalized) as { groups?: Array<Record<string, unknown>> };
}
