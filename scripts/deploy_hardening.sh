#!/bin/bash
set -e

echo "=== INICIANDO TRANCA DE PRODUCAO ==="
cd /root/blockchain-trader

echo "1. Configurando Firewall (UFW)..."
ufw allow 22/tcp
ufw default deny incoming
ufw --force enable

echo "2. Limpando logs..."
rm -vf logs/*.log
truncate -s 0 /var/lib/docker/containers/*/*-json.log || true

echo "3. Parando containers antigos..."
docker-compose down

echo "4. Iniciando banco de dados para alterar senha..."
docker-compose up -d db
sleep 10
echo "Alterando senha do postgres..."
docker exec trader-db psql -U postgres -d postgres -c "ALTER USER postgres WITH PASSWORD '21-jAid_vVMFZOgnB24ICw';"

echo "5. Iniciando backend com nova configuracao e aguardando subida completa..."
docker-compose up -d --build
sleep 20

echo "6. Truncando tabelas no Prisma..."
docker exec -i trader-engine npx prisma db execute --stdin << 'EOF'
TRUNCATE "Wallet", "TradeHistory" CASCADE;
EOF

echo "=== TRANCA DE PRODUCAO CONCLUIDA ==="
