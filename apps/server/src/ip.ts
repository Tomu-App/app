/** The client's IP, used only as a key for limits; never logged. */
export function clientIp(headers: Headers, socketIp: string | null, trustCloudflare: boolean): string {
  const cf = trustCloudflare ? headers.get("cf-connecting-ip") : null;
  return cf || socketIp || "unknown";
}

/**
 * Key for per-IP limits. IPv6 is grouped by /64 (one subscriber usually gets a whole /64,
 * so single addresses are free to rotate); IPv4-mapped IPv6 counts as the IPv4 address.
 */
export function limitKey(ip: string): string {
  const addr = ip.toLowerCase().split("%")[0]!;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(addr);
  if (mapped) return mapped[1]!;
  if (!addr.includes(":")) return addr;
  const [head = "", tail] = addr.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right];
  return `${groups
    .slice(0, 4)
    .map((g) => parseInt(g, 16).toString(16))
    .join(":")}::/64`;
}
