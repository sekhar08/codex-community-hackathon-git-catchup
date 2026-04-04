import React from "react";
import { Box, Text } from "ink";

import type { CommitGroup as CommitGroupData } from "../commands/analyze.js";

export interface CommitGroupProps {
  group: CommitGroupData;
  isLast?: boolean;
}

export function CommitGroup({ group, isLast = false }: CommitGroupProps): React.JSX.Element {
  const branchPrefix = isLast ? "└──" : "├──";
  const detailPrefix = isLast ? "    └──" : "│   └──";
  const accentColor = group.isRisky ? "red" : "green";
  const riskyFile = group.riskyFiles?.[0];

  return (
    <Box flexDirection="column">
      <Text color={accentColor}>
        <Text color="gray">{branchPrefix} </Text>
        {group.isRisky ? (
          <>
            <Text color="red">🔥 Hot:</Text>
            <Text> {group.title}</Text>
          </>
        ) : (
          <>
            <Text>{group.emoji}</Text>
            <Text> {group.title}</Text>
          </>
        )}
        <Text color="gray"> ({group.count} commits)</Text>
      </Text>

      {riskyFile ? (
        <Text color="yellow">
          <Text color="gray">{detailPrefix} </Text>
          <Text>Changes: {riskyFile}</Text>
          <Text color="red"> {" ← YOUR FILE (conflict likely)"}</Text>
        </Text>
      ) : group.files[0] ? (
        <Text color="gray">
          <Text>{detailPrefix} </Text>
          <Text>Changes: {group.files[0]}</Text>
          <Text color="green"> {" (safe to pull)"}</Text>
        </Text>
      ) : null}
    </Box>
  );
}
