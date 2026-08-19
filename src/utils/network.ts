export function isNetworkError(error: any) {
  const code = String(error?.code || error?.cause?.code || "");
  const message = String(error?.message || error?.cause?.message || "");

  return (
    code === "ECONNRESET" ||
    code === "ECONNREFUSED" ||
    code === "ETIMEDOUT" ||
    code === "ENOTFOUND" ||
    code === "EAI_AGAIN" ||
    code === "EPIPE" ||
    code === "ENETUNREACH" ||
    code === "EHOSTUNREACH" ||
    code === "ESOCKET" ||
    /ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|ESOCKET|socket hang up/i.test(
      message
    )
  );
}

export async function withNetworkRetries<T>(
  fn: () => Promise<T>,
  label: string,
  attempts = 3
): Promise<T> {
  let lastError: any;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      if (!isNetworkError(error) || attempt === attempts) {
        throw error;
      }

      console.warn(`[GoogleAuth] ${label} network error, retrying`, {
        attempt,
        code: error?.code,
        message: error?.message,
      });
      await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
    }
  }

  throw lastError;
}
