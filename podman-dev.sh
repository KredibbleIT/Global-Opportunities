#!/usr/bin/env bash
# Podman-based dev stack for Kredibble (MongoDB replica set + Redis)
# Run: chmod +x podman-dev.sh && ./podman-dev.sh

set -euo pipefail

MONGODB_ROOT_USERNAME="${MONGODB_ROOT_USERNAME:-kredibble}"
MONGODB_ROOT_PASSWORD="${MONGODB_ROOT_PASSWORD:-kredibble123}"
MONGODB_DATABASE="${MONGODB_DATABASE:-kredibble}"
MONGODB_PORT="${MONGODB_PORT:-27017}"
REDIS_PORT="${REDIS_PORT:-6379}"

echo "=== Starting Kredibble dev stack with Podman ==="

# Create podman network if not exists
podman network exists kredibble-dev 2>/dev/null || podman network create kredibble-dev

# Start MongoDB
if ! podman ps --format '{{.Names}}' | grep -q '^kredibble-mongodb$'; then
    echo "Starting MongoDB..."
    podman run -d \
        --name kredibble-mongodb \
        --network kredibble-dev \
        -p "${MONGODB_PORT}:27017" \
        -e MONGO_INITDB_ROOT_USERNAME="${MONGODB_ROOT_USERNAME}" \
        -e MONGO_INITDB_ROOT_PASSWORD="${MONGODB_ROOT_PASSWORD}" \
        -e MONGO_INITDB_DATABASE="${MONGODB_DATABASE}" \
        -v kredibble_mongodb_data:/data/db \
        docker.io/library/mongo:7 \
        --replSet rs0 --bind_ip_all
else
    echo "MongoDB already running"
fi

# Start Redis
if ! podman ps --format '{{.Names}}' | grep -q '^kredibble-redis$'; then
    echo "Starting Redis..."
    podman run -d \
        --name kredibble-redis \
        --network kredibble-dev \
        -p "${REDIS_PORT}:6379" \
        -v kredibble_redis_data:/data \
        docker.io/library/redis:7-alpine
else
    echo "Redis already running"
fi

# Wait for MongoDB to be ready
echo "Waiting for MongoDB to accept connections..."
for i in {1..30}; do
    if podman exec kredibble-mongodb mongosh --quiet --eval "db.adminCommand('ping')" >/dev/null 2>&1; then
        echo "MongoDB ready"
        break
    fi
    sleep 2
done

# Initialize replica set
echo "Initializing MongoDB replica set..."
podman exec kredibble-mongodb mongosh -u "${MONGODB_ROOT_USERNAME}" -p "${MONGODB_ROOT_PASSWORD}" --quiet --eval '
try {
    rs.status()
} catch (err) {
    rs.initiate({
        _id: "rs0",
        members: [{ _id: 0, host: "localhost:27017" }]
    })
}
' 2>/dev/null || true

# Verify Redis
echo "Verifying Redis..."
podman exec kredibble-redis redis-cli ping

echo ""
echo "=== Dev stack ready ==="
echo "MongoDB:  mongodb://${MONGODB_ROOT_USERNAME}:${MONGODB_ROOT_PASSWORD}@localhost:${MONGODB_PORT}/${MONGODB_DATABASE}?replicaSet=rs0"
echo "Redis:    redis://localhost:${REDIS_PORT}"
echo ""
echo "Set these in your shell:"
echo "  export MONGODB_ROOT_USERNAME=${MONGODB_ROOT_USERNAME}"
echo "  export MONGODB_ROOT_PASSWORD=${MONGODB_ROOT_PASSWORD}"
echo "  export MONGOMS_SYSTEM_BINARY=/path/to/mongod (for tests)"
echo "  export REDIS_URL=redis://localhost:6379"