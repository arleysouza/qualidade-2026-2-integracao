import { useIntegrationApp } from "../support/integration-app";

describe("Disciplinas", () => {
  const { client, request } = useIntegrationApp();

  test("cria disciplinas com ID gerado, persiste e ordena por ID", async () => {
    const first = await request("/api/courses", "POST", {
      name: "Zoologia",
      extra: true,
    });
    const second = await request("/api/courses", "POST", {
      name: "Algoritmos",
    });
    expect(first).toEqual({
      status: 201,
      body: { id: expect.any(Number), name: "Zoologia" },
    });
    expect(second).toEqual({
      status: 201,
      body: { id: expect.any(Number), name: "Algoritmos" },
    });
    expect(second.body.id).toBeGreaterThan(first.body.id);
    expect(await request("/api/courses/" + first.body.id)).toEqual({
      status: 200,
      body: first.body,
    });
    expect(await request("/api/courses")).toEqual({
      status: 200,
      body: [first.body, second.body],
    });
    expect(
      (await client.query("SELECT id, name FROM courses ORDER BY id")).rows,
    ).toEqual([first.body, second.body]);
  });
});
