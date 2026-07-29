export class ProviderError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable: boolean,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ProviderError";
  }
}

export class ProvidersExhaustedError extends Error {
  constructor(
    readonly capability: string,
    readonly failures: readonly ProviderError[],
  ) {
    super(`All ${capability} providers failed`);
    this.name = "ProvidersExhaustedError";
  }

  get retryable(): boolean {
    return this.failures.some((failure) => failure.retryable);
  }
}

export function normalizeProviderError(error: unknown): ProviderError {
  if (error instanceof ProviderError) {
    return error;
  }

  return new ProviderError(
    error instanceof Error ? error.message : "Unknown provider failure",
    "PROVIDER_FAILURE",
    true,
    error instanceof Error ? { cause: error } : undefined,
  );
}
