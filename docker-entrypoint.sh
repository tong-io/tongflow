#!/bin/sh
# The container listens on 0.0.0.0, so it must never run without an access
# token (see src/lib/api/self-host-gate.ts). Use TONGFLOW_AUTH_TOKEN when the
# operator sets one; otherwise generate one once and keep it in the data volume.
set -e

if [ -z "$TONGFLOW_AUTH_TOKEN" ]; then
    token_file="$TONGFLOW_DATA_DIR/auth-token"
    if [ ! -s "$token_file" ]; then
        mkdir -p "$TONGFLOW_DATA_DIR"
        node -e 'process.stdout.write(require("node:crypto").randomBytes(24).toString("hex"))' >"$token_file"
        chmod 600 "$token_file"
    fi
    TONGFLOW_AUTH_TOKEN=$(cat "$token_file")
    export TONGFLOW_AUTH_TOKEN
fi

echo "TongFlow: open http://localhost:${PORT}/?token=${TONGFLOW_AUTH_TOKEN}"

exec "$@"
