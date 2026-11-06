import { readConfig } from "./config.ts";
import { startServer } from "./server.ts";

const srv = startServer(readConfig(process.env));
console.log(`tomu server listening on port ${srv.server.port}`);

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    void srv.stop().then(() => process.exit(0));
  });
}
