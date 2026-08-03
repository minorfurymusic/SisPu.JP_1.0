#!/usr/bin/env bash
PROMPT="$1"

# Load GITHUB_TOKEN from process env or .env file
TOKEN="$GITHUB_TOKEN"
if [ -z "$TOKEN" ] && [ -f .env ]; then
  TOKEN=$(grep "^GITHUB_TOKEN=" .env | head -n 1 | cut -d '=' -f2- | tr -d '"' | tr -d "'" | tr -d '\r')
fi

# Load GITHUB_USER or default to jeanrsl098
USER_NAME="$GITHUB_USER"
if [ -z "$USER_NAME" ]; then
  USER_NAME="jeanrsl098"
fi

if [[ "$PROMPT" =~ Username ]]; then
  echo "$USER_NAME"
elif [[ "$PROMPT" =~ Password ]]; then
  echo "$TOKEN"
else
  echo "$TOKEN"
fi
