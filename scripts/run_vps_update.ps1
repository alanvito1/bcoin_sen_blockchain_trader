$ErrorActionPreference = "Stop"
echo "Uploading .env"
scp -o StrictHostKeyChecking=no -i "C:\Users\alan-\.ssh\id_ed25519" "C:\Projetos\blockchain-trader\.env" root@177.153.33.7:/root/blockchain-trader/.env

echo "Uploading docker-compose.yml"
scp -o StrictHostKeyChecking=no -i "C:\Users\alan-\.ssh\id_ed25519" "C:\Projetos\blockchain-trader\docker-compose.yml" root@177.153.33.7:/root/blockchain-trader/docker-compose.yml

echo "Uploading deploy_hardening.sh"
scp -o StrictHostKeyChecking=no -i "C:\Users\alan-\.ssh\id_ed25519" "C:\Projetos\blockchain-trader\scripts\deploy_hardening.sh" root@177.153.33.7:/root/blockchain-trader/scripts/deploy_hardening.sh

echo "Setting permissions and executing script on VPS"
$cmd = "chmod +x /root/blockchain-trader/scripts/deploy_hardening.sh && dos2unix /root/blockchain-trader/scripts/deploy_hardening.sh || true && bash /root/blockchain-trader/scripts/deploy_hardening.sh"
ssh -o StrictHostKeyChecking=no -i "C:\Users\alan-\.ssh\id_ed25519" root@177.153.33.7 $cmd
echo "Done!"
