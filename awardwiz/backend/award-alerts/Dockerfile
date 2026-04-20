# hadolint global ignore=DL3016
FROM mcr.microsoft.com/playwright:v1.32.0

ENV CHROME_PATH=/ms-playwright/chromium-1055/chrome-linux/chrome
ENV DATABASE_PATH=/data/award-alerts.sqlite
ENV AWARD_ALERTS_PORT=2233
ENV PORT=2233

WORKDIR /usr/src/awardwiz

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm exec tsc

ENV NODE_ENV=production

EXPOSE 2233

CMD ["bash", "-lc", "mkdir -p \"$(dirname \"${DATABASE_PATH:-/data/award-alerts.sqlite}\")\" && if [ -z \"${DISPLAY:-}\" ] && command -v xvfb-run >/dev/null 2>&1; then exec xvfb-run -a node --enable-source-maps dist/awardwiz/workers/award-alerts-service.js; else exec node --enable-source-maps dist/awardwiz/workers/award-alerts-service.js; fi"]
