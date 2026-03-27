# 🚀 Blockchain Auto-Trader (Polygon & BSC)

Este é um robô de trading autônomo projetado para operar em corretoras descentralizadas (DEXs) nas redes Polygon e BSC. Ele segue uma estratégia de "compra na baixa e venda na alta" baseada em Médias Móveis, com execuções aleatórias para simular comportamento humano.

---

## 📖 Para Iniciantes: Começando do Zero

Se você nunca rodou um projeto de programação antes, siga este passo a passo simples para preparar seu computador:

### 1. Instalar o "Motor" (Node.js)
O robô precisa do **Node.js** para funcionar.
- Acesse: [nodejs.org](https://nodejs.org/)
- Baixe a versão **LTS** (Long Term Support).
- Instale como qualquer outro programa no Windows (basta ir clicando em "Next").

### 2. Abrir o Terminal (PowerShell)
No Windows, o terminal é onde você digita comandos para o robô.
- Aperte as teclas `Windows + X` no seu teclado.
- Escolha **Terminal**, **Windows PowerShell** ou **Prompt de Comando**.

### 3. Preparar a Pasta do Projeto
- Baixe o projeto e extraia em uma pasta (ex: `C:\RoboTrader`).
- No terminal, navegue até essa pasta digitando:
  ```powershell
  cd C:\RoboTrader
  ```

### 4. Instalar as Dependências
Com o terminal aberto na pasta certa, digite:
```bash
npm install
```
*Isso vai baixar todos os módulos necessários para o robô conversar com a Blockchain.*

---

## ⚙️ Guia de Configuração (O arquivo .env)

O arquivo `.env` é o "cérebro" das suas configurações. **Nunca compartilhe sua chave privada!**

| Variável | O que faz? | Impacto no Robô |
| :--- | :--- | :--- |
| `PRIVATE_KEY` | Sua chave de carteira (sem o 0x). | Define de onde saem os fundos e onde entram os lucros. |
| `DRY_RUN` | Modo de teste (`true` ou `false`). | Se for `true`, o robô simula tudo mas **não gasta dinheiro real**. |
| `SLIPPAGE` | Tolerância de preço (ex: `1.0` = 1%). | Evita que você compre por um preço muito mais caro que o planejado. |
| `WINDOW1_MIN/MAX` | Intervalo de minutos (ex: 15 a 29). | O robô sorteia **um minuto aleatório** nesse intervalo a cada hora para operar. |
| `WINDOW2_MIN/MAX` | Intervalo de minutos (ex: 45 a 59). | Garante uma segunda operação em horário diferente, aumentando o sigilo. |

### Estratégias (A e B)
O robô usa duas estratégias simultâneas para decidir quando comprar ou vender:
- **Estratégia A (30m):** Olha o gráfico de 30 minutos. É mais rápida e reage a mudanças curtas.
- **Estratégia B (4h):** Olha o gráfico de 4 horas. É mais lenta e busca tendências de longo prazo.

| Variável | Impacto | Detalhes |
| :--- | :--- | :--- |
| `STRATEGY_X_ENABLED` | Liga ou desliga a estratégia completamente. | |
| `BUY_AMOUNT_X` | Quantidade de **Tokens** (ex: BCOIN/SEN) a comprar. | O robô calcula dinamicamente quanto de Native (POL/BNB) é necessário para obter essa quantia exata de tokens. |
| `SELL_AMOUNT_X` | Quantidade de **Tokens** a vender de cada vez. | Define o tamanho fixo da ordem de venda em unidades do token. |

---

## 🧩 Como o Robô Funciona (Mecanismos)

1. **Sorteio de Horários:** No início de cada hora, o robô escolhe dois minutos secretos (um em cada "Janela"). Isso evita que o mercado ou bots de arbitragem prevejam seus movimentos.
2. **Análise de Média Móvel (MA21):**
   - **Preço ABAIXO da linha:** O robô entende que o preço está "barato" e tenta **COMPRAR**.
   - **Preço ACIMA da linha:** O robô entende que o preço está "caro" e tenta **VENDER** (lucro).
3. **Consolidação de Decisões:** Se uma estratégia manda comprar e a outra manda vender, o robô prioriza a estratégia de tempo maior (4h) para evitar erros.
4. **Gestão de Gás (USDT):** Se o robô detectar que você tem USDT e está ficando sem saldo para taxas (Native), ele vende um pouco de USDT automaticamente para repor seu saldo de POL/BNB.

---

## 🚀 Comandos de Execução

- **Iniciar o Robô:**
  ```bash
  npm start
  ```
- **Criar um Executável (.exe) para Windows:**
  ```bash
  npx pkg .
  ```
  *Isso cria um arquivo `.exe` que você pode rodar em qualquer computador sem precisar instalar o Node.js novamente.*

---
*Desenvolvido para gestão autônoma de ativos em redes descentralizadas. Use com responsabilidade.*
