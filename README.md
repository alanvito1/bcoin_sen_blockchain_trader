# 🚀 Blockchain Trader: Multi-Chain Auto-Trader Bot

[![CI/CD](https://img.shields.io/badge/CI%2FCD-Mock-gray.svg?style=flat-square)]()
[![Version](https://img.shields.io/badge/Version-1.0.0-blue.svg?style=flat-square)]()
[![License](https://img.shields.io/badge/License-MIT-green.svg?style=flat-square)]()
[![Blockchain](https://img.shields.io/badge/Networks-BSC%20%7C%20Polygon-orange.svg?style=flat-square)]()

**O 'Blockchain Trader' é um sistema de trading autônomo de alta precisão projetado para operar tokens (BCOIN, SEN) nas redes BSC e Polygon. Equipado com indicadores técnicos (MA, RSI) e proteção anti-sanduíche, o bot automatiza o ciclo completo de trade via Telegram.**

---

## 🔥 Por que este projeto? (The "Why")

O mercado de tokens em blockchains alternativas (EVM) exige velocidade e disciplina. Manter o controle manual sobre cruzamentos de médias e janelas de trade é exaustivo. O **Blockchain Trader** resolve isso:
-   **Disciplina de Sinais**: Executa ordens apenas quando indicadores MA21 e RSI confirmam o ponto de entrada/saída.
-   **Proteção de Ativos**: Sistema de roteamento inteligente que evita perdas por derrapagem (slippage) extrema.
-   **Gerenciamento Multi-Chain**: Uma única interface para gerir trades em redes diferentes simultaneamente.

---

## 🏗️ Mapa de Arquitetura (High-Level)

```mermaid
graph LR
    User((Usuário)) <--> Bot[Bot UI (Telegram)]
    Bot <--> DB[(Prisma / Postgres)]
    Scanner[Auto-Scanner] -->|Sinais| DB
    Scanner -->|Jobs| Queue((Redis / BullMQ))
    Queue -->|Processa| Executor[Trade Executor]
    Executor --> DEX[DEX / On-Chain]
```

---

## ⚡ Quick Start (Guia Rápido)

### 1. Pré-requisitos
-   Node.js v18+
-   Docker e Docker-Compose
-   Telegram Bot Token (via @BotFather)

### 2. Configuração (1 Click)
```bash
# Clone e entre na pasta
git clone https://github.com/alanvito1/bcoin_sen_blockchain_trader.git
cd bcoin_sen_blockchain_trader

# Copie o ambiente e edite as variáveis essenciais
cp .env.example .env

# Suba a infraestrutura (DB + Redis)
docker-compose up -d

# Inicialize o banco e o bot
npm install
npx prisma migrate dev
npm start
```

---

## 📖 Documentação Completa (Deep Scribe ✍️)

Para uma imersão técnica profunda, explore os seguintes manuais:

-   [🗺️ SYSTEM_ATLAS.md](file:///c:/Projetos/blockchain-trader/docs/SYSTEM_ATLAS.md): Inventário completo de serviços, tabelas e fluxos.
-   [🏗️ ARCHITECTURE.md](file:///c:/Projetos/blockchain-trader/docs/ARCHITECTURE.md): Diagramas técnicos de sequência, ERD e Segurança.
-   [🛠️ USAGE_GUIDE.md](file:///c:/Projetos/blockchain-trader/docs/USAGE_GUIDE.md): Manual do usuário final e menus do bot.
-   [🔎 SCRIBE_JOURNAL.md](file:///c:/Projetos/blockchain-trader/docs/SCRIBE_JOURNAL.md): GAP Analysis e dívidas técnicas mapeadas.

---

## 🏁 Glossário de Termos
-   **MA (Moving Average):** Média móvel ponderada usada para identificar tendência.
-   **RSI (Relative Strength Index):** Indicador de força que aponta sobrecompra ou sobrevenda.
-   **Slippage:** A diferença entre o preço esperado do trade e o preço executado.
-   **RPC:** Gateway de comunicação com a Blockchain (BSC/Polygon).

---
*Desenvolvido com ✍️ por Deep Scribe Agent.*
