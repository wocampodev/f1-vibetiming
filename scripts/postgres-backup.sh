#!/bin/sh

set -eu

backup_dir="${BACKUP_DIR:-/backups}"
retention_days="${BACKUP_RETENTION_DAYS:-30}"
postgres_host="${POSTGRES_HOST:-postgres}"
postgres_user="${POSTGRES_USER:-postgres}"
postgres_db="${POSTGRES_DB:-f1_vibetiming}"
timestamp="$(date -u '+%Y%m%dT%H%M%SZ')"
filename="${postgres_db}_${timestamp}.sql.gz"
tmp_path="${backup_dir}/.${filename}.tmp"
final_path="${backup_dir}/${filename}"

mkdir -p "${backup_dir}"

echo "Creating PostgreSQL backup ${final_path}"
pg_dump \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --host="${postgres_host}" \
  --username="${postgres_user}" \
  --dbname="${postgres_db}" \
  | gzip -c > "${tmp_path}"

mv "${tmp_path}" "${final_path}"

find "${backup_dir}" -type f -name '*.sql.gz' -mtime +"${retention_days}" -delete

echo "PostgreSQL backup completed ${final_path}"
