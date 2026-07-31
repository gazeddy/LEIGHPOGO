#!/usr/bin/env bash
set -euo pipefail
mkdir -p tmp/slimwiki-dynamax

while IFS='|' read -r name url; do
  curl --fail --location --silent --show-error "$url" \
    > "tmp/slimwiki-dynamax/$name.html"
done <<'URLS'
01-getting-started|https://slimwiki.com/pokemon-go-leigh/getting-started/getting-started-f10rfvvoyp-jj92z9f8cl2g
02-particles|https://slimwiki.com/pokemon-go-leigh/getting-started/particles-epcmi7g9mq-vhj06pdle5ds
03-powering-up|https://slimwiki.com/pokemon-go-leigh/getting-started/powering-up-huwnl2acaf-2x2q43v0a1xl
04-roles|https://slimwiki.com/pokemon-go-leigh/getting-started/roles-c3jq93uegt-rn4dftm5u8ql
05-battling|https://slimwiki.com/pokemon-go-leigh/getting-started/battling-rz7jp9gsig-tjk6bb8vpr1h
06-picking-teams|https://slimwiki.com/pokemon-go-leigh/getting-started/picking-teams-gkafq6hztt-nckvgfhkt5xw
07-links|https://slimwiki.com/pokemon-go-leigh/getting-started/links-5tncn834w0-gxd441axy6cz
URLS
