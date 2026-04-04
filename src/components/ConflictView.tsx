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

  return (
    <Box flexDirection="column">
      <Text color="red" bold>
        ⚠️ CONFLICT RISK:
      </Text>
      {predictions.map((prediction) => (
        <Box key={prediction.path} flexDirection="column" marginTop={1}>
          <Text color={prediction.severity === "high" ? "red" : "yellow"}>
            • {prediction.path} {prediction.severity === "high" ? "(high risk)" : "(review recommended)"}
          </Text>
          <Text>{prediction.explanation}</Text>
          <Text color="gray">Local: {prediction.localContext}</Text>
          <Text color="gray">Incoming: {prediction.incomingContext}</Text>
          <Text color={prediction.source === "ai" ? "magentaBright" : "gray"}>
            {prediction.source === "ai" ? "AI-assisted explanation" : "Heuristic explanation"}
          </Text>
        </Box>
      ))}
      <Newline />
    </Box>
  );
}
