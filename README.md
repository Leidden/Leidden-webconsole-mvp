# Web Console MVP

CloudStack self-service portal MVP. Runs on `cs-webconsole-01` (Ubuntu 24.04 + Docker).

See [`webconsole-mvp-design.md`](./webconsole-mvp-design.md) for architecture, decisions, and roadmap.

## Local development (on cs-webconsole-01)

```bash
# 1. Copy env template and fill credentials
cp .env.example .env.local
# Edit .env.local — paste service account API key/secret from
# ~/.config/webconsole/credentials.env, set POSTGRES_PASSWORD,
# generate AUTH_SECRET (openssl rand -base64 32)

# 2. Start
docker compose up -d
docker compose logs -f app
```

Open in browser:
- inside cs-webconsole-01 LAN: <http://10.10.10.142:3000>
- from operator PC (allowed IP): <http://211.233.50.43:28000>

## Stop

```bash
docker compose down              # keep volumes
docker compose down -v           # also drop Postgres data
```

## Verify CloudStack connectivity

```bash
curl -s http://localhost:3000/api/health | jq
```

Should report `cloudstack.connected: true` and list zones.

## Reference

- Infrastructure repo: [iaas-cloudstack-lab](https://github.com/Leidden/iaas-cloudstack-lab)
- CloudStack network concepts: see infra repo's `cloudstack-network-concepts.md`
- Service account: `webconsole-backend` (Domain Admin under ROOT) — credentials at `~/.config/webconsole/credentials.env` on cs-webconsole-01
