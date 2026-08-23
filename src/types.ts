import type { components, paths } from './generated/openapi.js';

export type ScrapeRequest = components['schemas']['ScrapeRequest'];
export type AsyncScrapeRequest = components['schemas']['AsyncScrapeRequest'];
export type ScrapeResult = components['schemas']['ScrapeResult'];
export type ScrapeError = components['schemas']['ScrapeError'];
export type CreateMonitorRequest = components['schemas']['CreateMonitorRequest'];
export type Monitor = components['schemas']['Monitor'];
export type MonitorCheck = components['schemas']['MonitorCheck'];
export type MonitorEvent = components['schemas']['MonitorEvent'];
export type DiffSummary = components['schemas']['DiffSummary'];

export type AsyncScrapeResponse =
  paths['/v1/api/scrape/async']['post']['responses'][202]['content']['application/json'];
export type InvalidateResponse =
  paths['/v1/api/invalidate']['post']['responses'][200]['content']['application/json'];
export type ListMonitorsResponse =
  paths['/v1/api/monitors']['get']['responses'][200]['content']['application/json'];
export type CreateMonitorResponse =
  paths['/v1/api/monitors']['post']['responses'][201]['content']['application/json'];
export type GetMonitorResponse =
  paths['/v1/api/monitors/{id}']['get']['responses'][200]['content']['application/json'];
export type UpdateMonitorResponse =
  paths['/v1/api/monitors/{id}']['patch']['responses'][200]['content']['application/json'];
export type RunMonitorResponse =
  paths['/v1/api/monitors/{id}/run']['post']['responses'][202]['content']['application/json'];
export type ListMonitorChecksResponse =
  paths['/v1/api/monitors/{id}/checks']['get']['responses'][200]['content']['application/json'];
export type ListMonitorEventsResponse =
  paths['/v1/api/monitors/{id}/events']['get']['responses'][200]['content']['application/json'];

export interface UpdateMonitorRequest {
  status: 'active' | 'paused';
}

export interface RequestOptions {
  /** Additional headers for this request. These override client defaults. */
  headers?: HeadersInit;
  /** Abort the request using a caller-owned signal. */
  signal?: AbortSignal;
  /** Override the client's timeout for this request. Set to 0 to disable it. */
  timeoutMs?: number;
}

export interface PagePithOptions {
  /** PagePith API key. Required by scraping, invalidation, and monitoring methods. */
  apiKey?: string;
  /** API origin. Defaults to https://api.pagepith.com. */
  baseUrl?: string;
  /** Custom fetch implementation for tests or non-standard runtimes. */
  fetch?: typeof fetch;
  /** Default request timeout in milliseconds. Defaults to 60 seconds. */
  timeoutMs?: number;
  /** Headers included with every request. */
  headers?: HeadersInit;
}
