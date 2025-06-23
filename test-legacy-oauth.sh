#!/bin/bash

# Test script for legacy OAuth endpoints

BASE_URL="http://localhost:33007"

echo "Testing Legacy OAuth Endpoints..."
echo "================================"

# Test 1: Check OAuth Protected Resource metadata (standard)
echo -e "\n1. Testing /.well-known/oauth-protected-resource"
curl -s "$BASE_URL/.well-known/oauth-protected-resource" | jq .

# Test 2: Check OAuth Authorization Server metadata (legacy)
echo -e "\n2. Testing /.well-known/oauth-authorization-server"
curl -s "$BASE_URL/.well-known/oauth-authorization-server" | jq .

# Test 3: Verify authorization endpoint exists
echo -e "\n3. Testing /authorize endpoint (should redirect)"
curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/authorize?response_type=code&client_id=test&redirect_uri=http://localhost:8080/callback"

# Test 4: Verify token endpoint exists
echo -e "\n4. Testing /token endpoint (should return 400 without proper request)"
curl -s -X POST -o /dev/null -w "%{http_code}" "$BASE_URL/token"

echo -e "\n\nAll endpoints tested!"