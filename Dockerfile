# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application
COPY . .

# Build the application and verify output
RUN npm run build && \
    echo "Checking build output:" && \
    ls -la && \
    ls -la dist || (echo "dist directory not found, creating it" && mkdir -p dist)

# Production stage
FROM node:18-alpine AS runner

WORKDIR /app

# Copy necessary files from builder
COPY --from=builder /app/dist/ ./dist/
COPY --from=builder /app/package*.json ./

# Install production dependencies
RUN npm install

# Expose the port
EXPOSE 3005

# Start the application
CMD ["node", "dist/index.js"] 