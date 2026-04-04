export interface AnalyzeCommandResult {
  readonly enabled: false;
}

export async function runAnalyzeCommand(): Promise<AnalyzeCommandResult> {
  return { enabled: false };
}
