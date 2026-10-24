import { readFile } from "node:fs/promises";
import { once } from "node:events";
import type { Server } from "node:http";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { createApp } from "../../src/app";

// Apenas TEST_DATABASE_URL é lida: nunca reutilizar as credenciais da aplicação.
const client = new Client({
  connectionString: process.env.TEST_DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:5434/aula3_test",
  connectionTimeoutMillis: 5000,
});
const schema = "integration_" + randomUUID().replaceAll("-", "");
let server: Server | undefined;
let baseUrl: string;
let connected = false;
let schemaCreated = false;

beforeAll(async () => {
  await client.connect();
  connected = true;
  await client.query(`CREATE SCHEMA "${schema}"`);
  schemaCreated = true;
  await client.query(`SET search_path TO "${schema}"`);
  await client.query(await readFile(resolve(__dirname, "../../../database/init.sql"), "utf8"));
  server = createApp(client).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Porta HTTP indisponível.");
  baseUrl = `http://127.0.0.1:${address.port}`;
}, 15000);

beforeEach(async () => {
  await client.query("BEGIN");
});

afterEach(async () => {
  if (connected) await client.query("ROLLBACK");
});

afterAll(async () => {
  try {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close(error => error ? reject(error) : resolve());
        server!.closeAllConnections();
      });
    }
  } finally {
    try {
      if (schemaCreated) await client.query(`DROP SCHEMA "${schema}" CASCADE`);
    } finally {
      if (connected) await client.end();
    }
  }
});

