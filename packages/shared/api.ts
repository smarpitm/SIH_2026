export function ok<T>(data: T) {
  return { ok: true as const, data };
}

export function err(code: import("./constants").ErrorCode, message: string, details?: unknown) {
  return { ok: false as const, error: { code, message, details } };
}

export function jsonOk<T>(data: T, status = 200) {
  return Response.json(ok(data), { status });
}

export function jsonErr(
  code: import("./constants").ErrorCode,
  message: string,
  details?: unknown,
  status?: number
) {
  const map: Record<string, number> = {
    VALIDATION_ERROR: 400,
    AUTH_REQUIRED: 401,
    AUTH_FORBIDDEN: 403,
    JURISDICTION_FORBIDDEN: 403,
    INVALID_STATE_TRANSITION: 409,
    RESCHEDULE_BUDGET_EXHAUSTED: 409,
    NOT_FOUND: 404,
    CONFLICT: 409,
    UNSUPPORTED_MEDIA_TYPE: 415,
    RATE_LIMITED: 429,
    INTERNAL: 500,
  };
  return Response.json(err(code, message, details), { status: status ?? map[code] ?? 500 });
}