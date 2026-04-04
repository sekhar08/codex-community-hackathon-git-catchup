import React from "react";
import { Box, Newline, Spacer, Text } from "ink";

import { CommitGroup } from "./CommitGroup.js";
import { ConflictView } from "./ConflictView.js";
import type { CommitGroup as CommitGroupData } from "../commands/analyze.js";
import type { DashboardData } from "../commands/fetch.js";
import type { ImpactAnalysisResult } from "../commands/impact.js";
import type { ConflictPrediction } from "../commands/predict.js";

export interface DashboardProps {
  data: DashboardData;
  groups: CommitGroupData[];
  impactData: ImpactAnalysisResult;
  conflictPredictions: ConflictPrediction[];
  aiStatus: string;
  onExit?: () => void;
}

const fullWidth = 68;
const divider = "━".repeat(fullWidth);

const statusColors: Record<string, string> = {
  modified: "red",
  added: "yellow",
  renamed: "blue",
  deleted: "red",
  untracked: "gray",
  changed: "yellow"
};

const statusEmojis: Record<string, string> = {
  modified: "🔴",
  added: "🟡",
  renamed: "🔵",
  deleted: "🗑️",
  untracked: "⬜",
  changed: "🟡"
};

export function Dashboard({
  data,
  groups,
  impactData,
  conflictPredictions,
  aiStatus,
  onExit
}: DashboardProps): React.JSX.Element {
  React.useEffect(() => {
    if (onExit) {
      const timer = setTimeout(() => {
        onExit();
      }, 0);

      return () => {
        clearTimeout(timer);
      };
    }
  }, [onExit]);

  const commitLabel = data.commitCount === 1 ? "1 commit" : `${data.commitCount} commits`;

  return (
    <Box flexDirection="column">
      <Newline />

      <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
        <Text color="cyanBright" bold>
          🪼 git-catchup
        </Text>
        <Text color="white" dimColor>
          Post-Holiday Merge Assistant
        </Text>
      </Box>

      <Newline />

      <Text color={aiStatus.startsWith("✨") ? "magentaBright" : "gray"}>{aiStatus}</Text>

      <Newline />
      <Text color="gray">{divider}</Text>

      <Box flexDirection="row" marginY={0}>
        <Text color="cyan">📍 </Text>
        <Text bold>
          <Text color="white">{data.branch}</Text>
          <Text color="gray"> → </Text>
          <Text color="cyan">{data.targetBranch}</Text>
        </Text>
        {data.upstream ? (
          <Text color="gray"> • upstream: {data.upstream}</Text>
        ) : null}
      </Box>

      <Box flexDirection="row" marginY={0}>
        <Text color="blueBright">📊 </Text>
        <Text bold>{data.timeSpanLabel}</Text>
        <Text color="gray"> | </Text>
        <Text bold>{commitLabel}</Text>
        <Text color="gray"> on main</Text>
      </Box>

      <Text color="gray">{divider}</Text>
      <Newline />

      <Box flexDirection="row">
        <Text color="cyan" bold>
          📦 GROUPED BY FEATURE
        </Text>
        <Text color="gray"> ({groups.length} groups)</Text>
      </Box>
      <Text color="gray">────────────────────────────────────────</Text>
      {groups.length === 0 ? (
        <Text color="green">└── ✨ All caught up! No incoming commits.</Text>
      ) : (
        groups.map((group, index) => (
          <CommitGroup key={`${group.title}:${group.count}`} group={group} isLast={index === groups.length - 1} />
        ))
      )}

      <Text color="gray">{divider}</Text>
      <Newline />

      <Box flexDirection="row">
        <Text color="yellow" bold>
          📋 YOUR LOCAL CHANGES
        </Text>
        <Text color="gray"> ({impactData.localChanges.length} files)</Text>
      </Box>
      <Text color="gray">────────────────────────────────────────</Text>
      {impactData.localChanges.length === 0 ? (
        <Text color="green">└── ✨ No uncommitted files. Clean working tree!</Text>
      ) : (
        <Box flexDirection="column">
          {impactData.localChanges.map((change) => {
            const emoji = statusEmojis[change.status] ?? "📄";
            const color = statusColors[change.status] ?? "white";
            const hasConflict = (impactData.impactedFiles.get(change.path) ?? []).length > 0;

            return (
              <Box key={`${change.path}:${change.status}`} flexDirection="row">
                <Text color="gray">├── </Text>
                <Text color={color}>{emoji} </Text>
                <Text color={color}>{change.status.padEnd(10)}</Text>
                <Text> {change.path}</Text>
                {hasConflict ? (
                  <Text color="red"> ⚠️</Text>
                ) : (
                  <Text color="green"> ✓</Text>
                )}
              </Box>
            );
          })}
        </Box>
      )}

      <Newline />

      <ConflictView predictions={conflictPredictions} />

      <Text color="green">
        {data.fetchChangedRefs
          ? "✅ Fetched latest changes from remote."
          : "✅ Remote refs already current."}
      </Text>

      {data.commitCount === 0 ? <Text color="green">✅ Already up to date!</Text> : null}

      <Newline />
      <Text color="gray">{divider}</Text>

      <Box flexDirection="column">
        <Text color="cyan" bold>
          🚀 QUICK ACTIONS
        </Text>
        <Box flexDirection="row" marginY={0}>
          <Box flexDirection="row" gap={1}>
            <Text color="cyan" dimColor>
              ┌─────────────┐┌─────────────┐┌─────────────┐┌─────────────┐
            </Text>
          </Box>
        </Box>
        <Box flexDirection="row" gap={1}>
          <Text color="cyan">│</Text>
          <Text color="cyanBright" bold>
            /preview
          </Text>
          <Text color="cyan">│</Text>
          <Text color="cyanBright" bold>
            /isolate
          </Text>
          <Text color="cyan">│</Text>
          <Text color="cyanBright" bold>
            /resolve
          </Text>
          <Text color="cyan">│</Text>
          <Text color="cyanBright" bold>
            /test
          </Text>
          <Text color="cyan">│</Text>
        </Box>
        <Box flexDirection="row">
          <Text color="cyan" dimColor>
            └─────────────┘└─────────────┘└─────────────┘└─────────────┘
          </Text>
        </Box>
      </Box>

      <Newline />
      <Text color="gray" dimColor>
        💬 Type <Text bold>"chat"</Text> or <Text bold>"ask"</Text> to talk with AI about these changes
      </Text>

      <Newline />
      <Text color="gray">{divider}</Text>
      <Text color="gray" dimColor>
        git-catchup v0.1.0 • Run <Text bold>"git catchup --help"</Text> for more options
      </Text>
    </Box>
  );
}
