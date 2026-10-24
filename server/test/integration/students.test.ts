import { useIntegrationApp } from "../support/integration-app";

describe("Alunos", () => {
  const { client, request } = useIntegrationApp();

  test("cria, persiste, busca e ordena alunos pelo nome", async () => {
    expect(
      await request("/api/students", "POST", {
        ra: 2,
        name: "Bruno",
        extra: true,
      }),
    ).toEqual({ status: 201, body: { ra: 2, name: "Bruno" } });
    expect(
      await request("/api/students", "POST", { ra: 1, name: "Ana" }),
    ).toEqual({ status: 201, body: { ra: 1, name: "Ana" } });
    expect(await request("/api/students/2")).toEqual({
      status: 200,
      body: { ra: 2, name: "Bruno" },
    });
    expect(await request("/api/students")).toEqual({
      status: 200,
      body: [
        { ra: 1, name: "Ana" },
        { ra: 2, name: "Bruno" },
      ],
    });
    expect(
      (await client.query("SELECT ra, name FROM students ORDER BY ra")).rows,
    ).toEqual([
      { ra: 1, name: "Ana" },
      { ra: 2, name: "Bruno" },
    ]);
  });

  test("aceita os limites de RA e tamanho do nome", async () => {
    const body = { ra: 2147483647, name: "a".repeat(100) };
    expect(await request("/api/students", "POST", body)).toEqual({
      status: 201,
      body,
    });
    expect(await request("/api/students/2147483647")).toEqual({
      status: 200,
      body,
    });
  });
});
