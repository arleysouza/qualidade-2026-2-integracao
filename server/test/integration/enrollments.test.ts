import { useIntegrationApp } from "../support/integration-app";

describe("Matrículas", () => {
  const { client, request, expectError, fixtures } = useIntegrationApp();

  test("matricula aluno, serializa a data e permite busca pela chave composta", async () => {
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
    expect(
      await request(
        `/api/enrollments/student/${keys.studentRa}/course/${keys.courseId}`,
      ),
    ).toEqual({ status: 200, body: created.body });
    expect(await request("/api/enrollments")).toEqual({
      status: 200,
      body: [created.body],
    });
    const persisted = (await client.query("SELECT * FROM enrollments")).rows[0];
    expect(persisted).toEqual({
      student_ra: keys.studentRa,
      course_id: keys.courseId,
      enrolled_at: new Date(created.body.enrolledAt),
    });
  });

  test("ordena matrículas por RA e depois por curso", async () => {
    const { courseId } = await fixtures();
    const other = await request("/api/courses", "POST", {
      name: "Banco de dados",
    });
    await request("/api/students", "POST", { ra: 456, name: "Bruno" });
    const keys = [
      { studentRa: 456, courseId },
      { studentRa: 123, courseId: other.body.id },
      { studentRa: 123, courseId },
    ];
    for (const key of keys)
      expect((await request("/api/enrollments", "POST", key)).status).toBe(201);
    const listed = await request("/api/enrollments");
    expect(listed.status).toBe(200);
    expect(
      listed.body.map(
        ({ studentRa, courseId }: { studentRa: number; courseId: number }) => ({
          studentRa,
          courseId,
        }),
      ),
    ).toEqual([keys[2], keys[1], keys[0]]);
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
