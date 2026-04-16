const fs = require('fs');
const path = require('path');
const logger = require('../../utils/logger');
const brain = require('./brain');

/**
 * Aegis Eye: The Vigilant Observer
 * Monitors logs for errors and critical system failures.
 */
class AegisEye {
  constructor() {
    this.errorLogPath = path.join(__dirname, '../../../logs/error.log');
    this.combinedLogPath = path.join(__dirname, '../../../logs/combined.log');
    this.isWatching = false;
  }

  async start() {
    if (this.isWatching) return;
    
    logger.info('🛡️ [Aegis] Eye initialized. Monitoring system logs...');
    
    // Polling mode: Active reading every 3s (more reliable in Docker)
    let lastSize = 0; // Force retroactive processing of existing error logs
    
    setInterval(async () => {
      try {
        const stats = fs.statSync(this.errorLogPath);
        if (stats.size > lastSize) {
          await this.processNewLogs(this.errorLogPath, lastSize);
          lastSize = stats.size;
        }
      } catch (err) {
        // Silently skip if file is temporarily locked or missing
      }
    }, 3000);

    this.isWatching = true;
  }

  async processNewLogs(filePath, startPos) {
    try {
      const stream = fs.createReadStream(filePath, { start: startPos });
      let content = '';

      for await (const chunk of stream) {
        content += chunk;
      }

      const lines = content.split('\n').filter(l => l.trim().length > 0);
      
      for (const line of lines) {
        try {
          const logData = JSON.parse(line);
          await this.analyzeLog(logData);
        } catch (e) {
          // Fallback if not JSON
          if (line.toLowerCase().includes('error') || line.toLowerCase().includes('fail')) {
            await this.analyzeLog({ message: line, level: 'error' });
          }
        }
      }
    } catch (error) {
      logger.error('❌ [Aegis] Error processing new logs:', error);
    }
  }

  async analyzeLog(log) {
    // Filter out common warnings or non-critical errors
    const ignoreList = ['DATABASE_URL does not specify connection_limit'];
    if (ignoreList.some(msg => log.message?.includes(msg))) return;

    // Infrastructure priority patterns
    const infraErrors = ['EAI_AGAIN', 'ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED'];
    if (infraErrors.some(err => log.message?.includes(err))) {
      log.level = 'error';
      log.isInfra = true;
    }

    if (log.level === 'error' || log.stack) {
      logger.info(`🚨 [Aegis] Critical event detected: ${log.message}`);
      
      // Consult the Brain (Gemini)
      await brain.consult(log);
    }
  }
}

const eye = new AegisEye();
module.exports = eye;
