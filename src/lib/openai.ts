export interface OpenAiStubClient {
  readonly enabled: false;
}

export function getOpenAiClient(): OpenAiStubClient {
  return { enabled: false };
}
