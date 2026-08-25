import type { Request } from "express";
import { forbidden } from "../core/errors";
import type { Actor } from "../core/types";
import type { AuthService } from "../auth/service";
import { getActor } from "./dev-auth";
import { readSessionCookies } from "./cookies";

// Fase 29 (ADR-0026 "Dev/test auth"; SPEC-028 s22). Resolucao de Actor passa a ter duas
// implementacoes possiveis por tras da MESMA interface -- nunca as duas simultaneamente
// disponiveis no mesmo processo em execucao. A escolha e feita UMA VEZ no boot
// (`createActorProvider`, chamado por index.ts), nunca por requisicao/escolha do cliente.
export interface ActorProvider {
  resolve(request: Request): Promise<Actor>;
}

// `dev-auth.ts` permanece intocado, byte a byte (ADR-0026) -- este wrapper apenas adapta a
// funcao sincrona existente a interface assincrona comum, sem alterar nenhuma linha daquele
// arquivo nem sua trava de `APP_ENV` (ja fail-closed fora de development/test).
export class DevActorProvider implements ActorProvider {
  async resolve(request: Request): Promise<Actor> {
    return getActor(request);
  }
}

// SPEC-028 s8/s10/s12: cookie -> verificacao local de assinatura (JWKS) -> external_id ->
// AuthIdentity -> User -> Actor. Nunca le `x-dev-user-id`/`x-dev-platform-admin` -- essa
// ausencia estrutural (nao apenas uma checagem condicional) e a defesa contra P-01/P-02: nao ha
// nenhum caminho de codigo, dentro desta classe, capaz de ler esses headers.
export class SupabaseActorProvider implements ActorProvider {
  constructor(private readonly authService: AuthService) {}

  async resolve(request: Request): Promise<Actor> {
    const { accessToken } = readSessionCookies(request);
    if (!accessToken) {
      throw forbidden("session_required", "A valid session is required.");
    }
    const claims = await this.authService.verifyToken(accessToken);
    return this.authService.resolveActor(claims);
  }
}

export function createActorProvider(
  appEnv: string,
  deps: { authService?: AuthService }
): ActorProvider {
  if (appEnv === "development" || appEnv === "test") {
    return new DevActorProvider();
  }
  if (!deps.authService) {
    // Fail-fast: nunca cai de volta para DevActorProvider por ausencia de configuracao --
    // mesma disciplina de `requireSupabaseAuthConfig` (auth/config.ts).
    throw new Error("AuthService is required to resolve Actor outside development/test.");
  }
  return new SupabaseActorProvider(deps.authService);
}
