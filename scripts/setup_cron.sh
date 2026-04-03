#!/bin/bash
# Set execute permission
chmod +x /root/trader/scripts/backup_db.sh

# Add to crontab if not already there
(crontab -l 2>/dev/null | grep -v "/root/trader/scripts/backup_db.sh"; echo "0 3 * * * /root/trader/scripts/backup_db.sh >> /root/trader/backups/backup.log 2>&1") | crontab -

echo "Crontab configurado com sucesso para backup diario as 03:00 AM."
