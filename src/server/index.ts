import { createServer } from "./app";
import { createPostgresCandidateService } from "./candidates/service";
import { createPostgresCompetencyService } from "./competencies/service";
import { createCoreService } from "./core/service";
import { createPostgresDnaService } from "./dna/service";
import { createPostgresJobOpeningService } from "./job-openings/service";
import { createPostgresJobProfileService } from "./job-profiles/service";
import { createPostgresOrganizationalUnitService } from "./organizational-units/service";
import { PostgresCoreRepository } from "./persistence/postgres-core-repository";
import { createPostgresPool, requirePostgresDatabaseUrl } from "./postgres";
import { createPostgresQuestionService } from "./questions/service";

const port = Number(process.env.PORT ?? 3001);
const connectionString = requirePostgresDatabaseUrl();
const pool = createPostgresPool(connectionString);
const app = createServer(
  createCoreService(new PostgresCoreRepository(pool)),
  createPostgresDnaService(pool),
  createPostgresOrganizationalUnitService(pool),
  createPostgresCompetencyService(pool),
  createPostgresJobProfileService(pool),
  createPostgresQuestionService(pool),
  createPostgresJobOpeningService(pool),
  createPostgresCandidateService(pool)
);

app.listen(port, () => {
  console.log(`Talent OS API listening on http://127.0.0.1:${port}`);
});
