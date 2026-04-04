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

const boxWidth = 36;
const divider = "─".repeat(boxWidth);
const actionDivider = "─────────────────────────────────";

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

  const commitLabel = data.commitCount === 1 ? "1 commit on main" : `${data.commitCount} commits on main`;

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
          <Text color="gray">Preview mode enabled. Showing risky-file diff workflow.</Text>
          <Newline />
        </>
      ) : null}

      <Text color={aiStatus.startsWith("✨") ? "magentaBright" : "gray"}>{aiStatus}</Text>
      <Newline />

      <Text color="cyan">
        📍 {data.branch} <Text color="gray">→</Text> {data.targetBranch}
        {data.upstream ? <Text color="gray"> • upstream {data.upstream}</Text> : null}
      </Text>
      <Text>
        <Text color="blueBright">📅</Text>
        <Text> </Text>
        <Text bold>{data.timeSpanLabel} of changes</Text>
        <Text color="gray"> | </Text>
        <Text bold>{commitLabel}</Text>
      </Text>
      <Text color="gray">{divider}</Text>
      <Newline />

      <Text color="cyan" bold>
        📦 GROUPED BY FEATURE:
      </Text>
      {groups.length === 0 ? (
        <Text color="green">└── No incoming commits detected.</Text>
      ) : (
        groups.map((group, index) => (
          <CommitGroup key={`${group.title}:${group.count}`} group={group} isLast={index === groups.length - 1} />
        ))
      )}

      <Text color="gray">{divider}</Text>
      <Newline />

      <Text color="yellow" bold>
        ⚠️ YOUR LOCAL CHANGES:
      </Text>
      {impactData.localChanges.length === 0 ? (
        <Text color="green">No uncommitted files detected.</Text>
      ) : (
        impactData.localChanges.map((change) => (
          <Text key={`${change.path}:${change.status}`}>
            <Text>{change.path}</Text>
            <Text color="gray"> ({change.status})</Text>
            <Text color="gray"> → </Text>
            <Text color={impactData.impactedFiles.get(change.path)?.length ? "yellow" : "green"}>
              "{change.message ?? "Local change"}"
            </Text>
          </Text>
        ))
      )}

      <Newline />

      <ConflictView predictions={conflictPredictions} />

      <Text color="green">
        {data.fetchChangedRefs
          ? "✅ Fetched latest changes from remote."
          : "✅ Fetch completed. Remote refs were already current."}
      </Text>

      {data.commitCount === 0 ? <Text color="green">✅ Already up to date with the selected branch.</Text> : null}

      <Newline />
      <Text color="cyan" bold>
        🎯 RECOMMENDED ACTIONS:
      </Text>
      <Text color="gray">{actionDivider}</Text>
      <Text>git catchup --preview → See full diff before merging</Text>
      <Text>git catchup --isolate → Pull safe commits first</Text>
      <Text>git catchup --resolve → Guided conflict resolution</Text>
      <Text>git catchup --test → Run relevant tests automatically</Text>
      <Text color="gray">{actionDivider}</Text>
      <Newline />
      <Text color="gray">git-catchup v0.1.0</Text>
    </Box>
  );
}
