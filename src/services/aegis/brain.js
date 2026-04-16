const { GoogleGenerativeAI } = require("@google/generative-ai");
const logger = require('../../utils/logger');
const hand = require('./hand');
const audit = require('./audit');
const notifier = require('../../bot/notifier');

/**
 * Aegis Brain: The Strategic Consultant
 * Consults Gemini AI to diagnose and solve system failures.
 */
class AegisBrain {
  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    this.model = this.genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
  }

  async consult(logContext) {
    logger.info('🧠 [Aegis] Consulting Gemini Brain for a resolution...');
    
    // Notify admin that analysis is starting
    const auditId = `AEGIS-${Date.now()}`;
    await audit.log('DETECTION', { auditId, message: logContext.message, context: logContext });
    
    await notifier.sendAdminNotification(`🚨 *Aegis: Falha Detectada*\n\nErro: \`${logContext.message}\`\n\n🧠 Iniciando diagnóstico autônomo com Gemini...`);

    const prompt = `
      Você é o Aegis Brain, o sistema de auto-manutenção de um terminal de trading Web3 (BSC/Polygon).
      
      ERRO DETECTADO:
      "${JSON.stringify(logContext)}"
      
      CONTEXTO:
      O sistema utiliza Node.js, ethers.js, Prisma e BullMQ.
      
      SUA TAREFA:
      1. Diagnosticar a causa raiz do erro.
      2. Propor uma solução técnica imediata.
      3. Se a solução for uma mudança de código, forneça no formato de um comando shell (sed) ou instrução para o Aegis Hand.
      4. Se for infraestrutura (RPC), sugira a troca da URL.
      
      RESPOSTA (JSON):
      {
        "analysis": "string curta explicando o erro",
        "severity": "CRITICAL" | "HIGH" | "MEDIUM",
        "action": "REPAIR_CODE" | "RESTART_SERVICE" | "CHANGE_CONFIG" | "NOTHING",
        "targetFile": "caminho_do_arquivo",
        "patchCommand": "comando_shell_para_fix",
        "explanation": "explicação para o admin"
      }
    `;

    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      // Clean up markdown if Gemini returns it
      const jsonStr = text.replace(/```json|```/g, '').trim();
      const plan = JSON.parse(jsonStr);
      
      logger.info(`💡 [Aegis] Diagnosis complete: ${plan.analysis}`);
      
      // Record diagnosis
      await audit.log('DIAGNOSIS', { auditId, analysis: plan.analysis, severity: plan.severity, plan });

      // Execute the plan
      await hand.execute({ ...plan, auditId });
      
    } catch (error) {
      logger.error('❌ [Aegis] Brain failed to process diagnosis:', error);
      await notifier.sendAdminNotification(`⚠️ *Aegis Brain Error:* Falha na análise de IA.\nErro: ${error.message}`);
    }
  }
}

const brain = new AegisBrain();
module.exports = brain;
