# Backup & Restore Runbook

## Backing up

Run `fish scripts/backup-db.fish` with `DATABASE_URL` set to the production database. Schedule it via cron (e.g. `0 */6 * * * cd /path/to/new && DATABASE_URL=... fish scripts/backup-db.fish >> /var/log/madamgy-backup.log 2>&1`) for a 6-hourly cadence. Backups land in `backups/`, gzipped, pruned to the 7 most recent.

## Restoring

1. Stop the API server so nothing writes during restore: `docker compose stop api`
2. Pick the backup file to restore from `backups/madamgy-<timestamp>.sql.gz`
3. Drop and recreate the target database (only on a genuine disaster-recovery restore, never on a live database with data you want to keep):
   `docker compose exec postgres psql -U madamgy -c "DROP DATABASE madamgy;"`
   `docker compose exec postgres psql -U madamgy -c "CREATE DATABASE madamgy;"`
4. Restore: `gunzip -c backups/madamgy-<timestamp>.sql.gz | docker compose exec -T postgres psql -U madamgy madamgy`
5. Restart the API: `docker compose start api`
6. Verify: `docker compose exec postgres psql -U madamgy madamgy -c "SELECT count(*) FROM \"User\";"` returns a plausible row count.

## MinIO (prescription PDFs, lab reports, doctor license documents)

MinIO data lives in the `minidata` docker volume. Back it up separately with:
`docker run --rm -v new_minidata:/data -v $(pwd)/backups:/backup alpine tar czf /backup/minio-$(date +%Y%m%d).tar.gz -C /data .`

Restore by reversing the tar command into a fresh `minidata` volume before starting the `minio` service.

## Retention

Medical records (prescriptions, lab reports) should be retained indefinitely or per applicable local medical-records-retention regulation — do not apply a deletion policy to MinIO objects without confirming the retention requirement first; this is a compliance question, not a technical one.
