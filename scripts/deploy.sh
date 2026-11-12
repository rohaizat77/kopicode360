#!/usr/bin/env bash
# Build SmartPark and install it to /opt/smartpark3, then restart the service.
# Usage: scripts/deploy.sh   (run from the repo on the server, as a sudo-capable user)
set -euo pipefail
cd "$(dirname "$0")/.."

APP_DIR=/opt/smartpark3
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT

echo "==> Building API"
(cd functions && npm ci --no-audit --no-fund && npm run build && npm test)
echo "==> Building client"
(cd client && npm ci --no-audit --no-fund && npm run build)

echo "==> Staging production files"
mkdir -p "$STAGE/functions" "$STAGE/client"
cp -r functions/dist functions/package.json functions/package-lock.json "$STAGE/functions/"
(cd "$STAGE/functions" && npm ci --omit=dev --no-audit --no-fund)
cp -r client/dist "$STAGE/client/dist"

echo "==> Installing to $APP_DIR"
sudo rsync -a --delete --exclude "data/" "$STAGE/" "$APP_DIR/"
# Code is root-owned and read-only for the service; only data/ belongs to it.
sudo chown -R root:smartpark3 "$APP_DIR"
sudo chmod -R u=rwX,g=rX,o= "$APP_DIR"
sudo install -d -o smartpark3 -g smartpark3 -m 750 "$APP_DIR/data"
sudo chown -R smartpark3:smartpark3 "$APP_DIR/data"

echo "==> Restarting"
sudo systemctl restart smartpark3
sleep 2
systemctl is-active smartpark3
curl -fsS http://127.0.0.1:3600/api/health && echo
