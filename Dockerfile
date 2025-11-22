FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build
# Build server
RUN npx tsc -p tsconfig.server.json

FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-server ./server

EXPOSE 3000

CMD ["node", "server/index.js"]
