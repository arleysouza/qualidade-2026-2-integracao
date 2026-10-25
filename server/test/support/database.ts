import { Client } from "pg";

// Uma conexão por arquivo; as tabelas são criadas pelo Compose.
export function createTestDatabase() {
  const client = new Client({
    connectionString: process.env.TEST_DATABASE_URL ??
      "postgresql://postgres:postgres@127.0.0.1:5434/aula3_test",
    connectionTimeoutMillis: 5000,
  });
  let connected = false;

  async function open() {
    await client.connect();
    connected = true;
  }

  async function rollback() {
    if (connected) await client.query("ROLLBACK");
  }

  async function close() {
    try {
      if (connected) {
        await rollback();
      }
    } finally {
      // end também libera o cliente quando a tentativa de conexão falha.
      await client.end();
    }
  }

  return { client, open, rollback, close };
}
