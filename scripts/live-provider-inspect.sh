#!/bin/sh

set -eu

container_name="${POSTGRES_CONTAINER:-f1-vibetiming-postgres}"
database_name="${POSTGRES_DB:-f1_vibetiming}"
database_user="${POSTGRES_USER:-postgres}"
topic_filter="${1:-}"

run_sql() {
  docker exec -i "${container_name}" psql -U "${database_user}" -d "${database_name}" -P pager=off -c "$1"
}

echo "== Live capture runs =="
run_sql "select source, status, \"eventsCaptured\", \"decodeErrors\", \"sessionKey\", \"startedAt\", \"lastEventAt\" from \"LiveCaptureRun\" order by \"startedAt\" desc limit 5;"

echo
echo "== Topic counts =="
run_sql "select topic, count(*) as total, max(\"emittedAt\") as last_seen from \"LiveProviderEvent\" group by topic order by total desc, topic asc limit 20;"

echo
echo "== Recent catalog rows =="
run_sql "select topic, \"rawTopic\", observations, \"decodeErrorCount\", \"lastSeenAt\" from \"LiveTopicSchemaCatalog\" order by \"lastSeenAt\" desc limit 20;"

echo
if [ -n "${topic_filter}" ]; then
  echo "== Recent payloads for topic ${topic_filter} =="
  run_sql "select topic, \"rawTopic\", \"emittedAt\", \"decodeError\", payload from \"LiveProviderEvent\" where topic = '${topic_filter}' or \"rawTopic\" = '${topic_filter}' order by \"emittedAt\" desc limit 5;"
else
  echo "== Recent events =="
  run_sql "select topic, \"rawTopic\", \"emittedAt\", \"decodeError\", left(payload::text, 240) as payload_preview from \"LiveProviderEvent\" order by \"emittedAt\" desc limit 10;"
fi
