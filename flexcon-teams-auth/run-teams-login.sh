#!/usr/bin/env bash
# Run the one-time Teams login for automation@ inside the forked bot image, with a VNC
# view on 127.0.0.1:6080. Sign in there; the session is pushed to MinIO on success.
#
# TEMPLATE — the display/VNC bring-up below assumes the base image's standard tools
# (Xvfb + x11vnc + websockify + noVNC). CONFIRM against the bot image's entrypoint.sh:
# if the entrypoint already starts Xvfb/noVNC, drop the duplicate starts here. The clean
# alternative (recommended for a fork) is to add a `VEXA_MODE=login` branch to
# entrypoint.sh that starts VNC + runs login-teams.mjs — then this whole wrapper is just
# `docker run -e VEXA_MODE=login -p 127.0.0.1:6080:6080 ... <image>`.
set -euo pipefail

IMAGE="${IMAGE:-flexcon/vexa-bot:v012-teamsauth}"   # your forked + built bot image
HERE="$(cd "$(dirname "$0")" && pwd)"

docker run --rm -it \
  -p 127.0.0.1:6080:6080 \
  -v "$HERE/login-teams.mjs:/app/login-teams.mjs:ro" \
  -e S3_ENDPOINT="${S3_ENDPOINT:?MinIO endpoint reachable from the container, e.g. http://172.18.0.1:9000}" \
  -e S3_BUCKET="${S3_BUCKET:-vexa}" \
  -e S3_ACCESS_KEY="${S3_ACCESS_KEY:?MinIO access key}" \
  -e S3_SECRET_KEY="${S3_SECRET_KEY:?MinIO secret key}" \
  -e USERDATA_S3_PATH="${USERDATA_S3_PATH:-sessions/teams/automation}" \
  --entrypoint bash \
  "$IMAGE" -lc '
    set -e
    export DISPLAY=:99
    pgrep Xvfb        >/dev/null || (Xvfb :99 -screen 0 1280x800x24 >/tmp/xvfb.log 2>&1 &)
    sleep 1
    pgrep x11vnc      >/dev/null || x11vnc -display :99 -nopw -forever -shared -bg -rfbport 5900 >/tmp/x11vnc.log 2>&1 || true
    pgrep websockify  >/dev/null || (websockify --web=/usr/share/novnc 6080 localhost:5900 >/tmp/novnc.log 2>&1 &)
    sleep 1
    echo "──────────────────────────────────────────────────────────────"
    echo " Open  http://localhost:6080/vnc.html  and sign in as"
    echo " automation@flexcon-it.de  (complete MFA). You have 10 minutes."
    echo "──────────────────────────────────────────────────────────────"
    node /app/login-teams.mjs
  '