async function request(path: string, method = "GET", body?: unknown) {
  const response = await fetch(baseUrl + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  expect(response.headers.get("content-type")).toMatch(/application\/json/);
  return { status: response.status, body: await response.json() };
}

async function expectError(path: string, status: number, method = "GET", body?: unknown) {
  const response = await request(path, method, body);
  expect(response.status).toBe(status);
  expect(response.body).toEqual({
    statusCode: status,
    message: expect.any(String),
    error: status === 400 ? "Bad Request" : status === 404 ? "Not Found" : "Conflict",
  });
}

async function fixtures() {
  const student = await request("/api/students", "POST", { ra: 123, name: "Ana" });
  const course = await request("/api/courses", "POST", { name: "Qualidade" });
  expect(student.status).toBe(201);
  expect(course.status).toBe(201);
  return { studentRa: student.body.ra as number, courseId: course.body.id as number };
}

describe("HTTP, Express e PostgreSQL reais", () => {
  test("healthcheck e rota inexistente", async () => {
    expect(await request("/health")).toEqual({ status: 200, body: { status: "ok" } });
    await expectError("/inexistente", 404);
  });

  test.each(["students", "courses", "enrollments"])("%s começa sem registros", async resource => {
    expect(await request("/api/" + resource)).toEqual({ status: 200, body: [] });
  });

  test("cria, persiste, busca e ordena alunos pelo nome", async () => {
    expect(await request("/api/students", "POST", { ra: 2, name: "Bruno", extra: true }))
      .toEqual({ status: 201, body: { ra: 2, name: "Bruno" } });
    expect(await request("/api/students", "POST", { ra: 1, name: "Ana" }))
      .toEqual({ status: 201, body: { ra: 1, name: "Ana" } });
    expect(await request("/api/students/2")).toEqual({ status: 200, body: { ra: 2, name: "Bruno" } });
    expect(await request("/api/students")).toEqual({
      status: 200, body: [{ ra: 1, name: "Ana" }, { ra: 2, name: "Bruno" }],
    });
    expect((await client.query("SELECT ra, name FROM students ORDER BY ra")).rows)
      .toEqual([{ ra: 1, name: "Ana" }, { ra: 2, name: "Bruno" }]);
  });

  test("cria disciplinas com ID gerado, persiste e ordena por ID", async () => {
    const first = await request("/api/courses", "POST", { name: "Zoologia", extra: true });
    const second = await request("/api/courses", "POST", { name: "Algoritmos" });
    expect(first).toEqual({ status: 201, body: { id: expect.any(Number), name: "Zoologia" } });
    expect(second).toEqual({ status: 201, body: { id: expect.any(Number), name: "Algoritmos" } });
    expect(second.body.id).toBeGreaterThan(first.body.id);
    expect(await request("/api/courses/" + first.body.id)).toEqual({ status: 200, body: first.body });
    expect(await request("/api/courses")).toEqual({ status: 200, body: [first.body, second.body] });
    expect((await client.query("SELECT id, name FROM courses ORDER BY id")).rows)
      .toEqual([first.body, second.body]);
  });

  test("matricula aluno, serializa a data e permite busca pela chave composta", async () => {
    const keys = await fixtures();
    const created = await request("/api/enrollments", "POST", { ...keys, extra: true });
    expect(created).toEqual({
      status: 201, body: { ...keys, enrolledAt: expect.any(String) },
    });
    expect(new Date(created.body.enrolledAt).toISOString()).toBe(created.body.enrolledAt);
    expect(await request(`/api/enrollments/student/${keys.studentRa}/course/${keys.courseId}`))
      .toEqual({ status: 200, body: created.body });
    expect(await request("/api/enrollments")).toEqual({ status: 200, body: [created.body] });
    const persisted = (await client.query("SELECT * FROM enrollments")).rows[0];
    expect(persisted).toEqual({
      student_ra: keys.studentRa, course_id: keys.courseId,
      enrolled_at: new Date(created.body.enrolledAt),
    });
  });

  test("ordena matrículas por RA e depois por curso", async () => {
    const { courseId } = await fixtures();
    const other = await request("/api/courses", "POST", { name: "Banco de dados" });
    await request("/api/students", "POST", { ra: 456, name: "Bruno" });
    const keys = [
      { studentRa: 456, courseId },
      { studentRa: 123, courseId: other.body.id },
      { studentRa: 123, courseId },
    ];
    for (const key of keys) expect((await request("/api/enrollments", "POST", key)).status).toBe(201);
    const listed = await request("/api/enrollments");
    expect(listed.status).toBe(200);
    expect(listed.body.map(({ studentRa, courseId }: { studentRa: number; courseId: number }) =>
      ({ studentRa, courseId }))).toEqual([keys[2], keys[1], keys[0]]);
  });

  test.each([
    ["/api/students", { ra: 123, name: "Outra pessoa" }],
    ["/api/courses", { name: "Qualidade" }],
  ])("converte violação real de unicidade em 409: %s", async (path, body) => {
    await fixtures();
    await expectError(path, 409, "POST", body);
  });

  test("rejeita matrícula duplicada com 409", async () => {
    const keys = await fixtures();
    expect((await request("/api/enrollments", "POST", keys)).status).toBe(201);
    await expectError("/api/enrollments", 409, "POST", keys);
  });

  test.each(["student", "course"])("converte FK inexistente (%s) em 404", async missing => {
    const keys = await fixtures();
    await expectError("/api/enrollments", 404, "POST", {
      studentRa: missing === "student" ? 999 : keys.studentRa,
      courseId: missing === "course" ? 2147483647 : keys.courseId,
    });
  });

  test.each([
    "/api/students/123", "/api/courses/123", "/api/enrollments/student/123/course/1",
  ])("retorna 404 para recurso ausente: %s", async path => {
    await expectError(path, 404);
  });

  test.each(["0", "-1", "1.5", "1abc", "1e2", "2147483648"])(
    "rejeita identificador de rota inválido: %s", async id => {
      for (const path of [
        "/api/students/" + id, "/api/courses/" + id,
        `/api/enrollments/student/${id}/course/1`,
        `/api/enrollments/student/1/course/${id}`,
      ]) await expectError(path, 400);
    },
  );

  test.each([
    null, [], "Ana", 12, {}, { name: "" }, { name: "ab" },
    { name: "   " }, { name: " a " }, { name: "a".repeat(101) },
    { name: 123 },
  ])("rejeita corpo/nome inválido: %j", async body => {
    await expectError("/api/courses", 400, "POST", body);
    await expectError("/api/students", 400, "POST", body);
    expect((await client.query("SELECT * FROM courses")).rows).toEqual([]);
    expect((await client.query("SELECT * FROM students")).rows).toEqual([]);
  });

  test.each([0, -1, 1.5, 2147483648, "123", null])(
    "rejeita chaves inválidas no JSON: %j", async id => {
      await expectError("/api/students", 400, "POST", { ra: id, name: "Ana" });
      await expectError("/api/enrollments", 400, "POST", { studentRa: id, courseId: 1 });
      await expectError("/api/enrollments", 400, "POST", { studentRa: 123, courseId: id });
    },
  );

  test.each([{}, { studentRa: 123 }, { courseId: 1 }, null, []])(
    "rejeita matrícula sem ambas as chaves: %j", async body => {
      await expectError("/api/enrollments", 400, "POST", body);
    },
  );

  test("aceita os limites de RA e tamanho do nome", async () => {
    const body = { ra: 2147483647, name: "a".repeat(100) };
    expect(await request("/api/students", "POST", body)).toEqual({ status: 201, body });
    expect(await request("/api/students/2147483647")).toEqual({ status: 200, body });
  });

  test.each([
    ['{"name":', 400, "Bad Request"],
    [JSON.stringify({ name: "a".repeat(110000) }), 413, "Payload Too Large"],
  ])("trata corpo JSON malformado ou excessivo (caso %#)", async (body, status, error) => {
    const response = await fetch(baseUrl + "/api/courses", {
      method: "POST", headers: { "Content-Type": "application/json" }, body,
      signal: AbortSignal.timeout(5000),
    });
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ statusCode: status, message: expect.any(String), error });
  });
});
