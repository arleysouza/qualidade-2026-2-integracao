import { useIntegrationApp } from "../support/integration-app";

describe("HTTP e parser JSON", () => {
  const { request, expectError, rawRequest } = useIntegrationApp();

  test("healthcheck e rota inexistente", async () => {
    expect(await request("/health")).toEqual({
      status: 200,
      body: { status: "ok" },
    });
    await expectError("/inexistente", 404);
  });

  test.each(["students", "courses", "enrollments"])(
    "%s começa sem registros",
    async (resource) => {
      expect(await request("/api/" + resource)).toEqual({
        status: 200,
        body: [],
      });
    },
  );

  test.each([
    ['{"name":', 400, "Bad Request"],
    [JSON.stringify({ name: "a".repeat(110000) }), 413, "Payload Too Large"],
  ])(
    "trata corpo JSON malformado ou excessivo (caso %#)",
    async (body, status, error) => {
      const response = await rawRequest("/api/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(5000),
      });
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({
        statusCode: status,
        message: expect.any(String),
        error,
      });
    },
  );
});
