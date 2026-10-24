import { useIntegrationApp } from "../support/integration-app";

describe("Disciplinas", () => {
  const { request } = useIntegrationApp();

  test("cria disciplina com ID gerado e ignora campos extras", async () => {
    const created = await request("/api/courses", "POST", {
      name: "Sistemas Operacionais",
      extra: true,
    });

    expect(created).toEqual({
      status: 201,
      body: { id: expect.any(Number), name: "Sistemas Operacionais" },
    });
  });

  test("busca uma disciplina cadastrada pelo ID", async () => {
    const created = await request("/api/courses", "POST", {
      name: "Sistemas Operacionais",
    });
    expect(created.status).toBe(201);

    expect(await request("/api/courses/" + created.body.id)).toEqual({
      status: 200,
      body: created.body,
    });
  });

  test("lista disciplinas por ID crescente, independentemente do nome", async () => {
    // A ordem alfabética é inversa à ordem de criação.
    const first = await request("/api/courses", "POST", {
      name: "Sistemas Operacionais",
    });
    const second = await request("/api/courses", "POST", {
      name: "Algoritmos",
    });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.id).toBeGreaterThan(first.body.id);

    expect(await request("/api/courses")).toEqual({
      status: 200,
      body: [first.body, second.body],
    });
  });
});
