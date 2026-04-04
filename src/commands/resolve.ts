export interface ResolveCommandResult {
  readonly enabled: false;
}

export async function runResolveCommand(): Promise<ResolveCommandResult> {
  return { enabled: false };
}
