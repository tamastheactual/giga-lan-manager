# ---- build stage: full dependency tree, compiles client and server ----
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
# `npm ci` installs exactly what package-lock.json pins, so an image build can
# never drift from a tested dependency set the way `npm install` can.
RUN npm ci

COPY . .
RUN npm run build          # client -> dist/
RUN npm run build:server   # server -> dist-server/

# ---- runtime stage: production dependencies only ----
FROM node:22-alpine

# Conventional for a runtime image: libraries that branch on it take their
# production path, and it matches the --omit=dev install below. (It is not what
# strips dev behaviour from the API -- Hono has no dev/prod mode of its own.)
ENV NODE_ENV=production

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
# tsc emits with rootDir "." so server code lands under dist-server/server and
# the shared modules under dist-server/shared; copy both, preserving that layout.
COPY --from=builder /app/dist-server ./

EXPOSE 3000

CMD ["node", "server/index.js"]
