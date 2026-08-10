export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
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

export function tooManyRequests(code: string, message: string) {
  return new AppError(429, code, message);
}

export function serviceUnavailable(code: string, message: string) {
  return new AppError(503, code, message);
}
