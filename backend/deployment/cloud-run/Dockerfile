# Use official Node.js runtime as base image
FROM node:20-slim

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy application code
COPY server.js ./

# Set environment to production
ENV NODE_ENV=production

# Expose port (Cloud Run will set PORT env var)
EXPOSE 8080

# Run the application
CMD ["node", "server.js"]
