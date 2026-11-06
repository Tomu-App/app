# Running the server on the VPS

Two containers: `caddy` (TLS, ports 80 and 443) and `app` (the Bun server, only reachable through Caddy). The SQLite database lives in the Docker volume `data`.

## One-time setup

1. Install Docker with the Compose plugin.
2. Copy `daemon.json` to `/etc/docker/daemon.json` (log rotation: 10 MB, 3 files), then `sudo systemctl restart docker`.
3. Firewall: allow only 80, 443 and SSH. SSH only with a key (`PasswordAuthentication no`).
4. Copy `compose.yaml` and `Caddyfile` from this folder into a directory on the VPS, for example `/opt/tomu`.
5. Create `/opt/tomu/.env`:

   ```sh
   API_DOMAIN=api.tomu.foo
   ALLOWED_ORIGINS=https://tomu.foo
   ```

6. In the Cloudflare dashboard, create an origin certificate for `api.tomu.foo` (SSL/TLS, Origin Server). Save it as `/opt/tomu/certs/origin.pem` and the key as `/opt/tomu/certs/origin-key.pem`. Set the SSL mode of the zone to "Full (strict)".
7. DNS: `api.tomu.foo` as a proxied record (orange cloud) pointing at the VPS. WebSockets are allowed through the proxy by default.
8. If the GHCR package is private: `docker login ghcr.io` with a token that can read packages.
9. `docker compose up -d`, then check `curl https://api.tomu.foo/api/health` returns `{"ok":true}`.

## Update

CI publishes `ghcr.io/tomu-app/server:latest` on every push to `main` (when the repository variable `DEPLOY_ENABLED` is `true`). On the VPS:

```sh
cd /opt/tomu
docker compose pull && docker compose up -d
```

Migrations run when the server starts.

## Backup

The database uses WAL mode, so do not copy `tomu.db` on its own while the server runs. Use `sqlite3 /data/tomu.db ".backup /data/backup.db"` inside the container or a tool such as Litestream.
