import type { OnOrganizationCreatedHook } from "../core/service";
import { PostgresBlueprintRepository } from "../persistence/postgres-blueprint-repository";
import { PostgresCoreRepository } from "../persistence/postgres-core-repository";
import { BlueprintService } from "./service";

// SPEC-018 RN-001/RN-002; Plano Tecnico Revisado, itens 21 e 23: cria o primeiro Blueprint
// Version `draft` da Organization dentro da MESMA transacao fisica da criacao da propria
// Organization. Funciona porque `PostgresCoreRepository.transaction()`
// (persistence/postgres-core-repository.ts) reconstroi `new PostgresCoreRepository(client,
// true)` dentro do proprio callback e expoe esse `client` publicamente via `.connection` --
// este hook usa exatamente o mesmo `client` para instanciar o `PostgresBlueprintRepository`,
// garantindo que uma falha aqui reverte tambem a criacao da Organization (o mesmo
// `client.query("ROLLBACK")` ja existente em `CoreRepository.transaction()` cobre ambos).
//
// Nao cria Blueprint de forma lazy (RN-003): se este hook nunca for chamado (por exemplo, um
// `CoreService` sem `onOrganizationCreated` configurado, como em testes de fases anteriores
// que nao envolvem Blueprint), nenhum Blueprint e criado -- o comportamento das fases
// anteriores permanece inalterado.
export function createOrganizationBlueprintOnboardingHook(): OnOrganizationCreatedHook {
  return async (repository, organization) => {
    if (!(repository instanceof PostgresCoreRepository)) {
      // CoreService tambem pode ser usado com um CoreRepository nao-Postgres (por exemplo,
      // MemoryCoreRepository em cenarios sem banco); nesse caso nao ha um `client` fisico
      // compartilhavel e este hook simplesmente nao se aplica.
      return;
    }

    const blueprints = new PostgresBlueprintRepository(repository.connection);
    await BlueprintService.createInitialDraft(blueprints, organization.id);
  };
}
