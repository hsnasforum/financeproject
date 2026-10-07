import { type NextRequest } from "next/server";

// Preserve Auth.js CSRF / OAuth state and PKCE handling and its original response.
// The desktop boundary must return before calling these web protocol adapters.
export async function handleWebAuthGet(request: NextRequest): Promise<Response> {
  const { handlers } = await import("@/auth");
  return handlers.GET(request);
}

export async function handleWebAuthPost(request: NextRequest): Promise<Response> {
  const { handlers } = await import("@/auth");
  return handlers.POST(request);
}
