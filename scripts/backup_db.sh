#!/bin/bash
BACKUP_DIR="/root/trader/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR
cd /root/trader && docker-compose exec -T postgres pg_dump -U autotrader autotrader > $BACKUP_DIR/db_backup_$TIMESTAMP.sql
find $BACKUP_DIR -type f -mtime +7 -delete
echo "Backup concluido em $BACKUP_DIR/db_backup_$TIMESTAMP.sql"
