import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { ToutboxHttpClient } from './toutbox-http-client.js';

/**
 * RSK-DLV-035 / TST-DLV-NFR-02 — none of the HTTP clients in this integration pass
 * an `AbortSignal` to `fetch`, so a vendor that accepts the connection and never
 * answers holds it open for as long as it likes. The latency propagates all the way
 * to the sales channel on the quote path, and on the webhook path it makes Toutbox
 * hit its own timeout and retry — burning the three attempts the contract (§7.3)
 * allows in 24 hours.
 */
const SETTLE_BUDGET_MS = 1_500;

let server: Server | undefined;

/** A server that accepts the connection and then never answers. */
async function hangingServer(): Promise<string> {
  server = createServer(() => {
    // deliberately no response
  });
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Expected the probe server to bind to a TCP port.');
  }
  return `http://127.0.0.1:${address.port}`;
}

function delay<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(resolve, ms, value));
}

afterEach(async () => {
  await new Promise<void>((resolve) => {
    if (!server) {
      resolve();
      return;
    }
    server.closeAllConnections?.();
    server.close(() => resolve());
  });
  server = undefined;
});

describe('ToutboxHttpClient', () => {
  // it.fails until the client carries a timeout: today the request just waits.
  it.fails('gives up on a vendor that never answers', async () => {
    const baseUrl = await hangingServer();
    const client = new ToutboxHttpClient(baseUrl, 'any-key');

    const call = client.post('/api/v1/External/Order', {}).then(
      () => 'answered' as const,
      () => 'aborted' as const,
    );

    const outcome = await Promise.race([call, delay(SETTLE_BUDGET_MS, 'still-hanging' as const)]);

    expect(outcome).not.toBe('still-hanging');
  });

  it.fails('gives up on a hanging cancellation too', async () => {
    const baseUrl = await hangingServer();
    const client = new ToutboxHttpClient(baseUrl, 'any-key');

    const call = client.put('/api/v1/Parcel/SuspendOrCancel/Single', {}).then(
      () => 'answered' as const,
      () => 'aborted' as const,
    );

    const outcome = await Promise.race([call, delay(SETTLE_BUDGET_MS, 'still-hanging' as const)]);

    expect(outcome).not.toBe('still-hanging');
  });
});
