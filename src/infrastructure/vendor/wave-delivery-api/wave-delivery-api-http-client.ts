/** A raw HTTP response from wave-delivery-api: status code plus parsed JSON body. */
export interface WaveDeliveryApiHttpResponse {
  status: number;
  body: unknown;
}

/**
 * Transport-only client for calling back into `wave-delivery-api` (the
 * reverse direction from `ToutboxHttpClient`: this service is the caller,
 * wave-delivery-api is the callee). Sends `x-api-key` — wave-delivery-api's
 * own auth header convention — not `Authorization`, which is Toutbox's.
 * Zero business/mapping logic; that lives in `usecases/`.
 *
 * Throws only on a genuine transport-level failure (network error, no
 * response at all) — never for a non-2xx status, which is a normal outcome
 * the caller decides how to handle.
 */
export class WaveDeliveryApiHttpClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  async patch(path: string, body: unknown): Promise<WaveDeliveryApiHttpResponse> {
    return this.request('PATCH', path, body);
  }

  async post(path: string, body: unknown): Promise<WaveDeliveryApiHttpResponse> {
    return this.request('POST', path, body);
  }

  private async request(
    method: string,
    path: string,
    body: unknown,
  ): Promise<WaveDeliveryApiHttpResponse> {
    const headers: Record<string, string> = { 'x-api-key': this.apiKey };
    // Only claim a JSON body when one is actually sent — wave-delivery-api's
    // Fastify JSON body parser rejects an empty body sent with
    // `Content-Type: application/json` (a bodyless call, e.g. marking a
    // cancellation complete, would otherwise always 400).
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const responseBody: unknown = await response.json();
    return { status: response.status, body: responseBody };
  }
}
