FROM node:22-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy application code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Expose port (if needed for API, although bot is long-polling)
EXPOSE 3000

# default command (to be overriden in docker-compose for specific services)
CMD ["node", "index.js"]
