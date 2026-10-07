const INVALID_RECOMMEND_REQUEST_URL = "https://recommend.invalid/recommend";

function invalidRequest(incoming: Headers): Request {
  return new Request(INVALID_RECOMMEND_REQUEST_URL, { headers: incoming });
}

export function buildRecommendOwnerRequest(incoming: Headers): Request {
  const host = incoming.get("host")?.trim() ?? "";
  const forwardedProto = incoming.get("x-forwarded-proto")?.trim().toLowerCase() ?? "";
  const protocol = forwardedProto || "http";

  if (!host || (protocol !== "http" && protocol !== "https")) {
    return invalidRequest(incoming);
  }

  try {
    const baseUrl = new URL(`${protocol}://${host}`);
    if (
      baseUrl.username
      || baseUrl.password
      || baseUrl.pathname !== "/"
      || baseUrl.search
      || baseUrl.hash
    ) {
      return invalidRequest(incoming);
    }
    return new Request(new URL("/recommend", baseUrl), { headers: incoming });
  } catch {
    return invalidRequest(incoming);
  }
}
