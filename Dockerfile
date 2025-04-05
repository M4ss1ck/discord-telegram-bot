# Stage 1: Build
FROM node:22-alpine AS builder

# Set up environment variables
WORKDIR /app

# Copy package.json and package-lock.json for dependency installation
COPY package.json package-lock.json ./

# Install dependencies with caching
RUN --mount=type=cache,target=/root/.npm npm ci

# Copy the rest of the application code
COPY . .

# Build the TypeScript code
RUN npm run build

# Stage 2: Runtime
FROM node:22-alpine

# Set up environment variables
WORKDIR /app

# Copy built files and dependencies from the builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/.env ./.env

# Start the application
CMD ["node", "./dist/bot.js"]