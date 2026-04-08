const prisma = require('../config/prisma');

class PrismaSessionStore {
  async set(key, data) {
    try {
      // BigInt serialization helper
      const dataStr = JSON.stringify(data, (k, v) => 
        typeof v === 'bigint' ? v.toString() + 'n' : v
      );
      
      await prisma.session.upsert({
        where: { key },
        update: { data: dataStr },
        create: { key, data: dataStr }
      });
    } catch (err) {
      console.error(`[SessionStore] SET failed for path ${key}:`, err.message);
    }
  }

  async get(key) {
    try {
      const session = await prisma.session.findUnique({ where: { key } });
      if (!session) return undefined;

      // BigInt deserialization helper
      return JSON.parse(session.data, (k, v) => {
        if (typeof v === 'string' && /^\d+n$/.test(v)) {
          return BigInt(v.slice(0, -1));
        }
        return v;
      });
    } catch (err) {
      console.error(`[SessionStore] GET failed for path ${key}:`, err.message);
      return undefined;
    }
  }

  async delete(key) {
    try {
      await prisma.session.delete({ where: { key } }).catch(() => {});
    } catch (err) {
      console.error(`[SessionStore] DELETE failed for path ${key}:`, err.message);
    }
  }
}

module.exports = new PrismaSessionStore();
