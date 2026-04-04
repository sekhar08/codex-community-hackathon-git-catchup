export interface ImpactCommandResult {
  readonly enabled: false;
}

export async function runImpactCommand(): Promise<ImpactCommandResult> {
  return { enabled: false };
}
