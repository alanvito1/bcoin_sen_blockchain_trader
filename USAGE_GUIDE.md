# 🛠️ USAGE GUIDE: Operando o Blockchain Trader

Este guia detalha como configurar e operar o bot através da interface do Telegram e do ambiente de desenvolvimento.

## 🤖 Comandos do Telegram

O bot oferece uma interface de menus interativos. Os principais comandos são:

### 1. `/start` ou `/menu`
Abre o painel principal de controle.
-   **Configurações**: Ajuste de redes, tokens e valores de trade.
-   **Status**: Visualização rápida se o bot está operando (`isOperating`).
-   **Carteira**: Consulta de saldo e endereço público vinculado.

### 2. Configurando Estratégias
No menu **Estratégias**, você pode definir:
-   **Timeframes**: 30m para operações rápidas, 4h para confirmação de tendência.
-   **Indicadores**: Ativar/Desativar RSI e definir períodos de MA.
-   **Valores**: Quantidade de tokens para compra e venda em cada estratégia.

### 3. Gestão de Saldo
-   O bot consome créditos por trade executado.
-   Certifique-se de ter saldo suficiente na rede nativa (BNB na BSC, POL na Polygon) para cobrir as taxas de gás.
-   O bot possui um sistema de **Auto-Swap de Gás**: se restarem poucos ativos nativos, ele tentará converter USDT para gás automaticamente.

---

## ⚙️ Configuração Técnica (.env)

Para administradores, o arquivo `.env` controla o comportamento global:

| Variável | Descrição | Exemplo |
| :--- | :--- | :--- |
| `ENCRYPTION_KEY` | Chave de 32 hex para criptografar Private Keys. | `acb123...` |
| `DRY_RUN` | Se `true`, o bot simula trades sem enviar para a rede. | `false` |
| `REDIS_URL` | Endpoint do Redis para o BullMQ. | `redis://localhost:6379` |
| `TELEGRAM_TOKEN` | Token do BotFather. | `123456:ABC...` |

---

## 📈 Ciclo de Operação Automatizada

O bot não opera 24h freneticamente. Ele segue um **Ciclo de Disciplina**:
1.  **Sorteio**: No início de cada hora, o bot sorteia dois minutos específicos (ex: 22min e 54min).
2.  **Escaneamento**: Nos minutos sorteados, ele analisa os indicadores.
3.  **Execução**: Se o preço cruzou a média e o RSI confirma, a ordem é enviada.
4.  **Descanso**: O bot aguarda o próximo horário sorteado para evitar 'overtrading'.

---

## 🚨 Resolução de Problemas (FAQ)

**P: O bot deu sinal mas não executou o trade.**
*   *R:* Verifique se há transações pendentes no endereço da carteira. O bot bloqueia novos trades se a fila de nonce estiver travada.

**P: Erro "Insufficient funds for gas".**
*   *R:* Adicione BNB ou POL à carteira. O bot precisa de uma reserva mínima para pagar o processamento da transação.

**P: Como mudar os tokens monitorados?**
*   *R:* Edite o arquivo `src/config/index.js` na seção `networks.tokens`.
