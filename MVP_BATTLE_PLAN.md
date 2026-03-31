# 📑 Plano de Batalha: MVP Escalonável (Blockchain Auto-Trader)

Este documento detalha a estratégia de arquitetura e o fluxo de DevOps aprovado para a migração do ambiente local para a produção em massa.

---

## 🏗️ 1. Arquitetura da Infraestrutura (Nuvem Híbrida)

Para garantir que o sistema aguente até **10.000 usuários** com o menor custo inicial possível, utilizaremos serviços gerenciados para o que é crítico e VPS para o processamento.

### 🗄️ Banco de Dados: Supabase (PostgreSQL Gerenciado)
*   **Por que:** Segurança total dos dados. Se a VPS falhar, os saldos e usuários estão salvos na nuvem do Supabase.
*   **Ação:** Migração via Dump (.sql) do computador local diretamente para a instância do Supabase.
*   **Escala:** Começa no plano gratuito/Pro e escala conforme o volume de conexões.

### ⚡ Fila & Cache: Upstash (Redis Serverless)
*   **Por que:** O sistema usa *Redis + BullMQ* para gerenciar os trades. O Upstash permite que o Redis rode "sem servidor", você não paga pela máquina, apenas pelo uso.
*   **Ação:** Conectar o `REDIS_URL` da aplicação ao endpoint do Upstash.

### 🧠 O "Cérebro": VPS Econômica (Hostinger / Contabo)
*   **Configuração Inicial:** 2 vCPUs e 4GB de RAM.
*   **Função:** Rodar apenas o código Node.js (Docker) do Bot e dos Workers. 
*   **Eficiência:** Como tiramos o Banco e o Redis da máquina, 100% da RAM e CPU da VPS ficam livres para processar os trades e responder o Telegram de forma instantânea.

---

## 🌳 2. Estratégia de DevOps: Git & Branches

Para garantir que o que funciona no teste funcione na produção, adotaremos o modelo **GitFlow Simplificado**.

### Estrutura de Branches:
1.  **`main` (Produção/Live):** 
    *   Sempre contém o código estável que está rodando no servidor. 
    *   **Nunca** altere código diretamente aqui.
2.  **`develop` (Local/Testes):** 
    *   Branch onde os testes reais de hoje e novas funções são feitos.
    *   É o espelho do que será a próxima versão live.

### Fluxo de Trabalho (Melhores Práticas):
*   **Paridade Total:** Todo recurso adicionado em `develop` deve ser testado localmente com o banco de dados local antes de subir.
*   **Promoção de Código:** Após os testes locais terminarem com sucesso, fazemos um `Merge` (Mesclagem) da `develop` para a `main`.
*   **Deploy Contínuo:** No futuro, podemos configurar para que cada vez que a `main` receba código, a VPS se atualize sozinha (CI/CD).

---

## 🛠️ 3. Checklist de Migração (Caminho Real)

Quando os testes locais terminarem, seguiremos estes passos:

1.  **Freeze:** Pausar o bot local.
2.  **Export:** Gerar o `backup_local.sql`.
3.  **Import:** Subir o banco para o Supabase.
4.  **Connect:** Atualizar o arquivo `.env` da branch `main` com as URLs do Supabase e Upstash.
5.  **Build:** Rodar o Docker na VPS puxando a branch `main`.
6.  **Verify:** Validar no Telegram se o bot está respondendo e as comissões estão caindo.

---
*Documento criado em 31/03/2026 para guiar a fase de escala do projeto.*
