#!/bin/bash
# VPS Monitoring Script for Stress Test Performance
# Captures peak CPU and RAM usage during the test.

LOG_FILE="stress_monitor.log"
echo "Starting monitor at $(date)" > $LOG_FILE

PEAK_CPU=0
PEAK_MEM=0

# Duration in seconds (e.g., 300 for 5 mins)
DURATION=${1:-300}
END_TIME=$((SECONDS + DURATION))

while [ $SECONDS -lt $END_TIME ]; do
    # Get total CPU usage (100 - idle)
    CPU=$(top -bn1 | grep "Cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print 100 - $1}')
    
    # Get used RAM in MiB
    MEM=$(free -m | awk '/Mem:/ { print $3 }')
    TOTAL_MEM=$(free -m | awk '/Mem:/ { print $2 }')

    # Update peaks
    if (( $(echo "$CPU > $PEAK_CPU" | bc -l) )); then PEAK_CPU=$CPU; fi
    if (( $MEM > $PEAK_MEM )); then PEAK_MEM=$MEM; fi

    echo "$(date +%H:%M:%S) - CPU: $CPU% | MEM: ${MEM}MiB/${TOTAL_MEM}MiB" >> $LOG_FILE
    
    sleep 1
done

echo "Monitoring finished." >> $LOG_FILE
echo "--- PEAK REPORT ---" >> $LOG_FILE
echo "Peak CPU: $PEAK_CPU%" >> $LOG_FILE
echo "Peak RAM: ${PEAK_MEM}MiB" >> $LOG_FILE

cat <<EOF > performance_bulletin.txt
=========================================
      BOLETIM DE PERFORMANCE VPS
=========================================
Pico de CPU: $PEAK_CPU%
Pico de RAM: ${PEAK_MEM}MiB (Total: ${TOTAL_MEM}MiB)
Monitorado por: $DURATION s
Fim do Monitoramento: $(date)
=========================================
EOF

echo "Performance bulletin generated in performance_bulletin.txt"
