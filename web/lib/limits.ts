/** Hard caps for one agent run. Retries cover the model call, not a side effect. */
export const LIMITS = {
  maxSteps: 8,
  maxTokens: 24_000,
  maxRetries: 2,
  maxDelegations: 3,
  approvalTtlMs: 60 * 60 * 1000,
} as const;

export class FatalRunError extends Error {
  readonly fatal = true;
  constructor(message: string) {
    super(message);
    this.name = "FatalRunError";
  }
}

export function isFatal(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "fatal" in error && (error as { fatal?: boolean }).fatal);
}

/** Calls `fn` once, then up to `maxRetries` more times. Fatal errors are not retried. */
export async function withRetries<T>(fn: () => Promise<T>, maxRetries: number, onRetry?: (attempt: number) => Promise<void> | void): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      if (isFatal(error) || attempt === maxRetries) break;
      await onRetry?.(attempt + 1);
    }
  }
  throw last;
}
