FROM node:20-trixie-slim AS dependencies

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:20-trixie-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    DATA_DIR=/app/storage/data \
    UPLOADS_DIR=/app/storage/uploads \
    SECURE_COOKIES=0

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN mkdir -p /app/storage/data /app/storage/uploads \
    && chown -R node:node /app

USER node

EXPOSE 3000
VOLUME ["/app/storage"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["npm", "start"]
