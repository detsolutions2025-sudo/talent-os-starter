import { createServer } from "./app";
import { createCoreService } from "./core/service";
import { createPostgresDnaService } from "./dna/service";
import { PostgresCoreRepository } from "./persistence/postgres-core-repository";
import { createPostgresPool, requirePostgresDatabaseUrl } from "./postgres";

const port = Number(process.env.PORT ?? 3001);
const connectionString = requirePostgresDatabaseUrl();
const pool = createPostgresPool(connectionString);
const app = createServer(
  createCoreService(new PostgresCoreRepository(pool)),
  createPostgresDnaService(pool)
);

app.listen(port, () => {
  console.log(`Talent OS API listening on http://127.0.0.1:${port}`);
});
