import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "ink";

import { Dashboard } from "./Dashboard.js";
import {
  buildWorkspaceModel,
  createInitialWorkspaceState,
  workspaceReducer
} from "./workspace.js";
import type { DashboardData } from "../commands/fetch.js";
import type { CommitGroup } from "../commands/analyze.js";
import type { ImpactAnalysisResult } from "../commands/impact.js";
import type { ConflictPrediction } from "../commands/predict.js";

const data: DashboardData = {
  branch: "feature/reconnect",
  upstream: "origin/feature/reconnect",
  targetBranch: "origin/main",
  commitCount: 7,
  daysOfChanges: 5,
  timeSpanLabel: "5 days",
  incomingCommits: [
    {
      hash: "abcdef1",
      message: "feat: improve notification batching",
      date: "2026-04-03",
      files: ["src/notifications/worker.ts"]
    }
  ],
  fetchChangedRefs: true,
  preview: false
};

const groups: CommitGroup[] = [
  {
    emoji: "🔔",
    title: "Notifications",
    count: 4,
    files: ["src/notifications/worker.ts", "src/notifications/ui.ts"],
    isRisky: true,
    riskyFiles: ["src/notifications/worker.ts"]
  },
  {
    emoji: "📦",
    title: "Dependencies",
    count: 3,
    files: ["package-lock.json"],
    isRisky: false
  }
];

const impactData: ImpactAnalysisResult = {
  localChanges: [
    {
      path: "src/notifications/worker.ts",
      status: "modified",
      message: "Incoming overlap: feat: improve notification batching"
    }
  ],
  riskyCommits: new Set(["abcdef1"]),
  impactedFiles: new Map([["src/notifications/worker.ts", ["feat: improve notification batching"]]]),
  impactedCommits: new Map([
    [
      "src/notifications/worker.ts",
      [
        {
          hash: "abcdef1",
          message: "feat: improve notification batching",
          date: "2026-04-03",
          files: ["src/notifications/worker.ts"]
        }
      ]
    ]
  ])
};

const conflicts: ConflictPrediction[] = [
  {
    path: "src/notifications/worker.ts",
    severity: "high",
    explanation: "Local edits overlap with upstream batching changes.",
    localContext: "modified locally",
    incomingContext: "feat: improve notification batching",
    source: "heuristic"
  }
];

test("buildWorkspaceModel derives risk summary and action availability", () => {
  const model = buildWorkspaceModel(data, groups, impactData, conflicts, false);

  assert.equal(model.summary.riskyGroups, 1);
  assert.equal(model.summary.safeGroups, 1);
  assert.equal(model.actions.find((action) => action.id === "preview")?.disabled, false);
  assert.equal(model.actions.find((action) => action.id === "ask-ai")?.disabled, true);
  assert.match(model.summary.recommendation, /preview/i);
});

test("workspaceReducer navigates sections and command palette state", () => {
  const model = buildWorkspaceModel(data, groups, impactData, conflicts, true);
  let state = createInitialWorkspaceState(model, "✨ AI enabled • GPT-4o Mini");

  state = workspaceReducer(state, { type: "section_delta", delta: 1 }, model);
  assert.equal(state.activeSection, "incoming");

  state = workspaceReducer(state, { type: "item_delta", delta: 1 }, model);
  assert.equal(state.selectedIndices.incoming, 1);

  state = workspaceReducer(state, { type: "open_commands" }, model);
  assert.equal(state.panel, "commands");

  state = workspaceReducer(state, { type: "command_delta", delta: 3 }, model);
  assert.equal(state.commandIndex, 3);
});

test("Dashboard renders the interactive workspace shell", () => {
  const output = renderToString(
    <Dashboard
      data={data}
      groups={groups}
      impactData={impactData}
      conflictPredictions={conflicts}
      aiStatus="Set OPENAI_API_KEY=... for smarter AI grouping"
      actions={{
        preview: async () => ({
          title: "Preview",
          summary: "Preview ready",
          tone: "info",
          lines: ["diff --git a/example b/example"]
        }),
        isolate: async () => ({
          title: "Isolate",
          summary: "Applied safe commits",
          tone: "success",
          lines: ["Applied 2 safe commits."]
        }),
        resolve: async () => ({
          title: "Resolve",
          summary: "Conflict guidance ready",
          tone: "warning",
          lines: ["Review src/notifications/worker.ts"]
        }),
        test: async () => ({
          title: "Test",
          summary: "Tests completed",
          tone: "success",
          lines: ["npm test"]
        })
      }}
    />
  );

  assert.match(output, /Git Catchup/);
  assert.match(output, /Post-Holiday Merge Assistant/);
  assert.match(output, /📦 GROUPED BY FEATURE:/);
  assert.match(output, /⚠️ YOUR LOCAL CHANGES:/);
  assert.match(output, /⚠️ CONFLICT RISK:/);
  assert.match(output, /🎯 RECOMMENDED ACTIONS:/);
});
