// Fase 29 (ADR-0026 s"Decisao Arquitetural"; SPEC-028 s24). Frontend fala com o provider
// DIRETAMENTE para a credencial (login, reset de senha, reenvio de verificacao) -- a API da
// aplicacao nunca ve a senha. `persistSession: false` e o ponto central desta configuracao: o
// SDK do Supabase NUNCA grava o token em localStorage -- a sessao so passa a existir, do lado do
// navegador, como o cookie HttpOnly emitido pelo servidor via `/api/auth/session` (ver
// `apiClient.ts`/`LoginScreen.tsx`). Sem isso, o proprio SDK reintroduziria a classe de risco
// (token acessivel a JS) que o cookie HttpOnly foi escolhido para eliminar.
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseAuthConfigured = Boolean(url && anonKey);

// `null` quando as variaveis nao estao configuradas (por exemplo, ambiente de desenvolvimento
// atual, que ainda usa dev-auth) -- os consumidores (LoginScreen) devem checar
// `isSupabaseAuthConfigured` antes de usar.
export const supabase = isSupabaseAuthConfigured
  ? createClient(url as string, anonKey as string, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: true }
    })
  : null;
