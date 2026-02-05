#!/bin/bash
cd "$(dirname "$0")"

# Extract current version from index.html
current=$(grep -oP '\?v=\K[0-9]+' index.html | head -1)

if [ -z "$current" ]; then
  echo "No version found in index.html"
  exit 1
fi

next=$((current + 1))

sed -i "s/?v=$current/?v=$next/g" index.html

echo "Bumped version: $current -> $next"
