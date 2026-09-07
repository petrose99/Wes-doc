#!/usr/bin/env bash
# Connect to the DocuBite production Lightsail instance from any machine.
#
#   ./scripts/vps-ssh.sh                  # opens an interactive shell
#   ./scripts/vps-ssh.sh 'docker compose -f ~/docubite/docker-compose.prod.yml --env-file ~/docubite/.env.production ps'
#
# This file is safe to commit — it holds no secret, just the host/user and where
# to look for a key. The private key itself must NEVER be committed; it lives only
# on machines you've deliberately authorized, at the path below (or wherever
# VPS_SSH_KEY points).
#
# First time on a new machine: you need a key that's in the instance's
# ~/.ssh/authorized_keys. Either:
#   (a) copy an already-authorized private key here, at the default path below, or
#   (b) generate a new one and add its PUBLIC half via the Lightsail browser SSH
#       console (AWS console -> instance -> Connect tab -> Connect using SSH —
#       no key needed for that), e.g.:
#         ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519_docubite -N ""
#         cat ~/.ssh/id_ed25519_docubite.pub
#       then on the instance:
#         echo '<paste the public key line>' >> ~/.ssh/authorized_keys
set -euo pipefail

HOST="16.60.212.8"
SSH_USER="ubuntu"
KEY="${VPS_SSH_KEY:-$HOME/.ssh/id_ed25519_docubite}"

if [[ ! -f "$KEY" ]]; then
  echo "No key found at $KEY." >&2
  echo "Set VPS_SSH_KEY to an already-authorized private key, or generate one" >&2
  echo "and register its public half — see the comment at the top of this script." >&2
  exit 1
fi

exec ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "$SSH_USER@$HOST" "$@"
