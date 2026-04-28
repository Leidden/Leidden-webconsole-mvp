# Production deploy notes

This file documents the production image + deploy story (CI side, plus
how to roll the image manually on `cs-webconsole-01`). Local dev still
uses the original `Dockerfile` and `docker-compose.yml` with hot reload.

## CI: build & push

GitHub Actions (`.github/workflows/build-and-push.yml`) runs on every
push to `main` (skips doc-only changes). It:

1. Builds the production image from `Dockerfile.prod` (multi-stage,
   `npm ci` + `npm run build`, runs `prisma migrate deploy && next start`
   at container start under `tini`).
2. Pushes two tags to GHCR:
   - `ghcr.io/leidden/leidden-webconsole-mvp:latest`
   - `ghcr.io/leidden/leidden-webconsole-mvp:sha-<short>`

The push uses the workflow's `GITHUB_TOKEN` — no extra secrets to
configure for the build itself.

If the GHCR image visibility is **private**, anyone pulling it (the
deploy host, watchtower, etc.) needs a Personal Access Token with
`read:packages`. Make the package public from the GitHub UI to avoid
that.

## Deploy on cs-webconsole-01

The first time:

```bash
ssh -i ~/.ssh/cs_lab_ed25519 -p 2241 ubuntu@211.233.50.43
cd /home/ubuntu/projects/Leidden-webconsole-mvp

# (private package only) login to GHCR
echo "$GHCR_PAT" | sudo docker login ghcr.io -u Leidden --password-stdin

# Bring up production stack from compose
sudo docker compose -f docker-compose.prod.yml pull
sudo docker compose -f docker-compose.prod.yml up -d
sudo docker compose -f docker-compose.prod.yml logs -f app
```

To roll a new image after CI publishes:

```bash
sudo docker compose -f docker-compose.prod.yml pull
sudo docker compose -f docker-compose.prod.yml up -d
```

## Stage 6 follow-up (next iteration)

- Self-hosted GitHub Actions runner on `cs-webconsole-01` so the deploy
  job can pull + restart automatically without exposing inbound SSH to
  GitHub-hosted runners (which would conflict with our 103.243.200.17/32
  WinNAT allowlist).
- Optional: watchtower sidecar to poll GHCR every 60s and bounce the
  container when `:latest` changes.

## Environment

Same `.env.local` as dev (Postgres password, AUTH_SECRET, CloudStack
service-account key/secret), only `NODE_ENV=production` is forced by
the compose file.
