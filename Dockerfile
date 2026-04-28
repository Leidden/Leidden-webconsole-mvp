# Dev mode (hot reload). Production Dockerfile will be added later.
FROM node:20-alpine

# Prisma needs openssl + libc6-compat on Alpine, otherwise the engine
# fails with "Could not parse schema engine response" (OpenSSL 3.x detection).
RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

# Copy manifest + Prisma schema first so that npm install's postinstall
# (`prisma generate`) can find prisma/schema.prisma.
COPY package.json package-lock.json* ./
COPY prisma ./prisma

RUN npm install

# Copy app source (volume-mounted in compose for hot reload)
COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
