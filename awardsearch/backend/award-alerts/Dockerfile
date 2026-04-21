# hadolint global ignore=DL3016
# Use a modern Playwright image so the service can target both linux/amd64 and linux/arm64.
# Keep the browser runtime packaged in-container because award-alerts still executes Chromium directly.
FROM mcr.microsoft.com/playwright:v1.58.2-noble

# better-sqlite3 may need to compile from source when no prebuilt binary exists
# for the Node runtime bundled in the Playwright image.
RUN apt-get update && apt-get install -y --no-install-recommends \
  build-essential \
  && rm -rf /var/lib/apt/lists/*

ENV DATABASE_PATH=/data/award-alerts.sqlite
ENV AWARD_ALERTS_PORT=2233
ENV PORT=2233

WORKDIR /usr/src/awardsearch

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm exec tsc

ENV NODE_ENV=production

EXPOSE 2233

CMD ["bash", "-lc", "mkdir -p \"$(dirname \"${DATABASE_PATH:-/data/award-alerts.sqlite}\")\" && if [ -z \"${DISPLAY:-}\" ] && command -v Xvfb >/dev/null 2>&1; then Xvfb :99 -screen 0 1280x1024x24 -nolisten tcp >/tmp/xvfb.log 2>&1 & export DISPLAY=:99; fi && exec node --enable-source-maps dist/awardsearch/workers/award-alerts-service.js"]
