import type { TestHttpClient } from "./http";

// Os pré-requisitos também são criados pela API real.
export async function createEnrollmentPrerequisites(request: TestHttpClient["request"]) {
  const student = await request("/api/students", "POST", { ra: 123, name: "Ana" });
  const course = await request("/api/courses", "POST", { name: "Qualidade" });
  expect(student.status).toBe(201);
  expect(course.status).toBe(201);
  return {
    studentRa: student.body.ra as number,
    courseId: course.body.id as number,
  };
}
