#!/bin/bash
cd "$(dirname "$0")"
./scripts/backup.sh || true
echo
read -r -p "Press Enter to close this window."
