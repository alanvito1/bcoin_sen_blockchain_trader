# 🚀 Blockchain Auto-Trader (Polygon & BSC)

Autonomous trading bot designed for decentralized exchanges (DEXs) on EVM-compatible networks. The bot executes swaps based on a scheduled strategy with randomized execution windows to mimic human behavior and optimize gas fees.

## 🛠️ Tech Stack

- **Runtime:** Node.js
- **Blockchain Interface:** [ethers.js (v6)](https://docs.ethers.org/v6/)
- **Data Fetching:** Axios
- **Scheduling:** node-cron
- **Configuration:** dotenv
- **Executable Packaging:** [pkg](https://github.com/vercel/pkg)

## 🗺️ Application Map

```text
blockchain-trader/
├── src/
│   ├── config/       # Environment variable loading and bot settings
│   ├── services/     # Core business logic
│   │   ├── blockchain.js  # RPC connections, balances, and gas management
│   │   ├── indicator.js   # (Optional) Market analysis and decision logic
│   │   ├── scheduler.js   # Job orchestration and randomized timing
│   │   └── swapper.js     # DEX interaction (Swap execution)
│   ├── utils/        # Shared helper modules
│   │   ├── explorer.js    # Link generators for Block Explorers
│   │   └── logger.js      # Centralized logging system
│   └── index.js      # Main entry point (initializes services)
├── tools/            # Maintenance and recovery utilities
├── scripts/          # Automation and setup helper scripts
├── test/             # Unit and integration test suites
└── package.json      # Project dependencies and build scripts
```

## ⚙️ How It Works

1. **Initialization:** `index.js` loads the configuration from `.env` and starts the `scheduler.js`.
2. **Scheduling:** The bot operates in two hourly windows. For each hour, it picks a random minute within each window to perform a check/trade.
3. **Execution:**
   - The `scheduler` calls `swapper` to initiate a trade.
   - `swapper` checks balances via `blockchain.js`.
   - If conditions are met, a swap transaction is sent to the network.
4. **Resilience:** The bot handles RPC failures and maintains logs in the `/logs` directory (optional metadata).

## 🚀 Getting Started

1. **Configure Environment:**
   Edit `.env` with your credentials:
   ```ini
   PRIVATE_KEY=0x...
   # Window 1 (Minutes 0-29)
   WINDOW1_MIN=0
   WINDOW1_MAX=29
   # Window 2 (Minutes 30-59)
   WINDOW2_MIN=30
   WINDOW2_MAX=59
   ```

2. **Install Dependencies:**
   ```bash
   npm install
   ```

3. **Run the Bot:**
   ```bash
   npm start
   ```

4. **Build Executable:**
   ```bash
   npx pkg .
   ```

---
*Developed for autonomous asset management on decentralized networks.*
