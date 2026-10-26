import { once } from "node:events";
import type { Server } from "node:http";
import { createApp } from "../../src/app";
import { createTestDatabase } from "./database";
import { createHttpClient } from "./http";
import { createEnrollmentPrerequisites } from "./fixtures";

// Chamar dentro de describe registra os hooks apenas para aquela suíte.
// Cada arquivo tem seu próprio cliente; não usar test.concurrent com transações.
export function useIntegrationApp() {
  const database = createTestDatabase();
  let server: Server | undefined;
  let baseUrl: string;
  const http = createHttpClient(() => baseUrl);

  beforeAll(async () => {
    await database.open();
    server = createApp(database.client).listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Porta HTTP indisponível.");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  }, 15000);

  beforeEach(async () => {
    await database.client.query("BEGIN");
  });

  afterEach(database.rollback);

  afterAll(async () => {
    try {
      const runningServer = server;
      if (runningServer) {
        await new Promise<void>((resolve, reject) => {
          runningServer.close((error) => (error ? reject(error) : resolve()));
          runningServer.closeAllConnections();
        });
      }
    } finally {
      await database.close();
    }
  });

  return {
    client: database.client,
    ...http,
    fixtures: () => createEnrollmentPrerequisites(http.request),
  };
}
