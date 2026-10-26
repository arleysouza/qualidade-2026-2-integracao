import { useIntegrationApp } from "../support/integration-app";

describe("Alunos", () => {
  const { request } = useIntegrationApp();

  test("cria aluno e ignora campos extras", async () => {
    expect(
      await request("/api/students", "POST", {
        ra: 2,
        name: "Bruno",
        extra: true,
      }),
    ).toEqual({ status: 201, body: { ra: 2, name: "Bruno" } });
  });

  test("busca um aluno cadastrado pelo RA", async () => {
    const student = { ra: 2, name: "Bruno" };
    const created = await request("/api/students", "POST", student);
    expect(created.status).toBe(201);

    expect(await request("/api/students/2")).toEqual({
      status: 200,
      body: student,
    });
  });

  test("lista alunos pelo nome, independentemente do RA e da ordem de criação", async () => {
    // A ordem de criação e de RA é inversa à ordem alfabética.
    const first = await request("/api/students", "POST", {
      ra: 1,
      name: "Bruno",
    });
    const second = await request("/api/students", "POST", {
      ra: 2,
      name: "Ana",
    });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    expect(await request("/api/students")).toEqual({
      status: 200,
      body: [
        { ra: 2, name: "Ana" },
        { ra: 1, name: "Bruno" },
      ],
    });
  });
});
