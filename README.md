# PagePith TypeScript SDK

The official, fully typed TypeScript client for the [PagePith API](https://pagepith.com/docs). It works in Node.js 18+, browsers, Bun, Deno, and Cloudflare Workers using the runtime's native `fetch` implementation.

## Install

```bash
pnpm add @pagepith/sdk
```

## Quick start

```ts
import { PagePith } from '@pagepith/sdk';

const pagepith = new PagePith({ apiKey: process.env.PAGEPITH_API_KEY });

const page = await pagepith.scrape({
  url: 'https://example.com',
});

console.log(page.markdown);
```

The client sends API keys as `Authorization: Bearer <api-key>`.

## Scraping

```ts
const freshPage = await pagepith.scrape({
  url: 'https://example.com/pricing',
  forceFresh: true,
  waitForSelector: '#plans',
  timeoutMs: 60_000,
});

const job = await pagepith.scrapeAsync({
  url: 'https://example.com/catalog',
  callbackUrl: 'https://your-app.com/webhooks/pagepith',
  callbackToken: 'your-correlation-id',
});

await pagepith.invalidate({ url: 'https://example.com/pricing' });
```

## Video processing

Process public YouTube, Instagram, and TikTok videos asynchronously:

```ts
const accepted = await pagepith.videos.process({
  url: 'https://www.youtube.com/watch?v=y_BFhK5ixeE',
  mode: 'auto',
  language: 'en',
});

const job = await pagepith.videos.getJob(accepted.jobId);

if (job.status === 'completed') {
  console.log(job.result?.transcript.text);
}
```

`auto` prefers native captions and generates a transcript when captions are unavailable. Native
and cached transcripts cost one credit; fresh generated transcripts cost four credits per
rounded-up audio minute. Poll `getJob` until the job is `completed` or `failed`, or supply a public
`callbackUrl` when starting the job.

## Monitoring

```ts
const { monitor, webhookSecret } = await pagepith.monitors.create({
  url: 'https://example.com/pricing',
  notifications: {
    email: true,
    webhook: { url: 'https://your-app.com/webhooks/pagepith' },
  },
});

await pagepith.monitors.update(monitor.id, { status: 'paused' });
const checks = await pagepith.monitors.listChecks(monitor.id);
const events = await pagepith.monitors.listEvents(monitor.id);
```

When PagePith generates a webhook secret, it is returned only once. Store it securely and use it to validate monitoring deliveries.

## Requests, cancellation, and custom runtimes

Every method accepts request options with `signal`, `timeoutMs`, and additional headers:

```ts
const controller = new AbortController();

await pagepith.scrape(
  { url: 'https://example.com' },
  { signal: controller.signal, timeoutMs: 30_000 },
);
```

Inject a compatible `fetch` function or point the client at a test/self-hosted API:

```ts
const client = new PagePith({
  apiKey: 'test-key',
  baseUrl: 'http://localhost:8080',
  fetch: customFetch,
});
```

## Errors

Failed requests throw `PagePithError`:

```ts
import { PagePithError } from '@pagepith/sdk';

try {
  await pagepith.scrape({ url: 'https://example.com/private' });
} catch (error) {
  if (error instanceof PagePithError) {
    console.error(error.status, error.code, error.message, error.details);
  }
}
```

The SDK does not automatically retry requests. Callers retain control over retry policy, especially for methods that enqueue jobs or mutate monitors.

## API surface

- `scrape`, `scrapeAsync`, `invalidate`
- `videos.process`, `videos.getJob`
- `monitors.create`, `list`, `get`, `update`, `delete`, `run`, `listChecks`, `listEvents`

## Development and releases

The committed `openapi.json` is the pinned PagePith API contract. Regenerate types and run all validation with:

```bash
pnpm install
pnpm check
npm pack --dry-run
```

Changesets manages versions. The release workflow is manual and requires an `NPM_TOKEN` repository secret; no package is published automatically by CI.
