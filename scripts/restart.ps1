# Blockchain Trader - Windows Restart & Update Script
# Usage: .\restart.ps1

Write-Host ">>> [Update] Iniciante atualizacao e reinicio no Windows..." -ForegroundColor Cyan

# 1. Build and restart Docker containers
Write-Host ">>> [Docker] Reconstruindo e iniciando containers..." -ForegroundColor Yellow
docker-compose up -d --build

# 2. Wait for containers to be ready
Write-Host ">>> [Wait] Aguardando inicializacao (5s)..." -ForegroundColor Gray
Start-Sleep -s 5

# 3. Synchronize Database Schema
Write-Host ">>> [Database] Sincronizando migrações do Prisma..." -ForegroundColor Yellow
docker-compose exec bot-engine npx prisma migrate deploy

# 4. Success check
if ($LASTEXITCODE -eq 0) {
    Write-Host ">>> [SUCESSO] Implantação concluída. O sistema está online." -ForegroundColor Green
    Write-Host "Dica: Use 'docker-compose logs -f' para monitorar em tempo real."
} else {
    Write-Host ">>> [ERRO] A implantação falhou durante as migrações." -ForegroundColor Red
}

# 5. Cleanup dangling images
Write-Host ">>> [Clean] Limpando imagens orfas..." -ForegroundColor Gray
docker image prune -f
