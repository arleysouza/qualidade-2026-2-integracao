import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { Client } from "pg";

// Uma conexão e um schema por arquivo de testes.
export function createTestDatabase() {
  const client = new Client({
    connectionString: process.env.TEST_DATABASE_URL ??
      "postgresql://postgres:postgres@127.0.0.1:5434/aula3_test",
    connectionTimeoutMillis: 5000,
  });
  const schema = "integration_" + randomUUID().replaceAll("-", "");
  let connected = false;
  let schemaCreated = false;

  async function open() {
    await client.connect();
    connected = true;
    await client.query(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    await client.query(`SET search_path TO "${schema}"`);
    await client.query(
      await readFile(resolve(__dirname, "../../../database/init.sql"), "utf8"),
    );
  }

  async function rollback() {
    if (connected) await client.query("ROLLBACK");
  }

  async function close() {
    try {
      if (connected) {
        await rollback();
        if (schemaCreated) await client.query(`DROP SCHEMA "${schema}" CASCADE`);
      }
    } finally {
      // end também libera o cliente quando a tentativa de conexão falha.
      await client.end();
    }
  }

  return { client, open, rollback, close };
}
