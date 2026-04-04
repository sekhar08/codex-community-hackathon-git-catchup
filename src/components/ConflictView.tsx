import React from "react";
import { Box, Text } from "ink";

import type { ConflictPrediction } from "../commands/predict.js";

export interface ConflictViewProps {
  predictions: ConflictPrediction[];
}

export function ConflictView({ predictions }: ConflictViewProps): React.JSX.Element | null {
  if (predictions.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column">
      <Text color="red" bold>
        ⚠️ CONFLICT RISK:
      </Text>
      {predictions.map((prediction) => (
        <Text key={prediction.path}>
          <Text color={prediction.severity === "high" ? "red" : "yellow"}>• {prediction.path}</Text>
          <Text color="gray"> → </Text>
          <Text>{prediction.explanation}</Text>
        </Text>
      ))}
    </Box>
  );
}
