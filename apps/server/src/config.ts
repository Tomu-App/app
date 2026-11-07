export type Config = {
  port: number;
  dbPath: string;
  allowedOrigins: string[];
  /** Read the client IP from `cf-connecting-ip` (only when the server is reachable solely via Cloudflare). */
  trustCloudflare: boolean;
  migrationsFolder?: string;
};

export function readConfig(env: Record<string, string | undefined>): Config {
  return {
    port: Number(env.PORT ?? 3000),
    dbPath: env.DB_PATH ?? "./tomu.db",
    allowedOrigins: (env.ALLOWED_ORIGINS ?? "http://localhost:5173")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean),
    trustCloudflare: env.TRUST_CLOUDFLARE === "1",
    migrationsFolder: env.MIGRATIONS_FOLDER,
  };
}
