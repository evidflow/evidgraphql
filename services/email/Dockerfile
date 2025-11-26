FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Install resend for email sending
RUN npm install resend

# Copy source code
COPY src/ ./src/

# Expose port
EXPOSE 8010

# Start the service
CMD ["npm", "start"]
