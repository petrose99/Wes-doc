#!/bin/bash
set -e

cd /home/ubuntu/Dev/Wes-doc

# Kill any existing servers
pkill -f "next dev" || true
sleep 2

# Start dev server in background
echo "Starting dev server..."
npm run dev > /tmp/dev.log 2>&1 &
SERVER_PID=$!
echo "Server PID: $SERVER_PID"

# Wait for server to be ready
echo "Waiting for server..."
for i in {1..40}; do
  if timeout 1 bash -c "echo > /dev/tcp/127.0.0.1/3000" 2>/dev/null; then
    echo "Server is ready!"
    break
  fi
  if [ $i -eq 40 ]; then
    echo "Server failed to start"
    kill $SERVER_PID 2>/dev/null || true
    exit 1
  fi
  sleep 1
done

# Seed database
echo "Seeding database..."
npx tsx --env-file .env scripts/seed-sample-docs.ts af91555d-7450-4b21-a8ac-73db092617c8

# Run capture
echo "Running capture round..."
rm -rf shots-r1
npx --prefix /home/ubuntu/Dev/Wes-doc tsx --env-file /home/ubuntu/Dev/Wes-doc/.env \
  docs/wayfinder-reports/226/logs/scratch-266/round266.mjs /home/ubuntu/Dev/Wes-doc/shots-r1

echo "Capture complete"
# Kill server
kill $SERVER_PID 2>/dev/null || true
