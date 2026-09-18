export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    // Fase 32 (ADR-0027 s9). Exclusivo de `tooManyRequests` (429) -- segundos ate a janela atual
    // expirar, usado pelo error handler global (`app.ts`) para emitir o header HTTP `Retry-After`.
    // Sempre `undefined` para todo outro tipo de erro (opcional, preserva byte a byte todo call
    // site existente de `AppError`/dos helpers abaixo que nao passa este argumento).
    public readonly retryAfterSeconds?: number
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function badRequest(code: string, message: string) {
  return new AppError(400, code, message);
}

export function forbidden(code: string, message: string) {
  return new AppError(403, code, message);
}

export function notFound(code: string, message: string) {
  return new AppError(404, code, message);
}

export function conflict(code: string, message: string) {
  return new AppError(409, code, message);
}

export function gone(code: string, message: string) {
  return new AppError(410, code, message);
}

export function tooManyRequests(code: string, message: string, retryAfterSeconds?: number) {
  return new AppError(429, code, message, retryAfterSeconds);
}

export function serviceUnavailable(code: string, message: string) {
  return new AppError(503, code, message);
}
