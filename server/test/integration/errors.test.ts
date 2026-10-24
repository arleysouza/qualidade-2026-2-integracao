import { useIntegrationApp } from "../support/integration-app";

describe("Validações e erros entre recursos", () => {
  const { client, expectError, fixtures } = useIntegrationApp();

  test.each([
    ["/api/students", { ra: 123, name: "Outra pessoa" }],
    ["/api/courses", { name: "Qualidade" }],
  ])("converte violação real de unicidade em 409: %s", async (path, body) => {
    await fixtures();
    await expectError(path, 409, "POST", body);
  });

  test.each([
    "/api/students/123",
    "/api/courses/123",
    "/api/enrollments/student/123/course/1",
  ])("retorna 404 para recurso ausente: %s", async (path) => {
    await expectError(path, 404);
  });

  test.each(["0", "-1", "1.5", "1abc", "1e2", "2147483648"])(
    "rejeita identificador de rota inválido: %s",
    async (id) => {
      for (const path of [
        "/api/students/" + id,
        "/api/courses/" + id,
        `/api/enrollments/student/${id}/course/1`,
        `/api/enrollments/student/1/course/${id}`,
      ])
        await expectError(path, 400);
    },
  );

  test.each([
    null,
    [],
    "Ana",
    12,
    {},
    { name: "" },
    { name: "ab" },
    { name: "   " },
    { name: " a " },
    { name: "a".repeat(101) },
    { name: 123 },
  ])("rejeita corpo/nome inválido: %j", async (body) => {
    await expectError("/api/courses", 400, "POST", body);
    await expectError("/api/students", 400, "POST", body);
    expect((await client.query("SELECT * FROM courses")).rows).toEqual([]);
    expect((await client.query("SELECT * FROM students")).rows).toEqual([]);
  });

  test.each([0, -1, 1.5, 2147483648, "123", null])(
    "rejeita chaves inválidas no JSON: %j",
    async (id) => {
      await expectError("/api/students", 400, "POST", { ra: id, name: "Ana" });
      await expectError("/api/enrollments", 400, "POST", {
        studentRa: id,
        courseId: 1,
      });
      await expectError("/api/enrollments", 400, "POST", {
        studentRa: 123,
        courseId: id,
      });
    },
  );
});
