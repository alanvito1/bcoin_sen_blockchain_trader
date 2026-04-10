# ARCHITECTURE.md - Arena Bomberman Trading Bot (RC 1.0)

## 🎯 Visão Geral
O **Arena Bomberman Trading Bot** é um sistema de trading multi-tenant altamente resiliente e gamificado. Ele permite que múltiplos usuários executem estratégias de MA (Média Móvel) de forma autônoma nas redes **BSC** e **Polygon**, protegendo os usuários através do uso obrigatório de **Burner Wallets** (carteiras descartáveis).

---

## 🛠️ Stack Tecnológico
- **Core:** Node.js (CommonJS)
- **Database:** PostgreSQL via **Prisma ORM**
- **Messaging/Queue:** **BullMQ** sobre **Redis**
- **Web3:** **Ethers.js v6**
- **Bot Engine:** **Telegraf** (Telegram Bot API)
- **Segurança:** AES-256-GCM para criptografia de chaves privadas

---

## 🗄️ Topologia de Dados (Modelos Principais)
- `User`: Cadastro central, créditos de operação, XP/Nível de afiliado e preferências de notificação.
- `Wallet`: Carteiras "Burner" dos usuários com chaves criptografadas.
- `TradeConfig`: Configurações granulares por usuário/rede (Strategy A/B, horários, slippage).
- `TradeHistory`: Registro histórico de todas as operações on-chain.
- `PayoutLog`: Auditoria financeira de divisões de comissão (Splits).
- `SystemSecret`: Armazenamento seguro de chaves do sistema (ex: Transit Wallet).
- `SupportTicket`: Sistema Stealth de suporte técnico.

---

## ⚡ Fluxo de Execução de Trade
1. **Scanner (Minute Loop):** Um processo recorrente verifica todos os usuários ativos e decide se é o minuto de execução baseado no `scheduleMode` (Janelas Aleatórias ou Intervalo Fixo).
2. **Fila (Redis):** Se for a hora, um job é adicionado à `tradeQueue`.
3. **Worker (TradeExecutor):**
    - Decriptografa a chave privada em memória (local scope).
    - Consulta o sinal tático no `strategy.js` (MA Crossing).
    - Valida o saldo de gás na rede.
    - Executa o `swap` via Router (PancakeSwap/QuickSwap).
    - Registra o histórico e consome créditos do usuário.
    - Notifica o usuário via Telegram respeitando seus filtros de log.

---

## 💰 Fluxo de Pagamento (Hot Wallet Splitter)
Para evitar custos excessivos de gás on-chain e manter a simplicidade:
1. **Transit Wallet:** O sistema gera automaticamente uma carteira de transição (Escrow) autônoma.
2. **Checkout:** O pagamento do usuário cai na Transit Wallet.
3. **Payout Queue:** Um worker detecta o recebimento e calcula o split.
4. **Gas Aggressive:** O bot realiza duas transferências simultâneas usando **Aggressive Gas Mode** (para confirmação instantânea):
    - **X%** para a carteira do Afiliado (Referrer).
    - **Y%** para a `ADMIN_MASTER_WALLET`.
5. **Audit:** Todos os detalhes (Taxas, TxHashes, Líquido) são salvos na tabela `PayoutLog`.

---

## 🛡️ Segurança e Defesa
- **Padrão Burner:** O bot proíbe a importação da carteira principal. Recomenda-se que o usuário mantenha apenas o saldo operacional na carteira do bot.
- **Nonce Monitor:** Um sensor automático vigia a Transit Wallet. Se um Nonce aumentar sem uma transação registrada no banco, um alerta **CRÍTICO** é enviado ao Admin.
- **Stealth Support:** Não há chat humano direto. Reportes de erros são enviados como tickets criptografados para o Admin.
- **Firewall (UFW):** VPS configurada para aceitar apenas tráfego vindo da API do Telegram e SSH via IP restrito.

---

## 🎮 Gamificação
O bot utiliza uma curva de progressão (XP) para afiliados. Quanto mais operações seus indicados realizam, maior o nível do afiliado e, potencialmente, melhores suas taxas de comissão (configuráveis pelo Admin).
