#!/usr/bin/env bash
set -euo pipefail
mkdir -p tmp/slimwiki-dynamax
curl --fail --location --silent --show-error \
  'https://slimwiki.com/pokemon-go-leigh/getting-started/getting-started-f10rfvvoyp-jj92z9f8cl2g' \
  > tmp/slimwiki-dynamax/01-getting-started.html
