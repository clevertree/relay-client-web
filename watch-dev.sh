#!/bin/bash
# Development server with dual static directories
# Serves both dist/ (built web app) and relay-template/ from same root
# Uses Express server with automatic fallback routing

PORT=${PORT:-5174}

echo "🔨 Building..."
npm run build || { echo "❌ Build failed"; exit 1; }

echo "🚀 Starting server on port $PORT..."
echo "📡 Routing (both served from root /):"
echo "   /index.html, /dist/*, etc.  -> dist/ (web app)"
echo "   /hooks/, /template/, etc.   -> relay-template/ (fallback)"
echo "   http://localhost:$PORT"
echo ""
echo "Press Ctrl+C to stop"
echo ""

# Start Express server
PORT=$PORT node dev-server.js

