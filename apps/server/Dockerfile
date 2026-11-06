# The bundle is built beforehand: pnpm --filter @tomu/server build (dist/server.js).
FROM oven/bun:1.4.4-slim
WORKDIR /app
COPY dist/server.js ./server.js
COPY drizzle ./drizzle
RUN mkdir -p /data && chown bun:bun /data
ENV DB_PATH=/data/tomu.db \
    MIGRATIONS_FOLDER=/app/drizzle \
    PORT=3000 \
    TRUST_CLOUDFLARE=1
VOLUME /data
USER bun
EXPOSE 3000
CMD ["bun", "server.js"]
