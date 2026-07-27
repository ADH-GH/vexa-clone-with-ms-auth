#!/usr/bin/env bash
# One-time (and periodic) Teams login provisioning for the Vexa bot.
# Runs the bot image in VEXA_MODE=login: VNC on 127.0.0.1:6080, human signs in as the
# service account (automation@flexcon-it.de), profile is pushed to MinIO on success.
#
# From a workstation, tunnel the VNC port first:
#   ssh -L 6080:127.0.0.1:6080 root@<server>   → open http://localhost:6080/vnc.html
set -euo pipefail

IMAGE="${IMAGE:-flexcon/vexa-bot:v012-teamsauth}"

docker run --rm \
  -p 127.0.0.1:6080:6080 \
  -e VEXA_MODE=login \
  -e S3_ENDPOINT="${S3_ENDPOINT:?MinIO endpoint reachable from the container, e.g. http://172.18.0.1:9000}" \
  -e S3_BUCKET="${S3_BUCKET:-vexa}" \
  -e S3_ACCESS_KEY="${S3_ACCESS_KEY:?MinIO access key}" \
  -e S3_SECRET_KEY="${S3_SECRET_KEY:?MinIO secret key}" \
  -e USERDATA_S3_PATH="${USERDATA_S3_PATH:-sessions/teams/automation}" \
  -e LOGIN_TIMEOUT_MIN="${LOGIN_TIMEOUT_MIN:-10}" \
  "$IMAGE"
