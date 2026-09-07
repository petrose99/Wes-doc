# Deploying to AWS Lightsail

Full stack (web app, worker, self-hosted pgvector Postgres, Bigcapital accounting suite) on one
Lightsail VPS instance via docker-compose.

## 1. Instance

- Ubuntu 22.04 blueprint, 8 GB RAM / 2 vCPU plan, region eu-west-2 (London), AZ eu-west-2a
- Attach a static IP
- Firewall (networking tab): allow 22 (SSH), 80 (HTTP), 443 (HTTPS). Leave everything else closed —
  Postgres/MySQL/Redis/MinIO/Bigcapital's internal ports stay on the docker-compose private network
  and are never exposed to the internet.
- Point DNS (A records) for your domain(s) at the static IP before starting Caddy — it needs a
  resolvable domain to issue Let's Encrypt certificates automatically.

## 2. Install Docker

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker $USER
```
Log out/in (or `newgrp docker`) for the group change to take effect.

## 3. Get the code

```bash
git clone <your repo url> docubite
cd docubite
cp .env.production.example .env.production
```
Fill in `.env.production` with real secrets — LLM keys, Supabase project, Stripe, S3 bucket, and
generated passwords for `POSTGRES_PASSWORD`, `BIGCAPITAL_MYSQL_ROOT_PASSWORD`,
`BIGCAPITAL_MINIO_ROOT_PASSWORD`, `BIGCAPITAL_AGENDASH_PASSWORD`, `SECRETS_ENCRYPTION_KEY`,
`INTERNAL_WORKER_SECRET`. Set `DOCUBITE_DOMAIN` / `BIGCAPITAL_DOMAIN` /
`BIGCAPITAL_API_BASE` / `BIGCAPITAL_WEBAPP_URL` to your real domains.

## 4. Build and run

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

First boot runs `prisma migrate deploy` automatically (see `web`'s `npm start`). Watch it:

```bash
docker compose -f docker-compose.prod.yml logs -f web
```

## 5. Verify

- `https://<DOCUBITE_DOMAIN>` — app loads, sign-in works (Supabase)
- `https://<BIGCAPITAL_DOMAIN>` — Bigcapital webapp loads
- `docker compose -f docker-compose.prod.yml ps` — every service healthy/running

## Updating later

```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```
