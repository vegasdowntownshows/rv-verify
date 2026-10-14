FROM node:20-alpine

WORKDIR /app

# Install build tools for native SQLite bindings if required
RUN apk add --no-cache python3 make g++

COPY package*.json ./

RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["node", "src/index.js"]
