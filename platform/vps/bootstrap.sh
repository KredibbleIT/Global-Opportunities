#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Hostinger VPS Bootstrap & Hardening Provisioner (Ubuntu 24.04 LTS)
# SEC-112, Decisions D5, D6
# ==============================================================================
# This script is IDEMPOTENT. Running it multiple times will not duplicate
# configurations or corrupt existing state.
#
# Tasks performed:
#   1. System packages upgrade and automatic security updates
#   2. SSH daemon security hardening (key-only authentication), checked
#      against the configuration sshd actually loads (SEC-139)
#   3. UFW firewall setup (allow 22, 80, 443). Docker-published ports such as
#      Caddy's 80/443 bypass UFW, so limiting them to Cloudflare happens in the
#      Hostinger panel firewall (docs/infrastructure/VPS.md, SEC-140)
#   4. Fail2ban configuration for brute-force SSH defense
#   5. Official Docker Engine & Docker Compose plugin installation
#   6. Unprivileged 'deploy' user creation and docker group assignment
#   7. Shared Docker 'edge' bridge network creation
#   8. Cloudflare Authenticated Origin Pull (AOP) CA certificate acquisition
#   9. /opt/god directory hierarchy provisioning with proper ownership
# ==============================================================================

if [[ $EUID -ne 0 ]]; then
  echo "Error: This script must be run as root (or via sudo)." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

echo "==> Step 1: Updating system packages and installing baseline utilities..."
apt-get update
apt-get upgrade -y
apt-get install -y --no-install-recommends \
  curl \
  wget \
  git \
  ca-certificates \
  gnupg \
  lsb-release \
  ufw \
  fail2ban \
  unattended-upgrades \
  jq \
  net-tools \
  age

echo "==> Step 2: Configuring unattended security updates..."
systemctl enable --now unattended-upgrades

echo "==> Step 3: Hardening SSH daemon configuration..."
# SEC-139: sshd keeps the FIRST value it reads for each keyword, and it reads
# sshd_config.d/*.conf in name order before the rest of sshd_config. The cloud
# image ships 50-cloud-init.conf with "PasswordAuthentication yes" and an
# sshd_config with "PermitRootLogin yes", so a hardening file named 99-... is
# read last and loses. Ours is named 00-... so it is read first, and the
# image's values are switched off too in case our file is ever removed.
SSHD_DROPIN_DIR=/etc/ssh/sshd_config.d
SSHD_HARDENING_FILE="${SSHD_DROPIN_DIR}/00-god-hardening.conf"
mkdir -p "$SSHD_DROPIN_DIR"
# The old name sorted last and never took effect.
rm -f "${SSHD_DROPIN_DIR}/99-god-hardening.conf"
cat > "$SSHD_HARDENING_FILE" << 'EOF'
# Enforced by Global Opportunities infrastructure bootstrap (SEC-139).
# Named 00- so sshd reads it before the image's own drop-ins: the first value wins.
PermitRootLogin prohibit-password
PasswordAuthentication no
KbdInteractiveAuthentication no
X11Forwarding no
MaxAuthTries 4
ClientAliveInterval 300
ClientAliveCountMax 2
EOF

