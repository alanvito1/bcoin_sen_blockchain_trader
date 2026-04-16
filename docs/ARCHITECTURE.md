# 🏗️ ARCHITECTURE: Blockchain Trader Skeleton

Technical documentation on the structure, data flows, and security of 'Blockchain Trader'.

## 📱 Architecture Overview (C4 Model - Level 1)

```mermaid
graph TD
    User((Telegram User))
    Bot[Telegram Bot UI]
    DB[(PostgreSQL - Prisma)]
    Queue[(Redis - BullMQ)]
    Worker[Trade Executor]
    Scanner[Scanner Service]
    PriceFetcher[Price Fetcher]
    Billing[Billing Cron]
    Notification[Notification Worker]
    API[GeckoTerminal API]
    DEX[DEX - Pancake/QuickSwap]
    
    User -->|Commands/Menu| Bot
    Bot -->|CRUD Config| DB
    PriceFetcher -->|Update Prices| DB
    Scanner -->|Period Check| DB
    Scanner -->|Get Market Data| API
    Scanner -->|Enqueue Jobs| Queue
    Queue -->|Process Trades| Worker
    Billing -->|Check Credits| DB
    Worker -->|Execute Swap| DEX
    Worker -->|Log History| DB
    Notification -->|Alerts| Bot
```

---

## 📂 File Structure (Project Map)

The project follows a modular organization pattern to ensure scalability and clarity for the Open Source community:

- **`/src`**: Main source code (Business Logic).
    - `bot/`: Telegram Interface (Menus, Telegraf).
    - `worker/`: Background Workers (Scanner, Executor, Billing).
    - `services/`: Blockchain Services, Swapper, and Pricing.
    - `config/`: Configuration Singleton (Prisma, Redis, Env).
- **`/test`**: Test suite (Database, RPC, Balances, Trade Logic).
- **`/scripts`**: Utility, deployment, and assisted audit scripts.
- **`/docs`**: Detailed technical documentation and manuals.
- **`/tools`**: On-chain analysis tools and pool debugging.
- **`/prisma`**: Database schema and migrations.
- **`index.js`**: Entry point (System Bootloader).
- **`docker-compose.yml`**: Infrastructure orchestrator (Postgres/Redis/Bot).

---

## 🗄️ Data Model (ERD)

```mermaid
erDiagram
    User ||--|| Wallet : "has"
    User ||--o{ TradeConfig : "configures"
    User ||--o{ TradeHistory : "records"
    
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

## 🛡️ Security Protocol: Encrypted Wallets

The system stores private keys using **AES-256-GCM**, ensuring that keys are never stored in plain text in the database.

### Encryption Flow:
1.  **Input**: User provides the Private Key via bot (optional - internal generation recommended).
2.  **Process**: 
    - Generation of a unique IV (Initialization Vector).
    - Encryption with `ENCRYPTION_KEY` (stored in `.env` on the VPS).
    - Obtaining the AuthTag (GCM).
3.  **Storage**: `encryptedPrivateKey`, `iv`, and `authTag` are saved in the database.

---

## 🔄 Trade Decision Cycle (Scanner/Strategy)

The system operates in a continuous "Scan -> Queue -> Execute" cycle. Below is the flow detail:

```mermaid
sequenceDiagram
    participant S as Scanner (Cron)
    participant GT as GeckoTerminal API
    participant R as Redis (BullMQ)
    participant E as Trade Executor
    participant BC as Blockchain (DEX)
    participant DB as Prisma (PostgreSQL)

    S->>DB: Fetch active users (isOperating=true)
    S->>GT: Query prices and indicators (OHLCV)
    Note over S: Applies Moving Average logic (MA21)
    
    alt Trade Signal Generated
        S->>R: Add 'executeTrade' Job
    end

    R->>E: Notify Job availability
    E->>DB: Fetch encrypted private key
    E->>BC: Verify balance and execute Swap (ethers.js)
    BC-->>E: Return txHash
    E->>DB: Record TradeHistory and deduct credits
    E->>S: (Via Notification) Send Telegram alert
```

### Step Detail:

1.  **Operation Check**: The `Scanner` checks if the user has a positive credit balance and if the bot is turned on.
2.  **Window Check**: Validation of whether the current minute is within one of the configured windows (e.g., 15-29m).
3.  **Signal Analysis**:
    - Gets 15m and 4h candles via GeckoTerminal.
    - Calculates MA21 and other indicators (RSI optional).
    - **BUY**: Price crosses BELOW MA(15m) and MA(4h) indicates uptrend.
    - **SELL**: Price crosses ABOVE MA(15m).
4.  **Execution**: The `TradeExecutor` manages transaction signing and submission to the network (BSC/Polygon).
5.  **Operational Audit**: The script `src/scripts/audit_fix.js` allows for manual integrity verification of all components (RPC, DB, Redis, Wallet).

---

## 🛠️ Maintenance and Aegis (OpenClaw) Deactivation

Originally, the system used an AI module called **Aegis (OpenClaw)** for automatic error detection and correction. After production auditing, this module was **DEACTIVATED** for the following reasons:
-   **API Instability**: Recurring failures in the AI token limit (Google Gemini).
-   **Notification Loops**: The system entered recursion when trying to report network errors through the same unstable network.
-   **Operational Security**: Remote auto-maintenance was replaced by an **Assisted Audit** model, where the administrator uses diagnostic tools to validate the system before manual interventions.

Currently, Aegis remains in the repository only as historical reference, not interfering with the main execution cycle.
