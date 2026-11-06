# syntax=docker/dockerfile:1

# The build stages run on the builder's own platform (BUILDPLATFORM), and Go cross-compiles
# for TARGETPLATFORM, so a multi-arch build needs no emulation.

# 1. Build the web app. Its output is the same on every platform. pnpm checks the
# lockfile against every workspace package, so each one's package.json is copied.
FROM --platform=$BUILDPLATFORM node:25-alpine AS web
RUN corepack enable
WORKDIR /src
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY test/e2e/package.json test/e2e/
RUN pnpm install --frozen-lockfile --filter ./apps/web
# The speech model (ADR 0003), pinned by revision and checked by SHA-256, in its
# own layer so it downloads again only when speech-model.json changes.
COPY apps/web/speech-model.json apps/web/
COPY apps/web/scripts/fetch-model.mjs apps/web/scripts/
RUN node apps/web/scripts/fetch-model.mjs
COPY apps/web apps/web
RUN pnpm --filter ./apps/web build

# 2. Build a static Go binary for the target platform with the web app embedded.
FROM --platform=$BUILDPLATFORM golang:1.27-alpine AS server
ARG TARGETOS TARGETARCH
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY apps apps
COPY --from=web /src/apps/web/dist apps/web/dist
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build -trimpath -ldflags="-s -w" -o /out/shelf-organiser ./apps/server/cmd/shelf-organiser \
 && mkdir /out/data

# 3. Run it. distroless/static carries CA certificates for outbound HTTPS; the binary
# embeds its own zoneinfo for TZ. It runs as the unprivileged UID/GID 65532, numeric so that
# Kubernetes' runAsNonRoot can check it. /data is owned by 65532, so a fresh Docker volume is
# writable; a bind mount, or a PVC with another runAsUser, must be writable by the running UID.
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=server /out/shelf-organiser /shelf-organiser
COPY --from=server --chown=65532:65532 /out/data /data
USER 65532:65532
ENV DATA_DIR=/data PORT=8080
VOLUME /data
EXPOSE 8080
ENTRYPOINT ["/shelf-organiser"]
