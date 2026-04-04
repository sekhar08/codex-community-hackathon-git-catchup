import React from "react";
import { Text } from "ink";

export interface CommitGroupProps {
  title?: string;
}

export function CommitGroup({ title = "Commit grouping will land in Phase 1." }: CommitGroupProps): React.JSX.Element {
  return <Text color="gray">{title}</Text>;
}
