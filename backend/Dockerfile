FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npx prisma generate
RUN npx tsc
EXPOSE 5000
CMD ["node", "dist/server.js"]
