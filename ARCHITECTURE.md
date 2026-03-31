# 🏗️ ARCHITECTURE: Blockchain Trader Skeleton

Documentação técnica profunda sobre a estrutura, fluxos de dados e segurança do 'Blockchain Trader'.

## 📱 Visão Geral da Arquitetura (C4 Model - Level 1)

```mermaid
graph TD
    User((Usuário Telegram))
    Bot[Telegram Bot UI]
    DB[(PostgreSQL - Prisma)]
    Queue[(Redis - BullMQ)]
    Worker[Trade Executor]
    Scanner[Scanner Service]
    API[GeckoTerminal API]
    DEX[DEX - Pancake/QuickSwap]
    
    User -->|Comandos/Menu| Bot
    Bot -->|CRUD Config| DB
    Scanner -->|Period Check| DB
    Scanner -->|Get Market Data| API
    Scanner -->|Enfileira Jobs| Queue
    Queue -->|Processa Trades| Worker
    Worker -->|Executa Swap| DEX
    Worker -->|Log Histórico| DB
```

---

## 🗄️ Modelo de Dados (ERD)

```mermaid
erDiagram
    User ||--|| Wallet : "possui"
    User ||--o{ TradeConfig : "configura"
    User ||--o{ TradeHistory : "registra"
    
    User {
        string id PK
        bigint telegramId UK
        int credits
        string referralCode
        boolean isActive
    }
    
    Wallet {
        string id PK
        string userId FK
        string publicAddress
        string encryptedPrivateKey
        string iv
        string authTag
    }
    
    TradeConfig {
        string id PK
        string userId FK
        string network
        string tokenPair
        float buyAmount
        float sellAmount
        int maPeriod
        boolean rsiEnabled
    }
    
    TradeHistory {
        string id PK
        string userId FK
        string txHash
        string type
        string status
        float amount
    }
```

---

## 🛡️ Protocolo de Segurança: Carteiras Criptografadas

O sistema armazena chaves privadas utilizando **AES-256-GCM**, garantindo que as chaves nunca fiquem em texto claro no banco de dados.

### Fluxo de Criptografia:
1.  **Entrada**: Usuário fornece a Private Key via bot (opcional - geração interna recomendada).
2.  **Processo**: 
    - Geração de um IV (Initialization Vector) único.
    - Criptografia com `ENCRYPTION_KEY` (armazenada em `.env` na VPS).
    - Obtenção do AuthTag (GCM).
3.  **Armazenamento**: `encryptedPrivateKey`, `iv` e `authTag` são salvos no banco.

---

## 🔄 Ciclo de Decisão de Trade (Scanner/Strategy)

A cada minuto, o `Scanner` executa o seguinte algoritmo por configuração:

1.  **Check de Operação**: `isOperating == true`.
2.  **Check de Janela**: O minuto atual está dentro de [windowMin, windowMax]?
3.  **Análise de Sinal**:
    - Obtém velas de 15m e 4h via GeckoTerminal.
    - Calcula MA21 para ambas e RSI14 se ativo.
    - **BUY**: Preço cruza ABAIXO da MA(15m) e MA(4h) indica tendência de alta.
    - **SELL**: Preço cruza ACIMA da MA(15m) (Realização de lucro).
4.  **Execução**: Adiciona Job ao Redis para processamento pelo `TradeExecutor`.
