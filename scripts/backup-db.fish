#!/usr/bin/env fish
# Dumps the database to a timestamped, gzipped file and prunes to the 7 most recent.
# Requires DATABASE_URL to be set in the environment.

if not set -q DATABASE_URL
    echo "DATABASE_URL is not set."
    exit 1
end

if not command -q pg_dump
    echo "pg_dump not found — install postgresql-client tools."
    exit 1
end

set script_dir (dirname (status --current-filename))
set backup_dir $script_dir/../backups
mkdir -p $backup_dir

set timestamp (date +%Y%m%d-%H%M%S)
set filename $backup_dir/madamgy-$timestamp.sql.gz

pg_dump $DATABASE_URL | gzip > $filename
if test $pipestatus[1] -ne 0
    echo "pg_dump failed (exit code $pipestatus[1]) — removing incomplete backup file"
    rm -f $filename
    exit 1
end
echo "Backup written to $filename"

set existing_backups (ls -1t $backup_dir/madamgy-*.sql.gz 2>/dev/null)
set count (count $existing_backups)
if test $count -gt 7
    set old_backups $existing_backups[8..-1]
    for f in $old_backups
        rm $f
        echo "Pruned old backup: $f"
    end
end
