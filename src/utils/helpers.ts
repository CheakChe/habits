export class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableError';
  }
}

export class Helpers {
  public static async withRetry<T>(
    operation: () => Promise<T>,
    maxAttempts: number = 3,
    baseDelayMs: number = 400
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (err) {
        lastError = err;
        if (err instanceof NonRetryableError) {
          throw err;
        }
        if (attempt === maxAttempts) {
          break;
        }
        const jitter = Math.floor(Math.random() * 120);
        const delay = baseDelayMs * Math.pow(2, attempt - 1) + jitter;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw lastError;
  }

  public static bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.byteLength !== b.byteLength) return false;
    for (let i = 0; i < a.byteLength; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  public static formatByteSize(bytes?: number): string {
    if (bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return '—';
    const wholeBytes = Math.round(bytes);
    if (wholeBytes < 1024) return `${wholeBytes} B`;

    const units = ['B', 'KB', 'MB', 'GB'] as const;
    let unitIndex = 1;
    let scaled = wholeBytes / 1024;

    while (unitIndex < units.length - 1) {
      const decimals = unitIndex >= 2 ? 2 : 1;
      if (Number(scaled.toFixed(decimals)) < 1024) break;
      scaled /= 1024;
      unitIndex += 1;
    }

    const decimals = unitIndex >= 2 ? 2 : 1;
    const formatted = scaled
      .toFixed(decimals)
      .replace(/\.0+$/, '')
      .replace(/(\.\d*[1-9])0+$/, '$1');
    return `${formatted} ${units[unitIndex]}`;
  }
}
