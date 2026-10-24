import { useIntegrationApp } from "../support/integration-app";

describe("Matrículas", () => {
  const { request, expectError, fixtures } = useIntegrationApp();

  test("cria matrícula com data ISO e ignora campos extras", async () => {
    const keys = await fixtures();
    const created = await request("/api/enrollments", "POST", {
      ...keys,
      extra: true,
    });

    expect(created).toEqual({
      status: 201,
      body: { ...keys, enrolledAt: expect.any(String) },
    });

    expect(new Date(created.body.enrolledAt).toISOString()).toBe(
      created.body.enrolledAt,
    );
  });

  test("busca uma matrícula cadastrada pela chave composta", async () => {
    const keys = await fixtures();
    const created = await request("/api/enrollments", "POST", keys);

    expect(created.status).toBe(201);

    expect(
      await request(
        `/api/enrollments/student/${keys.studentRa}/course/${keys.courseId}`,
      ),
    ).toEqual({ status: 200, body: created.body });
  });
  
  test("rejeita matrícula duplicada com 409", async () => {
    const keys = await fixtures();
    expect((await request("/api/enrollments", "POST", keys)).status).toBe(201);
    await expectError("/api/enrollments", 409, "POST", keys);
  });

  test.each(["student", "course"])(
    "converte FK inexistente (%s) em 404",
    async (missing) => {
      const keys = await fixtures();
      await expectError("/api/enrollments", 404, "POST", {
        studentRa: missing === "student" ? 999 : keys.studentRa,
        courseId: missing === "course" ? 2147483647 : keys.courseId,
      });
    },
  );

  test.each([{}, { studentRa: 123 }, { courseId: 1 }, null, []])(
    "rejeita matrícula sem ambas as chaves: %j",
    async (body) => {
      await expectError("/api/enrollments", 400, "POST", body);
    },
  );
});
