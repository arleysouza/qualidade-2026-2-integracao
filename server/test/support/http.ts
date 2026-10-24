import { STATUS_CODES } from "node:http";

export function createHttpClient(getBaseUrl: () => string) {
  function rawRequest(path: string, options?: RequestInit) {
    return fetch(getBaseUrl() + path, {
      ...options,
      signal: options?.signal ?? AbortSignal.timeout(5000),
    });
  }

  async function request(path: string, method = "GET", body?: unknown) {
    const response = await rawRequest(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    expect(response.headers.get("content-type")).toMatch(/application\/json/);
    return { status: response.status, body: await response.json() };
  }

  async function expectError(
    path: string,
    status: 400 | 404 | 409,
    method = "GET",
    body?: unknown,
  ) {
    const response = await request(path, method, body);
    expect(response.status).toBe(status);
    expect(response.body).toEqual({
      statusCode: status,
      message: expect.any(String),
      error: STATUS_CODES[status],
    });
  }

  return { request, expectError, rawRequest };
}

export type TestHttpClient = ReturnType<typeof createHttpClient>;
