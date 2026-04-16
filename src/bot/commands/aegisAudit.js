const { Markup } = require('telegraf');
const audit = require('../../services/aegis/audit');

const ADMIN_ID = process.env.ADMIN_TELEGRAM_ID;

/**
 * Handler for the /aegis_audit command.
 * Provides a human-readable summary of recent self-healing actions.
 */
async function aegisAuditHandler(ctx) {
  if (ctx.from.id.toString() !== ADMIN_ID?.toString()) return;

  try {
    const recentEvents = audit.getRecent(20); // Capture more events to group them better

    if (recentEvents.length === 0) {
      return ctx.reply('🔍 <b>Aegis Audit:</b> Nenhuma intervenção registrada até o momento.', { parse_mode: 'HTML' });
    }

    // Grouping by Audit ID (Detection -> Diagnosis -> Execution)
    const groups = {};
    recentEvents.forEach(event => {
      if (!groups[event.id]) groups[event.id] = { id: event.id, events: [] };
      groups[event.id].events.push(event);
    });

    let text = `📂 <b>AEGIS: HISTÓRICO DE INTERVENÇÕES</b>\n\n`;
    
    const sortedGroups = Object.values(groups).sort((a, b) => {
      const bTime = new Date(b.events[0].timestamp).getTime();
      const aTime = new Date(a.events[0].timestamp).getTime();
      return bTime - aTime;
    });

    sortedGroups.slice(0, 5).forEach(group => {
      const detection = group.events.find(e => e.type === 'DETECTION');
      const diagnosis = group.events.find(e => e.type === 'DIAGNOSIS');
      const execution = group.events.find(e => e.type === 'EXECUTION' || e.type === 'FAILURE');
      
      const time = detection ? new Date(detection.timestamp).toLocaleTimeString('pt-BR') : '??:??';
      const statusIcon = execution?.status === 'SUCCESS' ? '🟢' : (execution?.status === 'FAILED' ? '🔴' : '🟡');
      
      text += `${statusIcon} <b>Intervenção [${time}]</b>\n`;
      text += `└ <b>Problema:</b> ${detection?.message || 'Erro desconhecido'}\n`;
      
      if (diagnosis) {
        text += `└ <b>Ação:</b> ${diagnosis.analysis}\n`;
      }
      
      if (execution) {
        text += `└ <b>Resultado:</b> ${execution.status === 'SUCCESS' ? 'Reparo Aplicado' : 'Falha no Reparo'}\n`;
      }
      
      text += `\n`;
    });

    text += `💡 <i>Logs detalhados preservados em logs/aegis_audit.json para auditoria técnica.</i>`;

    return ctx.replyWithHTML(text, Markup.inlineKeyboard([
      [Markup.button.callback('🔄 Atualizar', 'admin_status')],
      [Markup.button.callback('🔙 Voltar ao Admin', 'admin_panel')]
    ]));

  } catch (error) {
    console.error('[AegisAudit] Error:', error);
    return ctx.reply('❌ Erro ao buscar histórico do Aegis.');
  }
}

module.exports = aegisAuditHandler;
