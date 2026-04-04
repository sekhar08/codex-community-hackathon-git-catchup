import React from "react";
import { Box, Newline, Spacer, Text, useApp } from "ink";

import type { DashboardData } from "../commands/fetch.js";

export interface DashboardProps {
  data: DashboardData;
}

const boxWidth = 36;
const divider = "─".repeat(boxWidth);

export function Dashboard({ data }: DashboardProps): React.JSX.Element {
  const { exit } = useApp();

  React.useEffect(() => {
    const timer = setTimeout(() => {
      exit();
    }, 0);

    return () => {
      clearTimeout(timer);
    };
  }, [exit]);

  const dayLabel = data.daysOfChanges === 1 ? "1 day of changes" : `${data.daysOfChanges} days of changes`;
  const commitLabel = data.commitCount === 1 ? "1 commit on target" : `${data.commitCount} commits on target`;
  const localChangeLabel =
    data.localChanges.length === 1
      ? "📦 Your local changes (1 file):"
      : `📦 Your local changes (${data.localChanges.length} files):`;

  return (
    <Box flexDirection="column">
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="cyan"
        paddingX={1}
        width={boxWidth}
        alignSelf="flex-start"
      >
        <Box>
          <Text color="cyanBright" bold>
            Git Catchup
          </Text>
          <Spacer />
        </Box>
        <Text color="white">Post-Holiday Merge Assistant</Text>
      </Box>

      <Newline />

      {data.preview ? (
        <>
          <Text color="gray">Preview mode enabled. Phase 0 does not change behavior yet.</Text>
          <Newline />
        </>
      ) : null}

      <Text>
        <Text color="blueBright">📅</Text>
        <Text> </Text>
        <Text bold>{dayLabel}</Text>
        <Text color="gray"> | </Text>
        <Text bold>{commitLabel}</Text>
      </Text>
      <Text color="gray">{divider}</Text>
      <Text>
        <Text color="cyan">📍 Current branch:</Text>
        <Text> {data.branch}</Text>
      </Text>
      <Text>
        <Text color="cyan">🔄 Upstream:</Text>
        <Text> {data.upstream ?? "No upstream configured"}</Text>
      </Text>
      <Text>
        <Text color="cyan">🎯 Comparing against:</Text>
        <Text> {data.targetBranch}</Text>
      </Text>

      <Newline />

      {data.localChanges.length === 0 ? (
        <>
          <Text color="green">📦 Your local changes: none</Text>
          <Newline />
        </>
      ) : (
        <>
          <Text color="yellow">{localChangeLabel}</Text>
          {data.localChanges.map((change) => (
            <Text key={`${change.path}:${change.state}`}>
              <Text color="gray">•</Text>
              <Text> {change.path} </Text>
              <Text color="gray">({change.state})</Text>
            </Text>
          ))}
          <Newline />
        </>
      )}

      <Text color="green">
        {data.fetchChangedRefs
          ? "✅ Fetched latest changes from remote."
          : "✅ Fetch completed. Remote refs were already current."}
      </Text>

      {data.commitCount === 0 ? <Text color="green">✅ Already up to date with the selected branch.</Text> : null}
    </Box>
  );
}
