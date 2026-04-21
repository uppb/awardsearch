set dotenv-load

dockerarch := replace(replace(arch(), "aarch64", "arm64"), "x86_64", "amd64")
localtag := "awardsearch:scrapers"

[private]
default:
  @just --list

[private]
build:
  npm exec tsc

# ⭐️ builds, lints, checks dependencies and runs tests
check: build test
  TIMING=1 npm exec -- eslint --no-eslintrc --config .eslintrc.yml --ext .ts --max-warnings=0 .
  actionlint -color
  hadolint **/Dockerfile
  npm exec -- ajv -s config.schema.json -d config.json
  shellcheck **/*.sh .devcontainer/**/*.sh
  NODE_NO_WARNINGS=1 npm exec -- depcheck --ignores depcheck,npm-check,typescript,devtools-protocol,@types/har-format,@vitest/coverage-c8,vite-node,geo-tz,typescript-json-schema,ajv-cli
  @echo 'ok'

# runs the github actions checks, note that this needs a properly configured .env
check-with-act:
  act --job run-checks --rm
  @echo 'ok'

# ⭐️ runs the tests (with stubs/mocks)
test:
  npm exec -- vitest run ./test

# runs an interactive npm package update tool to get the latest versions of everything
lets-upgrade-packages:
  npm exec -- npm-check -u

##############################
# SCRAPER SUPPORT
##############################

# generate .schema.json files from .ts files
gen-json-schemas: build
  npm exec -- typescript-json-schema tsconfig.json ScrapersConfig --topRef --noExtraProps | sed 's/import.*)\.//g' > config.schema.json

run-award-alerts-service: build
  mkdir -p "$(dirname "${DATABASE_PATH:-./tmp/award-alerts.sqlite}")"
  if [ -z "${DISPLAY:-}" ] && command -v xvfb-run >/dev/null 2>&1; then \
    DATABASE_PATH="${DATABASE_PATH:-./tmp/award-alerts.sqlite}" AWARD_ALERTS_PORT="${AWARD_ALERTS_PORT:-2233}" CHROME_PATH="${CHROME_PATH:-$(command -v google-chrome || command -v google-chrome-stable || command -v chromium || command -v chromium-browser || printf '%s' /usr/sbin/chromium)}" xvfb-run -a node --enable-source-maps dist/awardsearch/workers/award-alerts-service.js; \
  else \
    DATABASE_PATH="${DATABASE_PATH:-./tmp/award-alerts.sqlite}" AWARD_ALERTS_PORT="${AWARD_ALERTS_PORT:-2233}" node --enable-source-maps dist/awardsearch/workers/award-alerts-service.js; \
  fi

build-award-alerts-service-docker tag="awardsearch:award-alerts":
  docker buildx build --file ./awardsearch/backend/award-alerts/Dockerfile -t {{tag}} .

##############################
# SCRAPERS
##############################

# ⭐️ starts a scraper locally (uses xvfb-run automatically when no DISPLAY is available)
run-scraper scraper origin destination date: build
  if [ -z "${DISPLAY:-}" ] && command -v xvfb-run >/dev/null 2>&1; then \
    CHROME_PATH="${CHROME_PATH:-$(command -v google-chrome || command -v google-chrome-stable || command -v chromium || command -v chromium-browser || printf '%s' /usr/sbin/chromium)}" xvfb-run -a node --enable-source-maps dist/awardsearch-scrapers/main-debug.js {{scraper}} {{origin}} {{destination}} {{date}}; \
  else \
    node --enable-source-maps dist/awardsearch-scrapers/main-debug.js {{scraper}} {{origin}} {{destination}} {{date}}; \
  fi

# runs live anti-botting tests online against a variety of websites bot fingerprinting websites (EXPERIMENTAL and still doesn't fully succeed)
run-live-botting-tests: build
  node --enable-source-maps dist/arkalis/test-anti-botting.js
