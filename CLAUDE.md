# Shelf Organiser

A self-hosted, single-user app for working out what takes up the space in a shed or back room: items are entered on a phone with a size and nested tags. A Go server with SQLite serves an embedded React client, in one Docker image on the LAN-only homelab. `SPEC.md` is the spec.

## Commands

Run everything through the `Makefile`:

- `make install`: first, in a fresh clone (pnpm workspace deps).

- `make check`: `make lint` (gofmt, go vet, ESLint, both typechecks) then `make test`. Run before every commit.
- `make test`: unit tests only.
- `make e2e`: builds `bin/shelf-organiser`, then runs Playwright (`api` and Pixel 7 `ui` projects) against it on :8181.
- `make docker`: builds the image. `make smoke` runs the `@smoke` tests against `docker run --rm -p 8080:8080 shelf-organiser`.
- `make dev`: Go on :8080 and Vite on :5173 (proxying `/api`). `make dev-fake` is the same with dictation answered by the shared Anthropic fake. `make generate` after editing the OpenAPI spec.

Gotchas:

- **The e2e suite refuses a stale binary:** it fails if any file under `apps/` is newer than `bin/shelf-organiser`, so use `make e2e`, not `pnpm test` in `test/e2e`.
- **First Playwright run in a fresh sandbox:** from `test/e2e`, `npx playwright install chromium` then `sudo npx playwright install-deps chromium`.
- **SQLite** files belong in a temp dir or outside the repo, which sits on a host mount where SQLite can report I/O or locking errors; `make dev` uses `~/.local/share/shelf-organiser`.
- **Viewing the app:** run `make dev` in the background, wait for `http://localhost:8080/healthz`, then ask the user to run `sbx ports <sandbox-name> --publish 5173:5173` on their host (name from `$SANDBOX_NAME`).

## Layout

- `apps/server/openapi/openapi.yaml`: the hand-written API spec, source of truth for both sides. `make generate` rewrites the committed `apps/server/internal/api/api.gen.go` and `apps/web/src/api/schema.gen.ts`; commit all three together.
- `apps/server/cmd/shelf-organiser/`: `main.go` with the testable `run()`, and `main_test.go` app tests through it.
- `apps/server/internal/`: `config` (env), `store` (SQLite, goose migrations in `store/migrations/`, all queries), `api` (handlers for the generated strict interface), `dictation` (transcript to drafts via Claude, and `claudefake/`), `web` (serves the embedded client).
- `docs/adr/`: decisions, e.g. why dictation leaves speech-to-text to the phone keyboard.
- `apps/web/src/`: `pages/` arrange `components/`; logic lives in `items/` and `tags/` with `*.test.ts` beside it; `api/` holds the client and one TanStack Query hooks file per resource.
- `test/e2e/`: Playwright. Every spec imports `test` from `fixtures/test.ts` (resets the database before each test) and seeds through `fixtures/api.ts`.

## Conventions

- **Read `CONTEXT.md` first** and use its terms in code, API, UI copy and tests, never its _Avoid_ words ("dimension" is a top-level tag such as Location, never an item's physical size).
- **Go and frontend house rules** are the `homelab-go-service`, `homelab-frontend` and `homelab-testing` skills. Here the tokens are in `apps/web/src/index.css` and the catalogue is `/dev/components` (`catalogue.test.ts` fails when a component is missing from it). Check screens at 390 px.
- **Tags form one tree:** sibling names are unique ignoring case, a tag can't move inside its own subtree, and names can't contain `/` or `›` (how paths are typed and shown). `store_test.go` covers these.
- **Deleting a tag deletes its subtree;** items stay and lose those tags. The UI confirms first. Deleting an item instead offers Undo.
- **Items store litres per unit;** total space is litres × quantity. Size presets live only in `apps/web/src/items/size.ts` and are never stored.
- **Item writes take tag paths;** the server creates missing tags in the same transaction, so a rejected item leaves no stray tags.
- **Dictation is optional:** without `ANTHROPIC_API_KEY` the dictate button is hidden and `/api/dictation/drafts` 503s; typed entry must never depend on it. Drafts only ever carry existing tags (`dictation.Clean`) and nothing is saved until the client creates each item.
- **No test reaches the real Anthropic API.** Every layer uses `dictation/claudefake`: `httptest` in Go tests, and in e2e the server mounts it at `/api/test/anthropic/` and Playwright points `ANTHROPIC_BASE_URL` there. Its canned parsing is described in its package comment; a transcript containing `FAIL` makes it 500.
- **Test-only routes** (`POST /api/test/reset`, the fake above) exist only with `APP_TEST_MODE=1`; `main_test.go` proves they 404 otherwise. Every env var is in `.env.example` (`deploy_test.go` enforces it).
- **Scope:** one user on a LAN, no auth, nothing hosting- or ingress-related.

## Done means

`make check`, `make e2e` and `make docker` pass, and you have opened the changed screen in the running app at 390 px and reported what you checked.
