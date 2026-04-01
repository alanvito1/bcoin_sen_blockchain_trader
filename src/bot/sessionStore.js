const prisma = require('../config/prisma');

class PrismaSessionStore {
  async get(key) {
    try {
      const session = await prisma.session.findUnique({ where: { key } });
      return session ? JSON.parse(session.data) : undefined;
    } catch (err) {
      console.error(`[SessionStore] GET failed for path ${key}:`, err.message);
      return undefined;
    }
  }

  async set(key, data) {
    try {
      const dataStr = JSON.stringify(data);
      await prisma.session.upsert({
        where: { key },
        update: { data: dataStr },
        create: { key, data: dataStr }
      });
    } catch (err) {
      console.error(`[SessionStore] SET failed for path ${key}:`, err.message);
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
