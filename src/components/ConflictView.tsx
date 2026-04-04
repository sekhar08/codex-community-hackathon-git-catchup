import React from "react";
import { Box, Newline, Text } from "ink";

import type { ConflictPrediction } from "../commands/predict.js";

export interface ConflictViewProps {
  predictions: ConflictPrediction[];
}

export function ConflictView({ predictions }: ConflictViewProps): React.JSX.Element | null {
  if (predictions.length === 0) {
    return null;
  }

  const highRiskCount = predictions.filter((p) => p.severity === "high").length;
  const mediumRiskCount = predictions.filter((p) => p.severity === "medium").length;

  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        <Text color="red" bold>
          ⚠️ CONFLICT RISK
        </Text>
        <Text color="gray"> ({predictions.length} {predictions.length === 1 ? "file" : "files"})</Text>
      </Box>
      <Text color="gray">────────────────────────────────────────</Text>

      {highRiskCount > 0 && (
        <Box flexDirection="row" marginY={0}>
          <Text color="red">🔥 HIGH RISK: {highRiskCount}</Text>
        </Box>
      )}
      {mediumRiskCount > 0 && (
        <Box flexDirection="row" marginY={0}>
          <Text color="yellow">⚡ MEDIUM RISK: {mediumRiskCount}</Text>
        </Box>
      )}

      <Newline />

      {predictions.map((prediction) => (
        <Box
          key={prediction.path}
          flexDirection="column"
          borderStyle="round"
          borderColor={prediction.severity === "high" ? "red" : "yellow"}
          paddingX={1}
          paddingY={0}
          marginBottom={1}
        >
          <Box flexDirection="row">
            <Text color={prediction.severity === "high" ? "red" : "yellow"} bold>
              {prediction.severity === "high" ? "🔥" : "⚡"}
            </Text>
            <Text color={prediction.severity === "high" ? "red" : "yellow"} bold>
              {" "}
              {prediction.severity === "high" ? "HIGH RISK" : "REVIEW RECOMMENDED"}
            </Text>
            <Text color="gray"> | </Text>
            <Text color="white">{prediction.path}</Text>
          </Box>

          <Newline />

          <Box flexDirection="column" marginLeft={2}>
            <Text color="white" italic>
              {prediction.explanation}
            </Text>

            <Newline />

            <Box flexDirection="row">
              <Text color="gray">📍 Local: </Text>
              <Text color="yellow" dimColor>
                {prediction.localContext}
              </Text>
            </Box>
            <Box flexDirection="row">
              <Text color="gray">📥 Incoming: </Text>
              <Text color="cyan" dimColor>
                {prediction.incomingContext}
              </Text>
            </Box>
          </Box>

          <Newline />

          <Box flexDirection="row">
            <Text color={prediction.source === "ai" ? "magentaBright" : "gray"}>
              {prediction.source === "ai" ? "🤖 AI-assisted" : "🔧 Heuristic"}-powered explanation
            </Text>
          </Box>
        </Box>
      ))}
    </Box>
  );
}
