#!/usr/bin/env bash
# Sets up (or updates) BillTracker on a Raspberry Pi / Ubuntu Server host and
# installs it as a systemd service that starts on boot.
#
# Usage:
#   First install:  curl -fsSL https://raw.githubusercontent.com/<owner>/billtracker/main/deploy/setup.sh | bash
#   Or, if you already cloned the repo:  cd billtracker && bash deploy/setup.sh
#
# Safe to re-run: it pulls the latest code, reinstalls deps, re-runs
# migrations, rebuilds, and restarts the service.

set -euo pipefail

REPO_URL="https://github.com/getStartedJamesha/billtracker.git"
APP_DIR="${BILLTRACKER_DIR:-$HOME/billtracker}"
NODE_MAJOR="20"
SERVICE_NAME="billtracker"

log() { echo -e "\n\033[1;34m==> $1\033[0m"; }

# --- 1. Node.js ---------------------------------------------------------
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | sed 's/v\([0-9]*\).*/\1/')" -lt 18 ]; then
  log "Installing Node.js ${NODE_MAJOR}.x (NodeSource)"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
  sudo apt-get install -y nodejs
else
  log "Node.js already installed: $(node -v)"
fi

# --- 2. Get the code -----------------------------------------------------
if [ -f "package.json" ] && grep -q '"name": "billtracker"' package.json; then
  log "Running from an existing checkout: $(pwd)"
  APP_DIR="$(pwd)"
  git pull --ff-only
elif [ -d "$APP_DIR/.git" ]; then
  log "Updating existing checkout at $APP_DIR"
  cd "$APP_DIR"
  git pull --ff-only
else
  log "Cloning into $APP_DIR"
  git clone "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
fi

# --- 3. Install, migrate, build ------------------------------------------
log "Installing dependencies"
npm install

log "Applying database migrations"
npx prisma migrate deploy

log "Building for production"
npm run build

# --- 4. systemd service ---------------------------------------------------
NPM_BIN="$(command -v npm)"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

log "Installing systemd service ($SERVICE_FILE)"
sed \
  -e "s#__USER__#$(whoami)#g" \
  -e "s#__APP_DIR__#$APP_DIR#g" \
  -e "s#__NPM_BIN__#$NPM_BIN#g" \
  "$APP_DIR/deploy/billtracker.service.template" | sudo tee "$SERVICE_FILE" >/dev/null

sudo systemctl daemon-reload
sudo systemctl enable --now "$SERVICE_NAME"
sudo systemctl restart "$SERVICE_NAME"

PI_IP="$(hostname -I | awk '{print $1}')"
log "Done. BillTracker is running as a service."
echo "  Status:  sudo systemctl status ${SERVICE_NAME}"
echo "  Logs:    sudo journalctl -u ${SERVICE_NAME} -f"
echo "  Open:    http://${PI_IP}:3000  (from a device on your home network)"
