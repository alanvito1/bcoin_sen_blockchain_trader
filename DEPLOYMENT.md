# 🚀 Deployment Live: Servidor VPS (Docker)

Esta documentação serve como o **Guia Definitivo** para colocar o *Blockchain Auto-Trader* online em um servidor Linux (VPS) profissional.

---

## 🏗️ Passo 1: Preparando o Servidor (VPS)

Recomendamos a **Contabo** ou **Hetzner** por terem excelente custo-benefício (procure máquinas com pelo menos 4GB de RAM).
1. Contrate uma VPS com sistema operacional **Ubuntu 22.04 LTS** (ou 24.04 LTS).
2. Acesse sua máquina via SSH:
   ```bash
   ssh root@ip-do-seu-servidor
   ```

## 🛠️ Passo 2: Instalando Dependências Base (No Servidor)

Execute estes comandos de uma vez para atualizar o servidor e instalar o Docker:
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install git curl unzip nginx certbot python3-certbot-nginx -y

# Instalando o Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo apt-install docker-compose-plugin -y
```

## 📥 Passo 3: Baixando o Código

Você pode clonar o seu repositório Git ou enviar os arquivos zipados.
```bash
git clone https://seu-link-do-github/blockchain-trader.git
cd blockchain-trader
```

## 🔐 Passo 4: Configurando as Variáveis de Produção

Crie o arquivo de configuração seguro da versão de produção:
```bash
cp .env.example .env
nano .env
```
Preencha TUDO no `.env`, incluindo:
* `TELEGRAM_BOT_TOKEN`: O token real do bot de produção (BotFather).
* `PRIVATE_KEY`: A chave privada real que pagará o gás e processará os nós.
* `ADMIN_MASTER_WALLET`: O endereço que recebe 90%/100% de todo o lucro processado na loja.

> [!WARNING]
> Nunca comite o seu `.env` preenchido no GitHub. Garanta que o `.gitignore` esteja cobrindo ele.

## 🚀 Passo 5: Subindo a Aplicação (Arquitetura Docker)

A nossa arquitetura embutida no `docker-compose.yml` faz tudo sozinha:
1. Sobe o banco de dados PostgreSQL (`trader-db`).
2. Sobe a fila do Redis (`trader-redis`).
3. Compila o Node.js (`trader-engine`), processa o `prisma generate`, executa as **migrações do banco (`npx prisma migrate deploy`)** automaticamente e liga todos os workers e o bot Telegram.

Apenas execute:
```bash
docker compose up -d --build
```

### Verificando os Logs (Monitoramento)
Acompanhe os logs em tempo real para ter certeza que tudo subiu bem:
```bash
docker compose logs -f bot-engine
```

## 🛑 Comandos de Manutenção 

| Ação | Comando |
| :--- | :--- |
| **Parar o Bot** | `docker compose down` |
| **Atualizar Código** | `git pull && docker compose up -d --build` |
| **Verificar Banco** | `docker exec -it trader-engine npx prisma studio` |
| **Zerar Banco** | `docker volume rm blockchain-trader_pgdata` *(Apenas em emergências extremas)* |

---
*Ambiente criado para operação 24/7 sem interrupções por quedas de internet local.*
