FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends gh openssh-client ca-certificates && rm -rf /var/lib/apt/lists/*
COPY codespaces-bridge/package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY codespaces-bridge/server.mjs ./
ENV NODE_ENV=production
EXPOSE 3000
USER node
CMD ["node", "server.mjs"]
