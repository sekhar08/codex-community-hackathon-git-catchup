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
  const riskyFile = group.riskyFiles?.[0];
  const commitLabel = group.count === 1 ? "1 commit" : `${group.count} commits`;

  return (
    <Box flexDirection="column" marginY={0}>
      <Box flexDirection="row">
        <Text color="gray">{branchPrefix} </Text>
        {group.isRisky ? (
          <>
            <Text color="red">🔥 </Text>
            <Text color="red" bold>
              Hot:
            </Text>
            <Text color="white"> {group.title}</Text>
            <Text color="gray"> ({commitLabel})</Text>
          </>
        ) : (
          <>
            <Text>{group.emoji}</Text>
            <Text color="white"> {group.title}</Text>
            <Text color="gray"> ({commitLabel})</Text>
          </>
        )}
      </Box>

      {riskyFile ? (
        <Box flexDirection="column">
          <Text color="gray">{detailPrefix} </Text>
          <Box flexDirection="row">
            <Text color="gray">    └── </Text>
            <Text color="yellow">📁 {riskyFile}</Text>
          </Box>
          <Box flexDirection="row">
            <Text color="gray">        └── </Text>
            <Text color="red" bold>
              ⚠️ CONFLICT LIKELY
            </Text>
            <Text color="gray"> - overlaps with your local changes</Text>
          </Box>
        </Box>
      ) : group.files[0] ? (
        <Box flexDirection="row">
          <Text color="gray">{detailPrefix} </Text>
          <Text color="yellow">📁 {group.files[0]}</Text>
          {group.files.length > 1 ? (
            <Text color="gray"> +{group.files.length - 1} more</Text>
          ) : null}
          <Text color="green"> ✓</Text>
        </Box>
      ) : null}
    </Box>
  );
}
