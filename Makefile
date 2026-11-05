APP := shelf-organiser
# Dev data lives outside the repo: SQLite misbehaves on the sandbox's host mount.
DEV_DATA_DIR ?= $(HOME)/.local/share/$(APP)

.PHONY: install generate dev build lint test check e2e smoke docker

install:
	pnpm install --frozen-lockfile

# Regenerates the committed apps/server/internal/api/api.gen.go and
# apps/web/src/api/schema.gen.ts from apps/server/openapi/openapi.yaml.
generate:
	pnpm generate

# Go on :8080, Vite on :5173 (proxying /api to Go).
dev:
	mkdir -p $(DEV_DATA_DIR)
	DATA_DIR=$(DEV_DATA_DIR) go run ./apps/server/cmd/$(APP) & \
	pnpm --filter ./apps/web dev; kill %1

# The client first, so the binary embeds the current build.
build:
	pnpm --filter ./apps/web build
	CGO_ENABLED=0 go build -o bin/$(APP) ./apps/server/cmd/$(APP)

test:
	go test -race ./...
	pnpm --filter ./apps/web test

# Builds first, so the suite can't pass against a stale binary.
e2e: build
	pnpm --filter ./test/e2e test

# The @smoke subset against the image: make docker, then
# docker run --rm -p 8080:8080 $(APP), then this.
smoke:
	APP_TEST_URL=http://localhost:8080 pnpm --filter ./test/e2e test --grep @smoke

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
