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
    PriceFetcher[Price Fetcher]
    Billing[Billing Cron]
    Notification[Notification Worker]
    API[GeckoTerminal API]
    DEX[DEX - Pancake/QuickSwap]
    
    User -->|Comandos/Menu| Bot
    Bot -->|CRUD Config| DB
    PriceFetcher -->|Atualiza Preços| DB
    Scanner -->|Period Check| DB
    Scanner -->|Get Market Data| API
    Scanner -->|Enfileira Jobs| Queue
    Queue -->|Processa Trades| Worker
    Billing -->|Check Credits| DB
    Worker -->|Executa Swap| DEX
    Worker -->|Log Histórico| DB
    Notification -->|Alertas| Bot
```

---

## 📂 Estrutura de Arquivos (Project Map)

O projeto segue um padrão de organização modular para garantir escalabilidade:

- **`/src`**: Código fonte principal.
    - `api/`: Controladores e rotas (se houver).
    - `bot/`: Lógica do Telegram UI e menus.
    - `worker/`: Processos em background (Scanner, Executor, Billing, etc).
    - `config/`: Configurações de Banco (Prisma) e Redis.
    - `services/`: Lógica de negócio e integrações blockchain.
    - `utils/`: Loggers e helpers de criptografia.
- **`/prisma`**: Definições de schema e migrações.
- **`/legacy`**: Arquivamento de scripts de teste e arquivos órfãos (Fase 1 Discovery).
- **`/logs`**: Logs operacionais (`combined.log`, `error.log`).
- **`/docker`**: Arquivos de configuração de infraestrutura.
- **`index.js`**: Orquestrador de inicialização de todos os serviços.

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

O sistema opera em um ciclo contínuo de "Scan -> Queue -> Execute". Abaixo o detalhamento do fluxo:

```mermaid
sequenceDiagram
    participant S as Scanner (Cron)
    participant GT as GeckoTerminal API
    participant R as Redis (BullMQ)
    participant E as Trade Executor
    participant BC as Blockchain (DEX)
    participant DB as Prisma (PostgreSQL)

    S->>DB: Busca usuários ativos (isOperating=true)
    S->>GT: Consulta preços e indicadores (OHLCV)
    Note over S: Aplica lógica de Médias Móveis (MA21)
    
    alt Sinal de Compra/Venda Gerado
        S->>R: Adiciona Job 'executeTrade'
    end

    R->>E: Notifica disponibilidade de Job
    E->>DB: Busca chave privada criptografada
    E->>BC: Verifica saldo e executa Swap (ethers.js)
    BC-->>E: Retorna txHash
    E->>DB: Registra TradeHistory e desconta créditos
    E->>S: (Via Notification) Envia alerta ao Telegram
```

### Detalhamento das Etapas:

1.  **Check de Operação**: O `Scanner` verifica se o usuário tem saldo de créditos positivo e se o bot está ligado.
2.  **Check de Janela**: Validação se o minuto atual está em uma das janelas configuradas (ex: 15-29m).
3.  **Análise de Sinal**:
    - Obtém velas de 15m e 4h via GeckoTerminal.
    - Calcula MA21 e outros indicadores (RSI opcional).
    - **BUY**: Preço cruza ABAIXO da MA(15m) e MA(4h) indica tendência de alta.
    - **SELL**: Preço cruza ACIMA da MA(15m).
4.  **Execução**: O `TradeExecutor` gerencia a assinatura da transação e o envio para a rede (BSC/Polygon).
