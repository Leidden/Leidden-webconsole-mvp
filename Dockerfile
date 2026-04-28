# Dev mode (hot reload). Production Dockerfile will be added later.
FROM node:20-alpine

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json package-lock.json* ./
RUN npm install

# Copy app source (volume-mounted in compose for hot reload)
COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
