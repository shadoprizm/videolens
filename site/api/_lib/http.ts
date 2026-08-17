const PRODUCTION_EXTENSION_ORIGIN = "chrome-extension://plhohhmnkfidolnjnmdaenhdjkbbledl";

function allowedOrigin(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  if (origin === PRODUCTION_EXTENSION_ORIGIN) return origin;
  if (origin === "https://videolens.io" || origin === "https://www.videolens.io") return origin;
  if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) return origin;
  return null;
}

export function corsHeaders(request: Request): HeadersInit {
  const origin = allowedOrigin(request);
  return {
    ...(origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Stripe-Signature",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
}

export function json(
  request: Request,
  data: unknown,
  status = 200,
  headers: HeadersInit = {},
): Response {
  return Response.json(data, {
    status,
    headers: { ...corsHeaders(request), ...headers },
  });
}

export function empty(request: Request, status = 204): Response {
  return new Response(null, { status, headers: corsHeaders(request) });
}

export function options(request: Request): Response | null {
  return request.method === "OPTIONS" ? empty(request) : null;
}

export async function readJson<T>(request: Request, maxBytes = 4_000_000): Promise<T> {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    throw new ApiError(413, "request_too_large", "The request is too large.");
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new ApiError(400, "invalid_json", "The request body must be valid JSON.");
  }
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function errorResponse(request: Request, error: unknown): Response {
  if (error instanceof ApiError) {
    return json(request, { error: error.code, message: error.message }, error.status);
  }
  console.error("VideoLens API error", error instanceof Error ? error.message : error);
  return json(request, { error: "server_error", message: "VideoLens could not complete that request." }, 500);
}
