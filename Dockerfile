# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:18-alpine AS runner

WORKDIR /app

# Copy necessary files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

# Install production dependencies
RUN npm install --production

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3005
ENV CLERK_SECRET_KEY=your_clerk_secret
ENV PG_USER=postgres
ENV PG_PASSWORD=postgres
ENV PG_HOST=postgres
ENV PG_PORT=5432
ENV PG_DATABASE=honeyjar

# Expose the port
EXPOSE 3005

# Start the application
CMD ["node", "dist/index.js"] 