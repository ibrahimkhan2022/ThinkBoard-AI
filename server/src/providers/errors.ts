/** The provider answered, but not with something we can use. */
export class ProviderOutputError extends Error {
  /** True when the model ran out of room (finish reason "length") so its reply stops half way. */
  truncated = false;
  constructor(message: string) {
    super(message);
    this.name = "ProviderOutputError";
  }
}

/**
 * The provider could not be reached or refused the call. `userMessage` is safe
 * to show to a student (it never contains keys, URLs with secrets or raw bodies).
 */
export class ProviderError extends Error {
  constructor(
    readonly userMessage: string,
    /** HTTP status the API should answer with. */
    readonly httpStatus: number,
    readonly code: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(userMessage);
    this.name = "ProviderError";
  }
}
