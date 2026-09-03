/** A raw HTTP response from Toutbox: status code plus parsed JSON body. */
export interface ToutboxHttpResponse {
  status: number;
  body: unknown;
}

/**
 * Transport-only client for Toutbox's own HTTP API: base URL and its static
 * API-key auth (a plain `Authorization` header on every business call, no
 * separate token exchange). Zero business/mapping logic — that lives in
 * `usecases/`. Never branches on WireMock vs. the real vendor; it only ever
 * reads `baseUrl` from config (ADR 0001, `tim-network-adapter`).
 *
 * Throws only on a genuine transport-level failure (network error, no
 * response at all) — never for a non-2xx status, which is a normal Toutbox
 * business outcome the caller decides how to map.
 */
export class ToutboxHttpClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  async post(path: string, body: unknown): Promise<ToutboxHttpResponse> {
    return this.request('POST', path, body);
  }

  async put(path: string, body: unknown): Promise<ToutboxHttpResponse> {
    return this.request('PUT', path, body);
  }

  private async request(method: string, path: string, body: unknown): Promise<ToutboxHttpResponse> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.apiKey,
      },
      body: JSON.stringify(body),
    });
    const responseBody: unknown = await response.json();
    return { status: response.status, body: responseBody };
  }
}
