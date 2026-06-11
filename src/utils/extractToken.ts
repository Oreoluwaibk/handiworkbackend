/** Strip optional "Bearer " prefix from Authorization header value. */
export function extractToken(authorization?: string | null): string | null {
  if (!authorization) return null;
  const trimmed = authorization.trim();
  if (trimmed.toLowerCase().startsWith("bearer ")) {
    return trimmed.slice(7).trim();
  }
  return trimmed;
}
