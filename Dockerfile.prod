# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./
COPY drizzle.config.ts ./

# Install dependencies
RUN npm install

# Copy source code
COPY src ./src
COPY migrations ./migrations
COPY scripts ./scripts

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm install --omit=dev

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/scripts ./scripts

# Copy environment files if they exist, fallback to example if they don't
COPY .env* ./
RUN if [ ! -f .env ]; then \
      if [ -f .env.example ]; then \
        cp .env.example .env; \
      fi \
    fi

# Expose the port the app runs on
EXPOSE 3005

# Start the server
CMD ["npm", "start"] 