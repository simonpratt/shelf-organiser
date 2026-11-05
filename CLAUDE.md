# Shelf Organiser

A self-hosted, single-user app for working out what takes up the space in a shed or back room: items are entered on a phone with a size and nested tags. A Go server with SQLite serves an embedded React client, in one Docker image on the LAN-only homelab. `SPEC.md` is the spec.

**Read `CONTEXT.md` before any work.** It is the domain glossary. Use its terms in code, API, UI copy, tests and tickets, and never the words listed under _Avoid_ ("dimension" is a top-level tag such as Location, so never use it for an item's physical size). If a term is missing or no longer fits, raise it with the user rather than inventing one.

Before building significant new behaviour or a new feature, run the `/domain-modeling` skill: it sharpens the terms the work introduces in `CONTEXT.md` and records any hard-to-reverse decision as an ADR.

When `SPEC.md`, a ticket and `CONTEXT.md` disagree, `CONTEXT.md` wins on terms, the ticket wins on behaviour, and `SPEC.md` fills the gaps. Mention each disagreement you resolve in the commit message.

## Commands

`make dev` (Go on :8080, Vite on :5173 proxying `/api`), `make test` (Go with `-race`, then Vitest), `make e2e` (builds, then Playwright) and `make build` (`bin/shelf-organiser` with the client embedded); every environment variable is in `.env.example`. As each ticket lands, record here the commands and gotchas a look at the `Makefile` wouldn't reveal.

- **API changes start in `apps/server/openapi/openapi.yaml`.** `make generate` rewrites the committed `apps/server/internal/api/api.gen.go` and `apps/web/src/api/schema.gen.ts`; commit all three together.
- **The e2e suite refuses a stale binary:** `test/e2e/playwright.config.ts` fails if any file under `apps/` is newer than `bin/shelf-organiser`, so run `make e2e` (or `make build` first). It starts the binary on :8181 with `APP_TEST_MODE=1` and a fresh temp `DATA_DIR`, and every spec imports `test` from `test/e2e/fixtures/test.ts`, which resets the database before each test. Seed through `test/e2e/fixtures/api.ts`.
- **Smoke against the image:** `make docker`, `docker run --rm -p 8080:8080 shelf-organiser`, then `make smoke` (the `@smoke` tests, which leave no data behind).
- **First Playwright run in a fresh sandbox:** `npx playwright install chromium` and `sudo npx playwright install-deps chromium` from `test/e2e`.
- **TypeScript is pinned to 6.0:** typescript-eslint and openapi-typescript don't support 7 yet.
- **The server answers 503 on `/`** until the client is built, because a fresh clone embeds only `apps/web/dist/.gitkeep`.
- **SQLite** files belong in a temp dir (tests) or a data dir outside the repo. The repo sits on a host mount, where SQLite can report disk I/O or locking errors; `make dev` uses `~/.local/share/shelf-organiser`.
- **Viewing the app** in this sandbox: start `make dev` as a background task, and wait until `http://localhost:8080/healthz` returns 200 and `http://localhost:5173` loads. Then ask the user to run `sbx ports <sandbox-name> --publish 5173:5173` on their host, with the name from `$SANDBOX_NAME`. Client changes reload live; restart after a Go change. Stop the task when asked.

## Invariants

- **Tags form one tree:** sibling names are unique ignoring case, and a tag can't be moved inside itself or its descendants (`UpdateTag` refuses; `store_test.go` covers it). Names can't contain `/` or `›`, because those are how a tag path is typed and shown.
- **Deleting a tag deletes its subtree;** items stay and only lose those tags (foreign-key cascades in `00001_init.sql`). The UI confirms first and names how many sub-tags go with it.
- **Deleting an item offers Undo** by re-creating it from the deleted copy, so item delete has no confirmation.
- **Items store litres per unit;** total space is litres × quantity, and the item list is sorted by it. Size presets live only in `apps/web/src/items/size.ts` and are never stored.
- **Item writes take tag paths,** and the server creates any missing tags and ancestors in the same transaction, so a rejected item leaves no stray tags.
- **Test-only routes** (`POST /api/test/reset`) exist only with `APP_TEST_MODE=1`; `main_test.go` proves they 404 otherwise.
- **Scope:** build for exactly one user on a LAN, with no auth and nothing hosting- or ingress-related.

## UI

Follow the `homelab-frontend` skill. In this repo: components are in `apps/web/src/components/`, the catalogue page is `apps/web/src/dev/ComponentsPage.tsx` at `/dev/components` (`catalogue.test.ts` fails when a component is missing), and the tokens are in `apps/web/src/index.css`. Phone first: check every screen at 390 px wide, and keep touch targets at `min-h-touch`.

## Done means

All of these pass:

```bash
make check   # gofmt, go vet, both typechecks, ESLint
make test
make e2e
make docker
```

Then prove the behaviour in the running app, not just in tests: open the changed screen at 390 px and at desktop width, and report what you checked. For container changes, `docker build` and run the image with only environment variables set.
