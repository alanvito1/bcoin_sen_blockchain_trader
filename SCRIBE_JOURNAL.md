# ✍️ Scribe's Journal: Gap Analysis

Este documento registra as ambiguidades, dívidas técnicas e lacunas de documentação encontradas durante a análise profunda do código.

## 🕵️ Descobertas e Ambiguidades

### 1. Dualidade de Serviços de Sinais
*   **Status**: ⚠️ Ambíguo
*   **Descoberta**: Existem dois arquivos principais para lógica de sinal: `src/services/indicator.js` e `src/services/tradingStrategy.js`.
*   **Problema**: O `indicator.js` parece ser uma versão simplificada ou legada, enquanto o `tradingStrategy.js` contém a implementação robusta de Retries e amostragem de 15m/30m solicitada recentemente.
*   **Impacto**: Pode confundir novos desenvolvedores sobre qual lógica é a "fonte da verdade".

### 2. Complexidade do Scheduler
*   **Status**: 🔎 Necessita Detalhamento
*   **Descoberta**: O `TradeConfig` possui `scheduleMode` (window/interval) e janelas de minutos (15-29, 45-59).
*   **Problema**: A lógica de como essas janelas interagem com o scanner (que roda a cada 1m) não está explícita.
*   **Risco**: Possíveis disparos duplicados ou perda de janela se o scanner atrasar.

### 3. Carteiras MEV (Miner Extractable Value)
*   **Status**: 🛡️ Segurança/Performance
*   **Descoberta**: Há referências a `mevWallets` e `mevProviders` no `blockchain.js` e `swapper.js`.
*   **Problema**: Não há documentação sobre quais RPCs usar para proteção MEV e se isso está ativo por padrão.

### 4. Tratamento de Erros de Rede
*   **Status**: ⚠️ Baixa Observabilidade
*   **Descoberta**: Muitos blocos `catch` em `swapper.js` apenas logam o erro.
*   **Falha**: O `TradeHistory` grava o erro, mas não há um sistema de alerta imediato no bot (exceto logs).

## 🗺️ Recomendações do Scribe
1.  Consolidar `indicator.js` dentro de `tradingStrategy.js` ou marcar um como depreciado.
2.  Criar um fluxograma Mermaid específico para o `Scheduler`.
3.  Documentar as variáveis de ambiente necessárias para `MEV_RPC`.
