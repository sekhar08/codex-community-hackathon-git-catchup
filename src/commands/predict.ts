export interface PredictCommandResult {
  readonly enabled: false;
}

export async function runPredictCommand(): Promise<PredictCommandResult> {
  return { enabled: false };
}
