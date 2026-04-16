# 🚀 Blockchain Trader: Multi-Chain Auto-Trader Bot

![CI/CD](https://img.shields.io/badge/CI%2FCD-Active-green.svg?style=flat-square)
![Version](https://img.shields.io/badge/Version-1.0.0-blue.svg?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-green.svg?style=flat-square)
![Networks](https://img.shields.io/badge/Networks-BSC%20%7C%20Polygon-orange.svg?style=flat-square)

**'Blockchain Trader' is a high-precision autonomous trading system designed to operate tokens (BCOIN, SEN) on the BSC and Polygon networks. Equipped with technical indicators (MA, RSI) and anti-sandwich protection, the bot automates the full trade cycle via Telegram.**

---

## 🔥 Why this project?

The token market on EVM blockchains requires speed and discipline. Manually tracking moving average crossovers and trade windows is exhausting. **Blockchain Trader** solves this:
-   **Signal Discipline**: Executes orders only when MA21 and RSI indicators confirm entry/exit points.
-   **Asset Protection**: Intelligent routing system that avoids losses due to extreme slippage.
-   **Multi-Chain Management**: A single interface to manage trades on different networks simultaneously.

---

## 🏗️ Architecture Map (High-Level)

```mermaid
graph LR
    User((User)) <--> Bot[Bot UI (Telegram)]
    Bot <--> DB[(Prisma / Postgres)]
    Scanner[Auto-Scanner] -->|Signals| DB
    Scanner -->|Jobs| Queue((Redis / BullMQ))
    Queue -->|Processes| Executor[Trade Executor]
    Executor --> DEX[DEX / On-Chain]
```

---

## ⚡ Quick Start (Local Environment)

### 1. Prerequisites
-   Node.js v20+
-   Docker Desktop (Mandatory for PostgreSQL/Redis)
-   Telegram Bot Token (via @BotFather)

### 2. Configuration
```bash
# Clone and enter the directory
git clone https://github.com/alanvito1/bcoin_sen_blockchain_trader.git
cd bcoin_sen_blockchain_trader

# Install dependencies
npm install

# Configure environment
cp .env.example .env

# Start infrastructure and bot via Docker (Recommended)
docker compose up -d --build
```

---

## 📖 Documentation

For a deep technical immersion, explore the following manuals:

- [System Atlas](docs/SYSTEM_ATLAS.md): Complete inventory of services, tables, and flows.
- [Architecture & Security](docs/ARCHITECTURE.md): Technical sequence diagrams, ERD, and Security.
- [Usage Guide](docs/USAGE_GUIDE.md): End-user manual and bot menus.
- [Security Guidelines](docs/SECURITY.md): Security guidelines and auditing.
- [Contributing](CONTRIBUTING.md): How to contribute to the project.

---

## ⚖️ License

This project is under the **MIT** license. You are free to use, modify, and distribute the code, including for commercial purposes, provided you keep the copyright notice and cite the original source (**Senspark / Blockchain Trader**).

---
*Developed with ✍️ by Antigravity AI Agent.*
