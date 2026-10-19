FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends gh openssh-client git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY codespaces-bridge/package.json /app/package.json
COPY codespaces-bridge/server.mjs /app/server.mjs
ENV NODE_ENV=production
ENV PORT=10000
ENV ENABLE_REMOTE_EXEC=false
USER node
EXPOSE 10000
CMD ["node","server.mjs"]
