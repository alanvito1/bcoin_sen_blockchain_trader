echo "Uploading .env"
scp -o StrictHostKeyChecking=no -i "C:\Users\alan-\.ssh\id_ed25519" "C:\Projetos\blockchain-trader\.env" root@<VPS_IP>:/root/blockchain-trader/.env

echo "Uploading docker-compose.yml"
scp -o StrictHostKeyChecking=no -i "C:\Users\alan-\.ssh\id_ed25519" "C:\Projetos\blockchain-trader\docker-compose.yml" root@<VPS_IP>:/root/blockchain-trader/docker-compose.yml

echo "Uploading deploy_hardening.sh"
scp -o StrictHostKeyChecking=no -i "C:\Users\alan-\.ssh\id_ed25519" "C:\Projetos\blockchain-trader\scripts\deploy_hardening.sh" root@<VPS_IP>:/root/blockchain-trader/scripts/deploy_hardening.sh

echo "Setting permissions and executing script on VPS"
$cmd = "chmod +x /root/blockchain-trader/scripts/deploy_hardening.sh && dos2unix /root/blockchain-trader/scripts/deploy_hardening.sh || true && bash /root/blockchain-trader/scripts/deploy_hardening.sh"
ssh -o StrictHostKeyChecking=no -i "C:\Users\alan-\.ssh\id_ed25519" root@<VPS_IP> $cmd
echo "Done!"
