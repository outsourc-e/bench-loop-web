#!/bin/bash
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"

# Ensure bench-loop is on PYTHONPATH
export PYTHONPATH="$DIR/../bench-loop:$PYTHONPATH"

echo "Starting BenchLoop..."
echo "  Backend:  http://localhost:8877"
echo "  Frontend: http://localhost:5174"
echo ""

# Start backend
python3 -m uvicorn main:app --host 0.0.0.0 --port 8877 --reload --app-dir "$DIR/api" &
BACKEND_PID=$!

# Start frontend
cd "$DIR/ui"
npx vite --port 5174 &
FRONTEND_PID=$!

# Cleanup on exit
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM EXIT

echo "Press Ctrl+C to stop both servers"
wait
