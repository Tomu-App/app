# Running the server on the VPS

Two containers: `caddy` (TLS, ports 80 and 443) and `app` (the Bun server, only reachable through Caddy). The SQLite database lives in the Docker volume `data`.

## Domains

- `tomu.foo`: the site (Worker, repo `site`).
- `app.tomu.foo`: the app (static files, Worker).
- `api.tomu.foo`: this server (VPS behind the Cloudflare proxy).

## One-time setup

1. Install Docker with the Compose plugin.
2. Copy `daemon.json` to `/etc/docker/daemon.json` (log rotation: 10 MB, 3 files), then `sudo systemctl restart docker`.
3. Firewall: allow only 80, 443 and SSH. SSH only with a key (`PasswordAuthentication no`).
4. Copy `compose.yaml` and `Caddyfile` from this folder into a directory on the VPS, for example `/opt/tomu`.
5. Create `/opt/tomu/.env`:

   ```sh
   API_DOMAIN=api.tomu.foo
   ALLOWED_ORIGINS=https://app.tomu.foo
   ```

   `ALLOWED_ORIGINS` must name the origin of the app: without it the server rejects the app's WebSocket upgrade with 403. The site on `tomu.foo` does not talk to this server. Add preview origins of the app to the list, comma-separated, when you need them.

6. In the Cloudflare dashboard, create an origin certificate for `api.tomu.foo` (SSL/TLS, Origin Server). Save it as `/opt/tomu/certs/origin.pem` and the key as `/opt/tomu/certs/origin-key.pem`. Set the SSL mode of the zone to "Full (strict)".
7. Turn on Authenticated Origin Pulls for the zone (SSL/TLS, Origin Server, "Authenticated Origin Pulls", zone-level). Download Cloudflare's origin-pull CA certificate (linked there as `authenticated_origin_pull_ca.pem`) and save it as `/opt/tomu/certs/cloudflare-origin-pull-ca.pem`. Caddy then rejects every TLS connection that does not come from Cloudflare. This matters: the server trusts the `cf-connecting-ip` header for its per-IP limits, and without this check anyone connecting to the VPS directly could forge it.
8. DNS: `api.tomu.foo` as a proxied record (orange cloud) pointing at the VPS. WebSockets are allowed through the proxy by default.
9. If the GHCR package is private: `docker login ghcr.io` with a token that can read packages.
10. `docker compose up -d`, then check `curl https://api.tomu.foo/api/health` returns `{"ok":true}`. A direct request to the VPS (`curl -k --resolve api.tomu.foo:443:<vps-ip> https://api.tomu.foo/api/health`) must fail the TLS handshake.

## Logs

Neither the app nor Caddy logs IP addresses or URLs (Caddy's global `log` filter deletes them). Docker keeps at most 3 x 10 MB per container (`daemon.json`).

## Update

CI publishes `ghcr.io/tomu-app/server:latest` on every push to `main` (when the repository variable `DEPLOY_ENABLED` is `true`). On the VPS:

```sh
cd /opt/tomu
docker compose pull && docker compose up -d
```

Migrations run when the server starts.

## Backup

The database uses WAL mode, so do not copy `tomu.db` on its own while the server runs. Use `sqlite3 /data/tomu.db ".backup /data/backup.db"` inside the container or a tool such as Litestream.
