#!/usr/bin/env bash
set -euo pipefail

# Usage: ./capture_docker.sh <run_dir> <container_name...>
if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <run_dir> <container_name...>" >&2
  exit 1
fi

RUN_DIR="$1"
shift

mkdir -p "${RUN_DIR}"

for CONTAINER in "$@"; do
  if ! docker inspect "${CONTAINER}" >/dev/null 2>&1; then
    echo "warn: container not found, skip: ${CONTAINER}" >&2
    continue
  fi

  docker logs --follow --timestamps "${CONTAINER}" \
    > "${RUN_DIR}/${CONTAINER}.log" 2>&1 &
  echo $! > "${RUN_DIR}/${CONTAINER}.pid"
  echo "docker_capture_started container=${CONTAINER} pid=$(cat "${RUN_DIR}/${CONTAINER}.pid")"
done
