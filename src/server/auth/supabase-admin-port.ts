// Fase 29 (ADR-0026 "Supabase Auth (GoTrue)"; SPEC-028 s24/s37). Fronteira explicita entre a
// aplicacao e o provider -- mesmo padrao de porta/adapter ja usado por `ai/providers`
// (`ProviderAdapter`/`UnavailableProviderAdapter`). `AuthService` depende apenas desta
// interface, nunca de `@supabase/supabase-js` diretamente -- permite `FakeSupabaseAdminPort`
// nos testes (tests/phase29/helpers.ts) sem rede, e troca de provider no futuro sem tocar
// `AuthService`.
export type SupabaseSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch seconds
};

export interface SupabaseAdminPort {
  // SPEC-028 s15/s16: cria a identidade em estado nao confirmado e envia o e-mail de convite.
  // Retorna o `external_id` (auth.users.id) para permitir rastreio, mas a aplicacao NUNCA cria
  // AuthIdentity/User a partir deste retorno -- so a partir do aceite confirmado (SPEC-028 s27).
  inviteUserByEmail(email: string): Promise<{ externalId: string }>;

  // Renovacao server-side (SPEC-028 s9/s13): usa a chave anonima (nao a service-role), escopada
  // ao proprio refresh token do usuario -- nunca privilegio elevado.
  refreshSession(refreshToken: string): Promise<SupabaseSession>;

  // Logout local (SPEC-028 s9): invalida o refresh token apresentado, sem afetar outras sessoes
  // do mesmo AuthIdentity.
  revokeRefreshToken(refreshToken: string): Promise<void>;

  // Logout global (SPEC-028 s9/s25): API administrativa, invalida TODAS as sessoes daquele
  // AuthIdentity -- reservado a Platform Admin ou ao proprio usuario sobre a propria conta.
  signOutAllSessions(externalId: string): Promise<void>;
}
