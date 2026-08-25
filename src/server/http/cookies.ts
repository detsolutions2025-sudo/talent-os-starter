// Fase 29 (SPEC-028 s9/s10/s13). Dois cookies HttpOnly, nunca acessiveis a JavaScript do
// frontend -- elimina a classe inteira de roubo de token via XSS no armazenamento. Nenhum
// cookie-parser inteiro adicionado; `cookie` (funcao unica) e suficiente, ja que este e o unico
// lugar do projeto que le/escreve cookies hoje.
import { parseCookie, stringifySetCookie } from "cookie";
import type { Request, Response } from "express";

export const ACCESS_COOKIE = "sb_at";
export const REFRESH_COOKIE = "sb_rt";

// SPEC-028 s9: access token de vida curta (ordem de 1h -- valor exato de configuracao do
// provider, este e apenas o Max-Age do cookie); refresh de vida mais longa.
const ACCESS_MAX_AGE_SECONDS = 60 * 60;
const REFRESH_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export function readSessionCookies(request: Request) {
  const header = request.headers.cookie;
  const parsed = header ? parseCookie(header) : {};
  return {
    accessToken: parsed[ACCESS_COOKIE] ?? null,
    refreshToken: parsed[REFRESH_COOKIE] ?? null
  };
}

export function setSessionCookies(
  response: Response,
  session: { accessToken: string; refreshToken: string },
  secure: boolean
) {
  response.setHeader("Set-Cookie", [
    stringifySetCookie({
      name: ACCESS_COOKIE,
      value: session.accessToken,
      ...cookieOptions(secure, ACCESS_MAX_AGE_SECONDS)
    }),
    stringifySetCookie({
      name: REFRESH_COOKIE,
      value: session.refreshToken,
      ...cookieOptions(secure, REFRESH_MAX_AGE_SECONDS)
    })
  ]);
}

export function clearSessionCookies(response: Response, secure: boolean) {
  response.setHeader("Set-Cookie", [
    stringifySetCookie({ name: ACCESS_COOKIE, value: "", ...cookieOptions(secure, 0) }),
    stringifySetCookie({ name: REFRESH_COOKIE, value: "", ...cookieOptions(secure, 0) })
  ]);
}

// SPEC-028 s9: HttpOnly + Secure (producao) + SameSite=Lax + Path restrito a /api -- a fronteira
// que a aplicacao ja audita. `secure: false` em desenvolvimento porque o dev server local roda
// sobre HTTP simples (127.0.0.1); nunca `false` em producao (controlado pelo chamador via
// `APP_ENV`, nunca hardcoded aqui).
function cookieOptions(secure: boolean, maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/api",
    maxAge: maxAgeSeconds
  };
}
