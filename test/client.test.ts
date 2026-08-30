import { describe, expect, it, vi } from 'vitest';
import { PagePith, PagePithError } from '../src/index.js';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('PagePith', () => {
  it('sends authenticated scrape requests and returns typed JSON', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => json({
      url: 'https://example.com',
      finalUrl: 'https://example.com/',
      title: 'Example',
      markdown: '# Example',
      html: '<h1>Example</h1>',
      contentLength: 9,
      fetchedAt: '2026-08-22T00:00:00.000Z',
      cached: false,
    }));
    const client = new PagePith({
      apiKey: 'secret',
      baseUrl: 'https://api.example.test/',
      fetch: fetchMock as typeof fetch,
      headers: { 'x-client': 'test' },
    });

    const result = await client.scrape({ url: 'https://example.com', forceFresh: true });

    expect(result.markdown).toBe('# Example');
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.example.test/v1/api/scrape');
    expect(init?.method).toBe('POST');
    const headers = new Headers(init?.headers);
    expect(headers.get('authorization')).toBe('Bearer secret');
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('x-client')).toBe('test');
    expect(JSON.parse(String(init?.body))).toEqual({
      url: 'https://example.com',
      forceFresh: true,
    });
  });

  it('rejects protected methods before making a request when the key is missing', async () => {
    const fetchMock = vi.fn();
    const client = new PagePith({ fetch: fetchMock as typeof fetch });

    await expect(client.scrape({ url: 'https://example.com' })).rejects.toMatchObject({
      name: 'PagePithError',
      code: 'missing_api_key',
      status: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('exposes structured API errors and handles non-JSON errors', async () => {
    const responses = [
      json({ error: 'URL_NOT_FOUND', message: 'The URL does not exist.' }, 404),
      new Response('Bad gateway', { status: 502 }),
    ];
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      responses.shift()!);
    const client = new PagePith({ apiKey: 'secret', fetch: fetchMock as typeof fetch });

    await expect(client.scrape({ url: 'https://example.com/missing' })).rejects.toMatchObject({
      status: 404,
      code: 'URL_NOT_FOUND',
      message: 'The URL does not exist.',
      details: { error: 'URL_NOT_FOUND', message: 'The URL does not exist.' },
    });
    await expect(client.invalidate({ url: 'https://example.com' })).rejects.toMatchObject({
      status: 502,
      code: 'http_error',
      details: 'Bad gateway',
    });
  });

  it('maps every monitoring method to its documented endpoint', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) =>
      init?.method === 'DELETE' ? new Response(null, { status: 204 }) : json({ status: 'queued' }));
    const client = new PagePith({
      apiKey: 'secret',
      baseUrl: 'https://api.example.test',
      fetch: fetchMock as typeof fetch,
    });
    const id = 'id/with spaces';

    await client.monitors.create({ url: 'https://example.com' });
    await client.monitors.list();
    await client.monitors.get(id);
    await client.monitors.update(id, { status: 'paused' });
    await client.monitors.delete(id);
    await client.monitors.run(id);
    await client.monitors.listChecks(id);
    await client.monitors.listEvents(id);

    expect(fetchMock.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
      ['https://api.example.test/v1/api/monitors', 'POST'],
      ['https://api.example.test/v1/api/monitors', 'GET'],
      ['https://api.example.test/v1/api/monitors/id%2Fwith%20spaces', 'GET'],
      ['https://api.example.test/v1/api/monitors/id%2Fwith%20spaces', 'PATCH'],
      ['https://api.example.test/v1/api/monitors/id%2Fwith%20spaces', 'DELETE'],
      ['https://api.example.test/v1/api/monitors/id%2Fwith%20spaces/run', 'POST'],
      ['https://api.example.test/v1/api/monitors/id%2Fwith%20spaces/checks', 'GET'],
      ['https://api.example.test/v1/api/monitors/id%2Fwith%20spaces/events', 'GET'],
    ]);
  });

  it('processes videos and polls jobs through the documented endpoints', async () => {
    const responses = [
      json({ jobId: 'job-1', status: 'queued' }, 202),
      json({ jobId: 'job-1', status: 'processing', progress: 50 }),
    ];
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      responses.shift()!);
    const client = new PagePith({
      apiKey: 'secret',
      baseUrl: 'https://api.example.test',
      fetch: fetchMock as typeof fetch,
    });

    const accepted = await client.videos.process({
      url: 'https://www.youtube.com/watch?v=y_BFhK5ixeE',
      language: 'en',
    });
    const job = await client.videos.getJob('job/with spaces');

    expect(accepted).toEqual({ jobId: 'job-1', status: 'queued' });
    expect(job).toMatchObject({ jobId: 'job-1', status: 'processing', progress: 50 });
    expect(fetchMock.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
      ['https://api.example.test/v1/api/video/process', 'POST'],
      ['https://api.example.test/v1/api/video/jobs/job%2Fwith%20spaces', 'GET'],
    ]);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      url: 'https://www.youtube.com/watch?v=y_BFhK5ixeE',
      language: 'en',
    });
  });

  it('supports caller cancellation and client timeouts', async () => {
    const fetchMock = vi.fn((_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        if (init?.signal?.aborted) {
          reject(init.signal.reason);
          return;
        }
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      }));
    const client = new PagePith({ apiKey: 'secret', fetch: fetchMock as typeof fetch, timeoutMs: 5 });

    await expect(client.scrape({ url: 'https://example.com' })).rejects.toMatchObject({
      code: 'timeout',
    });

    const controller = new AbortController();
    controller.abort();
    await expect(client.scrape({ url: 'https://example.com' }, { signal: controller.signal }))
      .rejects.toMatchObject({ code: 'aborted' });
  });

  it('exports a recognizable PagePithError class', () => {
    expect(new PagePithError('boom', { status: 500, code: 'test' })).toMatchObject({
      name: 'PagePithError',
      status: 500,
      code: 'test',
    });
  });
});
