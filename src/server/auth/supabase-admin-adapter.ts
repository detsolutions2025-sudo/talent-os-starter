// Fase 29. Adapter REAL sobre `@supabase/supabase-js`. Nunca importado por `src/client/*`
// (verificado por P-14, teste sobre o output do build) -- a service-role key so existe aqui,
// server-side.
//
// Nota de integracao (honesta): esta implementacao segue a superficie documentada da Admin API
// do supabase-js v2 (`auth.admin.inviteUserByEmail`, `auth.admin.signOut`) e do client publico
// (`auth.refreshSession`, `auth.signOut`), mas nao foi exercitada contra um projeto Supabase
// real nesta tarefa -- nenhuma credencial de projeto (`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`)
// esta configurada neste ambiente. `FakeSupabaseAdminPort` (tests/phase29/helpers.ts) cobre todo
// o comportamento de `AuthService` sem depender desta classe. Primeira integracao ao vivo deve
// confirmar a forma exata da resposta antes de habilitar em producao.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { serviceUnavailable } from "../core/errors";
import type { SupabaseAdminPort, SupabaseSession } from "./supabase-admin-port";
import type { SupabaseAuthConfig } from "./config";

export class SupabaseAdminAdapter implements SupabaseAdminPort {
  private readonly admin: SupabaseClient;
  private readonly anon: SupabaseClient;

  constructor(config: SupabaseAuthConfig, anonKey: string) {
    // Cliente administrativo: service-role key, nunca usado para operacoes escopadas a um
    // usuario especifico (refresh/logout local usam o cliente anonimo abaixo).
    this.admin = createClient(config.url, config.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    // Cliente anonimo: usado apenas para operacoes que ja carregam a propria credencial do
    // usuario (refresh token) -- nunca precisa nem deve usar a service-role key.
    this.anon = createClient(config.url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }

  async inviteUserByEmail(email: string) {
    const { data, error } = await this.admin.auth.admin.inviteUserByEmail(email);
    if (error || !data?.user) {
      throw serviceUnavailable("auth_provider_invite_failed", "Failed to send invitation email.");
    }
    return { externalId: data.user.id };
  }

  async refreshSession(refreshToken: string): Promise<SupabaseSession> {
    const { data, error } = await this.anon.auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data?.session) {
      throw serviceUnavailable("auth_provider_refresh_failed", "Failed to refresh session.");
    }
    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at ?? 0
    };
  }

  async revokeRefreshToken(refreshToken: string) {
    // O client publico nao expõe "invalidar apenas este refresh token" isoladamente sem uma
    // sessao ja estabelecida; estabelece a sessao a partir do refresh recebido e entao encerra
    // localmente (scope "local"), suficiente para o caso de logout comum (SPEC-028 s9).
    await this.anon.auth.setSession({ access_token: "", refresh_token: refreshToken });
    await this.anon.auth.signOut({ scope: "local" });
  }

  async signOutAllSessions(externalId: string) {
    const { error } = await this.admin.auth.admin.signOut(externalId, "global");
    if (error) {
      throw serviceUnavailable("auth_provider_signout_failed", "Failed to revoke sessions.");
    }
  }
}

export function createSupabaseAdminAdapter(config: SupabaseAuthConfig, anonKey: string) {
  return new SupabaseAdminAdapter(config, anonKey);
}
