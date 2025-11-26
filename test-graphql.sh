#!/bin/bash

echo "🧪 Testing EvidFlow GraphQL API..."

# Test health endpoints
echo "1. Testing health endpoints..."
curl -s http://localhost:4000/health | jq . || curl -s http://localhost:4000/health
echo ""

curl -s http://localhost:4001/health | jq . || curl -s http://localhost:4001/health
echo ""

curl -s http://localhost:4002/health | jq . || curl -s http://localhost:4002/health
echo ""

# Test GraphQL schema
echo "2. Testing GraphQL schema..."
curl -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"query { __schema { types { name } } }"}' \
  | jq . 2>/dev/null || curl -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"query { __schema { types { name } } }"}'

echo ""
echo "✅ Testing completed!"
