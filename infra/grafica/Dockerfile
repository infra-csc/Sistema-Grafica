FROM node:24.15.0-bookworm-slim
WORKDIR /app
# O bundle atual importa Vite estaticamente; manter devDependencies nesta
# primeira imagem até separar o módulo de desenvolvimento do servidor.
COPY package.json package-lock.json ./
RUN npm ci --include=dev --no-audit --no-fund && npm cache clean --force
COPY dist ./dist
COPY migrations ./migrations
COPY scripts/migrar.mjs ./scripts/migrar.mjs
COPY global-quota-rules.json ./global-quota-rules.json
ENV NODE_ENV=production PORT=5000
USER node
EXPOSE 5000
CMD ["node", "dist/index.js"]
