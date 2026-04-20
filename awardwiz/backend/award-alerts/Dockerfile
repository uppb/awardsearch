# hadolint global ignore=DL3016
FROM mcr.microsoft.com/playwright:v1.32.0

ENV CHROME_PATH=/ms-playwright/chromium-1055/chrome-linux/chrome
ENV AWARD_ALERTS_PORT=2233
ENV PORT=2233

WORKDIR /usr/src/awardwiz

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm exec tsc

ENV NODE_ENV=production

EXPOSE 2233

CMD ["bash", "-lc", "if [ -z \"${DISPLAY:-}\" ] && command -v xvfb-run >/dev/null 2>&1; then xvfb-run -a node --enable-source-maps dist/awardwiz/workers/award-alerts-service.js; else node --enable-source-maps dist/awardwiz/workers/award-alerts-service.js; fi"]
