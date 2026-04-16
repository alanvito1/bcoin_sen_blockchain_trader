const fs = require('fs');
const path = require('path');
const logger = require('../../utils/logger');

const AUDIT_LOG_PATH = path.join(__dirname, '../../../../logs/aegis_audit.json');

/**
 * Aegis Audit Service
 * Manages the persistent history of all self-healing interventions.
 */
class AegisAudit {
  constructor() {
    this._ensureLogsDir();
  }

  _ensureLogsDir() {
    const dir = path.dirname(AUDIT_LOG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Logs a new intervention event.
   * @param {string} type - 'DETECTION', 'DIAGNOSIS', 'EXECUTION', 'FAILURE'
   * @param {Object} data - Metadata for the event
   */
  async log(type, data) {
    const entry = {
      timestamp: new Date().toISOString(),
      id: data.auditId || Date.now().toString(),
      type,
      ...data
    };

    try {
      fs.appendFileSync(AUDIT_LOG_PATH, JSON.stringify(entry) + '\n');
      logger.info(`📝 [AegisAudit] Event recorded: ${type} - ID: ${entry.id}`);
    } catch (err) {
      logger.error('❌ [AegisAudit] Failed to write audit log:', err);
    }
  }

  /**
   * Reads recent interventions.
   * @param {number} limit - Number of recent entries to return
   */
  getRecent(limit = 10) {
    if (!fs.existsSync(AUDIT_LOG_PATH)) return [];
    
    try {
      const content = fs.readFileSync(AUDIT_LOG_PATH, 'utf8');
      const lines = content.trim().split('\n').filter(l => l.length > 0);
      return lines.slice(-limit).map(l => JSON.parse(l)).reverse();
    } catch (err) {
      logger.error('❌ [AegisAudit] Failed to read audit log:', err);
      return [];
    }
  }
}

const audit = new AegisAudit();
module.exports = audit;
