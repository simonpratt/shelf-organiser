APP := shelf-organiser
# Dev data lives outside the repo: SQLite misbehaves on the sandbox's host mount.
DEV_DATA_DIR ?= $(HOME)/.local/share/$(APP)

.PHONY: install model generate dev dev-fake build lint test check e2e e2e-speech smoke docker

install:
	pnpm install --frozen-lockfile

# The Whisper model named in apps/web/speech-model.json, into apps/web/public/models
# (gitignored), checked against its SHA-256s; only downloads what is missing.
model:
	node apps/web/scripts/fetch-model.mjs

# Regenerates the committed apps/server/internal/api/api.gen.go and
# apps/web/src/api/schema.gen.ts from apps/server/openapi/openapi.yaml.
generate:
	pnpm generate

# Go on :8080, Vite on :5173 (proxying /api to Go).
dev: model
	mkdir -p $(DEV_DATA_DIR)
	DATA_DIR=$(DEV_DATA_DIR) go run ./apps/server/cmd/$(APP) & \
	pnpm --filter ./apps/web dev; kill %1

# make dev with every Claude call answered by the shared Anthropic fake (test mode, so
# POST /api/test/reset is mounted too); no API key or network needed.
dev-fake:
	APP_TEST_MODE=1 ANTHROPIC_API_KEY=test-anthropic-key \
	ANTHROPIC_BASE_URL=http://localhost:8080/api/test/anthropic/ $(MAKE) dev

# The client first, so the binary embeds the current build.
build: model
	pnpm --filter ./apps/web build
	CGO_ENABLED=0 go build -o bin/$(APP) ./apps/server/cmd/$(APP)

test:
	go test -race ./...
	pnpm --filter ./apps/web test

# Builds first, so the suite can't pass against a stale binary.
e2e: build
	pnpm --filter ./test/e2e test --project api --project ui

# The real Whisper model on a committed clip in Chromium (about a minute).
e2e-speech: build
	pnpm --filter ./test/e2e test --project speech

# The @smoke subset against the image: make docker, then
# docker run --rm -p 8080:8080 $(APP), then this.
smoke:
	APP_TEST_URL=http://localhost:8080 pnpm --filter ./test/e2e test --project api --project ui --grep @smoke

# The fast pre-commit gate: format, vet, lint, typecheck, then the unit tests.
check: lint test

lint:
	@test -z "$$(gofmt -l apps)" || { gofmt -l apps; echo "run gofmt -w apps"; exit 1; }
	go vet ./...
	pnpm --filter ./apps/web typecheck
	pnpm --filter ./apps/web lint
	pnpm --filter ./test/e2e typecheck

docker:
	docker build -t $(APP) .
