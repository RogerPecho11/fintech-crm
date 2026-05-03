FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npx tsc || true
RUN test -f dist/index.js || exit 1

FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --only=production
COPY --from=builder /app/dist ./dist
RUN mkdir -p uploads
EXPOSE 3001
CMD ["node", "dist/index.js"]
