export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export function unauthorized(message = "Authentication is required.") {
  return new HttpError(401, "unauthorized", message);
}

export function forbidden(message = "You do not have access to this resource.") {
  return new HttpError(403, "forbidden", message);
}

export function badRequest(message: string) {
  return new HttpError(400, "bad_request", message);
}

export function conflict(message: string, code = "conflict") {
  return new HttpError(409, code, message);
}

export function serviceUnavailable(message: string) {
  return new HttpError(503, "service_unavailable", message);
}
