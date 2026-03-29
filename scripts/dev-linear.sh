#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

MODE="${1:-}"
API_TARGET="${NEXT_PUBLIC_API_URL:-http://localhost:${API_PORT:-3001}}"
NGROK_API_URL="${NGROK_API_URL:-http://127.0.0.1:4040/api/tunnels}"
NGROK_LOG_FILE="$(mktemp -t superset-linear-ngrok.XXXXXX.log)"
NGROK_PUBLIC_URL="${LINEAR_PUBLIC_API_URL:-}"
NGROK_PID=""

trim_trailing_slash() {
	local value="$1"
	while [[ "$value" == */ ]]; do
		value="${value%/}"
	done
	printf '%s' "$value"
}

cleanup() {
	if [ -n "$NGROK_PID" ] && kill -0 "$NGROK_PID" >/dev/null 2>&1; then
		kill "$NGROK_PID" >/dev/null 2>&1 || true
	fi
	rm -f "$NGROK_LOG_FILE"
}

trap cleanup EXIT INT TERM

if ! command -v ngrok >/dev/null 2>&1; then
	echo "ngrok is required for Linear local testing."
	echo "Install it with 'brew install ngrok/ngrok/ngrok' and authenticate once."
	exit 1
fi

start_ngrok() {
	local -a ngrok_args=(http "$API_TARGET")

	if [ -n "$NGROK_PUBLIC_URL" ]; then
		NGROK_PUBLIC_URL="$(trim_trailing_slash "$NGROK_PUBLIC_URL")"
		ngrok_args+=(--url "$NGROK_PUBLIC_URL")
	fi

	ngrok "${ngrok_args[@]}" >"$NGROK_LOG_FILE" 2>&1 &
	NGROK_PID="$!"
}

discover_ngrok_url() {
	local attempt=0

	while [ "$attempt" -lt 30 ]; do
		if ! kill -0 "$NGROK_PID" >/dev/null 2>&1; then
			echo "ngrok exited before it exposed a public URL."
			cat "$NGROK_LOG_FILE"
			exit 1
		fi

		NGROK_PUBLIC_URL="$(
			curl -sf "$NGROK_API_URL" 2>/dev/null | bun -e '
const input = await Bun.stdin.text();
if (!input) {
	process.exit(0);
}
const data = JSON.parse(input);
const tunnel = data.tunnels?.find((candidate) =>
	candidate.public_url?.startsWith("https://"),
);
if (tunnel?.public_url) {
	process.stdout.write(tunnel.public_url);
}
' 2>/dev/null || true
		)"

		if [ -n "$NGROK_PUBLIC_URL" ]; then
			NGROK_PUBLIC_URL="$(trim_trailing_slash "$NGROK_PUBLIC_URL")"
			return
		fi

		attempt=$((attempt + 1))
		sleep 1
	done

	echo "Timed out waiting for ngrok to expose a public URL."
	cat "$NGROK_LOG_FILE"
	exit 1
}

start_ngrok

if [ -z "$NGROK_PUBLIC_URL" ]; then
	discover_ngrok_url
fi

export LINEAR_PUBLIC_API_URL="$NGROK_PUBLIC_URL"

CALLBACK_URL="$(trim_trailing_slash "$API_TARGET")/api/integrations/linear/callback"
WEBHOOK_URL="$LINEAR_PUBLIC_API_URL/api/integrations/linear/webhook"

echo "Linear local dev is ready."
echo "Callback URL: $CALLBACK_URL"
echo "Webhook URL:  $WEBHOOK_URL"
echo "Public API:   $LINEAR_PUBLIC_API_URL"
echo "ngrok API:    $NGROK_API_URL"

if [ "$MODE" = "--tunnel-only" ]; then
	echo "Tunnel-only mode is running. Keep this process open while testing."
	wait "$NGROK_PID"
	exit $?
fi

bun run dev
