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
