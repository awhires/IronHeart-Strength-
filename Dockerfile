FROM node:24-alpine AS build
WORKDIR /app
RUN npm install -g pnpm@11.19.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
COPY index.html ./
COPY src ./src
COPY public ./public
COPY server ./server
COPY shared ./shared
RUN node node_modules/vite/bin/vite.js build

FROM node:24-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY server ./server
COPY shared ./shared
COPY package.json ./
RUN mkdir /app/data && chown -R node:node /app
USER node
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4173 DEMO_MODE=false DB_PATH=/app/data/iron-heart.sqlite
EXPOSE 4173
VOLUME ["/app/data"]
CMD ["node", "server/index.mjs", "--production"]
