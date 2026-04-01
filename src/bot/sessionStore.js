const prisma = require('../config/prisma');

class PrismaSessionStore {
  async get(key) {
    try {
      const session = await prisma.session.findUnique({ where: { key } });
      return session ? JSON.parse(session.data) : undefined;
    } catch (err) {
      return undefined;
    }
  }

  async set(key, data) {
    const dataStr = JSON.stringify(data);
    await prisma.session.upsert({
      where: { key },
      update: { data: dataStr },
      create: { key, data: dataStr }
    });
  }

  async delete(key) {
    await prisma.session.delete({ where: { key } }).catch(() => {});
  }
}

module.exports = new PrismaSessionStore();
