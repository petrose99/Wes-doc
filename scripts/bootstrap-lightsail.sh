#!/usr/bin/env bash
# Provisions a fresh Ubuntu Lightsail instance to run the DocuBite stack.
# Idempotent: safe to re-run. Run as the default `ubuntu` user.
#
#   ./scripts/bootstrap-lightsail.sh
#
# Installs Docker + compose plugin, adds swap (Next.js builds are memory-hungry),
# and enables the host firewall. It does NOT start the stack — fill in .env.production
# first, then run deploy.sh.
set -euo pipefail

log() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

if [[ $EUID -eq 0 ]]; then
  echo "Run as a non-root user (the script uses sudo where needed)." >&2
  exit 1
fi

log "Updating apt"
sudo apt-get update -y
sudo apt-get upgrade -y

log "Installing Docker"
if ! command -v docker >/dev/null 2>&1; then
  sudo apt-get install -y ca-certificates curl gnupg
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg |
    sudo gpg --batch --yes --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" |
    sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update -y
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  sudo usermod -aG docker "$USER"
else
  echo "Docker already installed: $(docker --version)"
fi

# `next build` peaks well above what 8GB leaves free once Postgres/MySQL/Redis/MinIO are up,
# and the OOM killer takes the build down with a bare "Killed". Swap absorbs the spike.
log "Ensuring 4G swap"
if ! sudo swapon --show | grep -q '/swapfile'; then
  sudo fallocate -l 4G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
else
  echo "Swap already present."
fi

log "Configuring host firewall"
# Lightsail's own firewall is the outer layer; ufw is defence in depth. Only 22/80/443
# are ever reachable — every service port stays on the compose network.
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

log "Done"
echo "Log out and back in (or run: newgrp docker) so group membership applies."
echo "Next: fill in .env.production, then run ./scripts/deploy.sh"
