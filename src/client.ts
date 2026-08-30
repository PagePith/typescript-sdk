import { PagePithError } from './errors.js';
import type {
  AsyncScrapeRequest,
  AsyncScrapeResponse,
  CreateMonitorRequest,
  CreateMonitorResponse,
  GetMonitorResponse,
  GetVideoJobResponse,
  InvalidateResponse,
  ListMonitorChecksResponse,
  ListMonitorEventsResponse,
  ListMonitorsResponse,
  PagePithOptions,
  ProcessVideoResponse,
  RequestOptions,
  RunMonitorResponse,
  ScrapeRequest,
  ScrapeResult,
  UpdateMonitorRequest,
  UpdateMonitorResponse,
  VideoProcessRequest,
} from './types.js';

const DEFAULT_BASE_URL = 'https://api.pagepith.com';
const DEFAULT_TIMEOUT_MS = 60_000;

interface InternalRequest {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  auth?: boolean;
  options?: RequestOptions | undefined;
}

function errorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'message' in body && typeof body.message === 'string') {
    return body.message;
  }
  return fallback;
}

function errorCode(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
    return body.error;
  }
  return fallback;
}

/** Fully typed client for the PagePith HTTP API. */
export class PagePith {
  readonly videos: {
    process: (input: VideoProcessRequest, options?: RequestOptions) => Promise<ProcessVideoResponse>;
    getJob: (jobId: string, options?: RequestOptions) => Promise<GetVideoJobResponse>;
  };

  readonly monitors: {
    create: (input: CreateMonitorRequest, options?: RequestOptions) => Promise<CreateMonitorResponse>;
    list: (options?: RequestOptions) => Promise<ListMonitorsResponse>;
    get: (id: string, options?: RequestOptions) => Promise<GetMonitorResponse>;
    update: (id: string, input: UpdateMonitorRequest, options?: RequestOptions) => Promise<UpdateMonitorResponse>;
    delete: (id: string, options?: RequestOptions) => Promise<void>;
    run: (id: string, options?: RequestOptions) => Promise<RunMonitorResponse>;
    listChecks: (id: string, options?: RequestOptions) => Promise<ListMonitorChecksResponse>;
    listEvents: (id: string, options?: RequestOptions) => Promise<ListMonitorEventsResponse>;
  };

  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly defaultHeaders: Headers;

  constructor(options: PagePithOptions = {}) {
    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (typeof fetchImpl !== 'function') {
      throw new PagePithError('No fetch implementation is available in this runtime.', {
        code: 'fetch_unavailable',
      });
    }
    if (options.timeoutMs !== undefined && (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 0)) {
      throw new PagePithError('timeoutMs must be a non-negative finite number.', {
        code: 'invalid_configuration',
      });
    }

    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.fetchImpl = fetchImpl;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.defaultHeaders = new Headers(options.headers);

    this.videos = {
      process: (input, requestOptions) => this.request('/v1/api/video/process', {
        method: 'POST', body: input, auth: true, options: requestOptions,
      }),
      getJob: (jobId, requestOptions) => this.request(
        `/v1/api/video/jobs/${encodeURIComponent(jobId)}`,
        { auth: true, options: requestOptions },
      ),
    };

    this.monitors = {
      create: (input, requestOptions) => this.request('/v1/api/monitors', {
        method: 'POST', body: input, auth: true, options: requestOptions,
      }),
      list: (requestOptions) => this.request('/v1/api/monitors', {
        auth: true, options: requestOptions,
      }),
      get: (id, requestOptions) => this.request(`/v1/api/monitors/${encodeURIComponent(id)}`, {
        auth: true, options: requestOptions,
      }),
      update: (id, input, requestOptions) => this.request(`/v1/api/monitors/${encodeURIComponent(id)}`, {
        method: 'PATCH', body: input, auth: true, options: requestOptions,
      }),
      delete: (id, requestOptions) => this.request(`/v1/api/monitors/${encodeURIComponent(id)}`, {
        method: 'DELETE', auth: true, options: requestOptions,
      }),
      run: (id, requestOptions) => this.request(`/v1/api/monitors/${encodeURIComponent(id)}/run`, {
        method: 'POST', auth: true, options: requestOptions,
      }),
      listChecks: (id, requestOptions) => this.request(`/v1/api/monitors/${encodeURIComponent(id)}/checks`, {
        auth: true, options: requestOptions,
      }),
      listEvents: (id, requestOptions) => this.request(`/v1/api/monitors/${encodeURIComponent(id)}/events`, {
        auth: true, options: requestOptions,
      }),
    };

  }

  scrape(input: ScrapeRequest, options?: RequestOptions): Promise<ScrapeResult> {
    return this.request('/v1/api/scrape', { method: 'POST', body: input, auth: true, options });
  }

  scrapeAsync(input: AsyncScrapeRequest, options?: RequestOptions): Promise<AsyncScrapeResponse> {
    return this.request('/v1/api/scrape/async', { method: 'POST', body: input, auth: true, options });
  }

  invalidate(input: { url: string }, options?: RequestOptions): Promise<InvalidateResponse> {
    return this.request('/v1/api/invalidate', { method: 'POST', body: input, auth: true, options });
  }

  private async request<T>(path: string, request: InternalRequest): Promise<T> {
    if (request.auth && !this.apiKey) {
      throw new PagePithError('An API key is required for this method.', {
        code: 'missing_api_key',
      });
    }

    const headers = new Headers(this.defaultHeaders);
    for (const [name, value] of new Headers(request.options?.headers)) headers.set(name, value);
    if (request.auth && this.apiKey) headers.set('authorization', `Bearer ${this.apiKey}`);
    if (request.body !== undefined && !headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }

    const controller = new AbortController();
    const externalSignal = request.options?.signal;
    const abortFromExternal = () => controller.abort(externalSignal?.reason);
    if (externalSignal?.aborted) abortFromExternal();
    else externalSignal?.addEventListener('abort', abortFromExternal, { once: true });

    const timeoutMs = request.options?.timeoutMs ?? this.timeoutMs;
    const timeout = timeoutMs > 0
      ? setTimeout(() => controller.abort(new DOMException('Request timed out.', 'TimeoutError')), timeoutMs)
      : undefined;

    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: request.method ?? 'GET',
        headers,
        ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
        signal: controller.signal,
      });

      if (response.status === 204) return undefined as T;

      const contentType = response.headers.get('content-type') ?? '';
      let body: unknown;
      if (contentType.includes('application/json')) {
        try {
          body = await response.json();
        } catch (cause) {
          throw new PagePithError('PagePith returned invalid JSON.', {
            status: response.status,
            code: 'invalid_response',
            cause,
          });
        }
      } else {
        body = await response.text();
      }

      if (!response.ok) {
        throw new PagePithError(errorMessage(body, `PagePith request failed with status ${response.status}.`), {
          status: response.status,
          code: errorCode(body, 'http_error'),
          details: body,
        });
      }
      return body as T;
    } catch (cause) {
      if (cause instanceof PagePithError) throw cause;
      if (controller.signal.aborted) {
        const timedOut = controller.signal.reason instanceof DOMException
          && controller.signal.reason.name === 'TimeoutError';
        throw new PagePithError(timedOut ? 'The PagePith request timed out.' : 'The PagePith request was aborted.', {
          code: timedOut ? 'timeout' : 'aborted',
          cause,
        });
      }
      throw new PagePithError('Unable to reach the PagePith API.', {
        code: 'network_error',
        cause,
      });
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
      externalSignal?.removeEventListener('abort', abortFromExternal);
    }
  }
}