for sshd_file in /etc/ssh/sshd_config "$SSHD_DROPIN_DIR"/*.conf; do
  if [[ "$sshd_file" == "$SSHD_HARDENING_FILE" || ! -f "$sshd_file" ]]; then
    continue
  fi
  sed -i -E \
    -e 's/^[[:space:]]*PasswordAuthentication[[:space:]]+yes\b/PasswordAuthentication no/I' \
    -e 's/^[[:space:]]*KbdInteractiveAuthentication[[:space:]]+yes\b/KbdInteractiveAuthentication no/I' \
    -e 's/^[[:space:]]*PermitRootLogin[[:space:]]+yes\b/PermitRootLogin prohibit-password/I' \
    "$sshd_file"
done

# cloud-init writes 50-cloud-init.conf from ssh_pwauth; keep it from turning
# password login back on.
if [[ -d /etc/cloud/cloud.cfg.d ]]; then
  echo 'ssh_pwauth: false' > /etc/cloud/cloud.cfg.d/99-disable-ssh-pwauth.cfg
fi

sshd -t
if systemctl is-active --quiet ssh; then
  systemctl reload ssh
fi

# Check what sshd will enforce, not what our file says.
effective_sshd_config="$(sshd -T)"
require_sshd_setting() {
  local keyword="$1"
  shift
  local actual allowed
  actual="$(awk -v keyword="$keyword" '$1 == keyword { print $2; exit }' <<< "$effective_sshd_config")"
  for allowed in "$@"; do
    if [[ "$actual" == "$allowed" ]]; then
      return 0
    fi
  done
  echo "Error: sshd would run with '${keyword} ${actual:-<unset>}' (expected: $*)." >&2
  echo "Find the file that sets it: grep -rn -i '^[[:space:]]*${keyword}' /etc/ssh/sshd_config /etc/ssh/sshd_config.d/" >&2
  exit 1
}
require_sshd_setting passwordauthentication no
require_sshd_setting kbdinteractiveauthentication no
require_sshd_setting permitrootlogin prohibit-password without-password no
echo "Verified with sshd -T: key-only SSH, root login by key only."

echo "==> Step 4: Configuring Fail2ban..."
cat > /etc/fail2ban/jail.d/sshd.local << 'EOF'
[sshd]
enabled = true
port = ssh
filter = sshd
maxretry = 4
bantime = 3600
findtime = 600
EOF

systemctl enable --now fail2ban
systemctl restart fail2ban || true

echo "==> Step 5: Configuring UFW firewall..."
# UFW governs host services such as SSH. Docker writes its own iptables rules
# for published ports, so Caddy's 80/443 are reachable whatever UFW says.
# Limit 80/443 to Cloudflare's ranges in the Hostinger panel firewall
# (docs/infrastructure/VPS.md, section 7; SEC-140).
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP Caddy Edge'
ufw allow 443/tcp comment 'HTTPS Caddy Edge'
ufw --force enable

echo "==> Step 6: Installing official Docker Engine & Compose plugin..."
install -m 0755 -d /etc/apt/keyrings
if [[ ! -f /etc/apt/keyrings/docker.asc ]]; then
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
fi

DOCKER_LIST="/etc/apt/sources.list.d/docker.list"
if [[ ! -f "$DOCKER_LIST" ]]; then
  # shellcheck disable=SC1091
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee "$DOCKER_LIST" > /dev/null
fi

apt-get update
apt-get install -y --no-install-recommends \
  docker-ce \
  docker-ce-cli \
  containerd.io \
  docker-buildx-plugin \
  docker-compose-plugin

systemctl enable --now docker

echo "==> Step 7: Configuring unprivileged 'deploy' user..."
if ! id -u deploy &>/dev/null; then
  useradd -m -s /bin/bash -G docker deploy
  echo "Created user 'deploy' with docker group privileges."
else
  usermod -aG docker deploy
  echo "User 'deploy' already exists. Verified docker group membership."
fi

mkdir -p /home/deploy/.ssh
touch /home/deploy/.ssh/authorized_keys
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh

echo "==> Step 8: Creating shared Docker 'edge' network..."
if ! docker network inspect edge >/dev/null 2>&1; then
  docker network create edge
  echo "Created Docker network 'edge'."
else
  echo "Docker network 'edge' already exists."
fi

echo "==> Step 9: Setting up SSL & Cloudflare Authenticated Origin Pull CA..."
mkdir -p /etc/ssl/cloudflare
if [[ ! -f /etc/ssl/cloudflare/origin_pull_ca.pem ]]; then
  curl -fsSL https://developers.cloudflare.com/ssl/static/authenticated_origin_pull_ca.pem -o /etc/ssl/cloudflare/origin_pull_ca.pem
  chmod 644 /etc/ssl/cloudflare/origin_pull_ca.pem
  echo "Downloaded Cloudflare Authenticated Origin Pull CA certificate."
fi
chmod 755 /etc/ssl/cloudflare

echo "==> Step 10: Provisioning /opt/god directory hierarchy..."
mkdir -p \
  /opt/god/staging \
  /opt/god/production \
  /opt/god/development \
  /opt/god/bin \
  /opt/god/deploy \
  /opt/god/backup \
  /opt/platform/edge \
  /opt/platform/vector

chown -R deploy:deploy /opt/god
chmod 750 /opt/god

echo "==> Step 11: Setup complete!"
echo "--------------------------------------------------------------------------------"
echo "Next configuration actions:"
echo "1. Place Cloudflare Origin CA certificate and private key at:"
echo "     /etc/ssl/cloudflare/origin.crt"
echo "     /etc/ssl/cloudflare/origin.key (chmod 600)"
echo "2. Add the CI deploy SSH public key to /home/deploy/.ssh/authorized_keys with:"
echo '     command="/opt/god/bin/god-deploy-gate",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty ssh-ed25519 <KEY> CI Deploy Key'
echo "3. Copy deployment and backup scripts into /opt/god/bin/ and make them executable:"
echo "     cp deploy/bin/god-deploy deploy/bin/god-deploy-gate deploy/bin/god-backup deploy/bin/god-restore /opt/god/bin/"
echo "     chmod 755 /opt/god/bin/god-*"
echo "4. Copy deploy/compose.yml to /opt/god/deploy/compose.yml"
echo "5. Create /opt/god/<env>/api.env (chmod 600, deploy:deploy)"
echo "6. Install backup systemd service and timer:"
echo "     cp platform/vps/systemd/god-backup-production.* /etc/systemd/system/"
echo "     systemctl daemon-reload && systemctl enable --now god-backup-production.timer"
echo "7. Launch edge reverse proxy: docker compose -f platform/vps/edge/compose.yml up -d"
echo "8. In the Hostinger panel firewall, allow 80/443 only from Cloudflare's ranges"
echo "     (UFW cannot limit Docker-published ports; see docs/infrastructure/VPS.md)"
echo "9. Never commit this server's IP: it lets anyone bypass Cloudflare (SEC-140)"
echo "--------------------------------------------------------------------------------"
