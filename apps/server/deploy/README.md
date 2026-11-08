# Running the server on the VPS

Two containers: `cloudflared` (Cloudflare Tunnel) and `app` (the Bun server). `cloudflared` opens an outbound connection to Cloudflare and forwards requests for `api.tomu.foo` to `app:3000` over the Compose network. No port is published on the host, so the server can share a VPS with other services (for example an nginx that already holds 80 and 443). The SQLite database lives in the external Docker volume `tomu_data`.

## Domains

- `tomu.foo`: the site (Worker, repo `site`).
- `app.tomu.foo`: the app (static files, Worker).
- `api.tomu.foo`: this server (VPS, reached through a Cloudflare Tunnel).

## One-time setup

1. Install Docker with the Compose plugin (skip if the VPS already has it).
2. Log rotation (10 MB, 3 files) in `/etc/docker/daemon.json`. If the file does not exist yet, copy `daemon.json` from this folder. If it exists (another project on the VPS), merge the `log-driver` and `log-opts` keys into it instead of overwriting it. Then `sudo systemctl restart docker`; this restarts every container on the host, so pick a quiet moment. The file stays owned by root:

   ```sh
   sudo chown root:root /etc/docker/daemon.json
   sudo chmod 644 /etc/docker/daemon.json
   ```

   The new defaults apply only to containers created after the restart.

3. Firewall: this server needs no inbound port. Leave existing rules for other services as they are. SSH only with a key (`PasswordAuthentication no`).
4. Create a `tomu` user that runs everything below. Members of the `docker` group can control Docker, which is root-equivalent, so use this user for nothing else and give it key-only SSH login:

   ```sh
   sudo useradd --create-home --shell /bin/bash tomu
   sudo usermod -aG docker tomu
   sudo install -d -m 700 -o tomu -g tomu /home/tomu/.ssh
   sudo install -m 600 -o tomu -g tomu ~/.ssh/authorized_keys /home/tomu/.ssh/authorized_keys
   sudo install -d -m 750 -o tomu -g tomu /opt/tomu
   ```

   Then log in as `tomu` for the remaining steps. Copy `compose.yaml` from this folder into `/opt/tomu`.

5. Create the tunnel in the Cloudflare dashboard (Zero Trust, Networking, Tunnels, "Create a tunnel", type Cloudflared). Copy the token from the install command it shows (the long string after `--token`). Under "Public hostname", add `api.tomu.foo` with service `HTTP` and URL `app:3000`. Cloudflare then creates the proxied DNS record for `api.tomu.foo` itself; delete any older A or AAAA record for that name first.
6. Create `/opt/tomu/.env`:

   ```sh
   ALLOWED_ORIGINS=https://app.tomu.foo
   TUNNEL_TOKEN=<token from step 5>
   ```

   `ALLOWED_ORIGINS` must name the origin of the app: without it the server rejects the app's WebSocket upgrade with 403. The site on `tomu.foo` does not talk to this server. Add preview origins of the app to the list, comma-separated, when you need them.

   The token lets anyone run a connector for this tunnel and serve `api.tomu.foo`. Keep it private, and rotate it in the dashboard (tunnel, "Refresh token") if it leaks:

   ```sh
   chmod 600 /opt/tomu/.env
   ```

   If you created the file as root, fix it first: `sudo chown -R tomu:tomu /opt/tomu`.

7. If the GHCR package is private: `docker login ghcr.io` with a token that can read packages.
8. Create the volume for the database once:

   ```sh
   docker volume create tomu_data
   ```

   `compose.yaml` marks it as external, so Compose never creates or deletes it. Without this step `docker compose up` fails with "external volume not found". See "Keeping the database" below.

9. `docker compose up -d`, then check `curl https://api.tomu.foo/api/health` returns `{"ok":true}` and the tunnel shows "Healthy" in the dashboard. WebSockets pass through the tunnel without extra settings.

## Why `cf-connecting-ip` can be trusted

The server trusts the `cf-connecting-ip` header for its per-IP limits (`TRUST_CLOUDFLARE=1` in the image). Cloudflare sets this header at its edge, and the only way into `app` from outside is the tunnel, because `app` publishes no port. Processes on the VPS itself can still reach the container over the Docker bridge network and send any header, so keep the VPS free of untrusted users and services.

## Logs

The app does not log IP addresses or URLs. `cloudflared` runs with `--loglevel fatal`, because its request errors (for example a 502 while `app` restarts) contain the full URL. Connection problems still show up through `--transport-loglevel warn`. To check after setup: `docker compose stop app`, request `https://api.tomu.foo/api/health` once, `docker compose start app`, then `docker compose logs cloudflared` must not contain the path. Docker keeps at most 3 x 10 MB per container (`daemon.json`).

## Update

CI publishes `ghcr.io/tomu-app/server:latest` on pushes to `main` that change the image, and `ghcr.io/tomu-app/server:X.Y.Z` on version tags `vX.Y.Z` (when the repository variable `DEPLOY_ENABLED` is `true`). On the VPS:

```sh
cd /opt/tomu
docker compose pull && docker compose up -d
docker image prune -f
```

Migrations run when the server starts. `cloudflared` is pinned in `compose.yaml`; raise the version there to update it.

## Keeping the database

The database is `/data/tomu.db` in the volume `tomu_data`. These do **not** touch it: `docker compose down`, `down -v`, `pull`, `up`, recreating or removing containers, renaming `/opt/tomu`.

These **delete** it:

- `docker volume rm tomu_data`
- `docker volume prune -a` or `docker system prune -a --volumes` while `app` is stopped (they remove every volume no container uses)

If the `data:/data` mount is ever missing from `compose.yaml`, the server does not lose data, but it starts with an empty database: the image declares `VOLUME /data`, so Docker mounts a fresh anonymous volume there. Restore the mount and the old data is back. `docker volume ls` shows whether `tomu_data` still exists.

## Backup

The database uses WAL mode, so do not copy `tomu.db` on its own while the server runs. The image has no `sqlite3` CLI; Bun's built-in SQLite writes a consistent copy with `VACUUM INTO` while the server keeps running:

```sh
cd /opt/tomu
install -d -m 700 backups
docker compose exec -T app rm -f /data/backup.db
docker compose exec -T app bun -e "new (require('bun:sqlite').Database)('/data/tomu.db').run(\"VACUUM INTO '/data/backup.db'\")"
docker compose cp app:/data/backup.db "backups/tomu-$(date +%F).db"
docker compose exec -T app rm /data/backup.db
find backups -name 'tomu-*.db' -mtime +14 -delete
```

`VACUUM INTO` refuses to overwrite an existing file, hence the first `rm`. Run this daily from the `tomu` user's crontab (as a script in `/opt/tomu`), and copy `backups/` off the VPS regularly (for example `rsync` from another machine). A backup that only lives on the VPS does not survive losing the VPS.

To restore (replace the date):

```sh
cd /opt/tomu
docker compose stop app
docker compose run --rm --no-deps --user root -v ./backups:/b app sh -c \
  'cp /b/tomu-2026-01-31.db /data/tomu.db && rm -f /data/tomu.db-wal /data/tomu.db-shm && chown bun:bun /data/tomu.db'
docker compose start app
```

The old `-wal` and `-shm` files must go: SQLite would otherwise apply the old journal to the restored database.
