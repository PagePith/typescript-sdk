export interface PagePithErrorOptions {
  status?: number | null;
  code?: string;
  details?: unknown;
  cause?: unknown;
}

/** A configuration, transport, or HTTP error raised by the PagePith client. */
export class PagePithError extends Error {
  readonly status: number | null;
  readonly code: string;
  readonly details: unknown;

  constructor(message: string, options: PagePithErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'PagePithError';
    this.status = options.status ?? null;
    this.code = options.code ?? 'pagepith_error';
    this.details = options.details;
  }
}
