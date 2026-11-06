/** The client's IP, used only as a key for limits; never logged. */
export function clientIp(headers: Headers, socketIp: string | null, trustCloudflare: boolean): string {
  const cf = trustCloudflare ? headers.get("cf-connecting-ip") : null;
  return cf || socketIp || "unknown";
}
