#!/bin/bash

set -e

echo "🚀 Starting EvidFlow Production Deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if .env.production exists
if [ ! -f .env.production ]; then
    print_error ".env.production file not found!"
    echo "Creating a template .env.production file..."
    cat > .env.production << 'ENVFILE'
# ==================== ENVIRONMENT ====================
NODE_ENV=production
ENVIRONMENT=production
LOG_LEVEL=INFO

# ==================== DATABASE ====================
DATABASE_URL=postgresql://avnadmin:AVNS_W5hwUrg273IWQquF4J7@pg-19ca8e4a-petergatitu61-111d.e.aivencloud.com:14741/evidflow_db
POSTGRES_DB=evidflow_db
POSTGRES_USER=avnadmin
DB_PASSWORD=AVNS_W5hwUrg273IWQquF4J7

# ==================== SECURITY ====================
SECRET_KEY=325a70a235eb0d2aad61314ff64d9be5efd57f9191da60871c921827c2c131cc
JWT_SECRET=325a70a235eb0d2aad61314ff64d9be5efd57f9191da60871c921827c2c131cc
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=325a70a235eb0d2aad61314ff64d9be5efd57f9191da60871c921827c2c131cc_refresh
JWT_REFRESH_EXPIRES_IN=7d

# ==================== REDIS ====================
REDIS_URL=redis://redis:6379

# ==================== EMAIL ====================
RESEND_API_KEY=re_XhCdy6P7_7poeNWRaBbYwQSx1xRmSHpRD
FROM_EMAIL=nonreply@evidflow.com
FROM_EMAIL_NAME=EvidFlow

# ==================== AI/ML ====================
GROQ_API_KEY=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
GROQ_MODEL=meta-llama/llama-4-maverick-17b-128e-instruct
ENVFILE
    print_warning "Created .env.production template. Please review and update the values."
    exit 1
fi

# Load environment variables safely
echo "📁 Loading environment variables..."
set -a
source .env.production
set +a

print_status "Loaded production environment variables"

# Validate required environment variables
print_status "Validating environment variables..."

required_vars=(
    "DATABASE_URL"
    "SECRET_KEY"
    "JWT_SECRET"
)

missing_vars=()
for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        missing_vars+=("$var")
    fi
done

if [ ${#missing_vars[@]} -ne 0 ]; then
    print_error "Missing required environment variables:"
    for var in "${missing_vars[@]}"; do
        echo "  - $var"
    done
    exit 1
fi

print_status "All required environment variables are set"

# Create necessary directories
print_status "Creating necessary directories..."
mkdir -p logs/nginx
mkdir -p nginx/ssl

# Check if SSL certificates exist (for production)
if [ ! -f "nginx/ssl/cert.pem" ] || [ ! -f "nginx/ssl/key.pem" ]; then
    print_warning "SSL certificates not found in nginx/ssl/"
    echo "For production, you need proper SSL certificates."
    echo "For testing, generating self-signed certificates..."
    
    mkdir -p nginx/ssl
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout nginx/ssl/key.pem \
        -out nginx/ssl/cert.pem \
        -subj "/C=US/ST=State/L=City/O=EvidFlow/CN=localhost" 2>/dev/null
    
    if [ $? -ne 0 ]; then
        print_error "Failed to generate SSL certificates"
        exit 1
    fi
    print_status "Generated self-signed SSL certificates for testing"
fi

# Stop existing services
print_status "Stopping existing services..."
docker-compose -f docker-compose.prod.yml down --remove-orphans || true

# Build services
print_status "Building Docker images..."
docker-compose -f docker-compose.prod.yml build

# Start services
print_status "Starting services..."
docker-compose -f docker-compose.prod.yml up -d

# Wait for services to be ready
print_status "Waiting for services to be ready..."
sleep 30

# Check service health
print_status "Checking service health..."

services=("gateway" "auth-service" "org-service" "postgres" "redis")
healthy_services=()
unhealthy_services=()

for service in "${services[@]}"; do
    if docker-compose -f docker-compose.prod.yml ps "$service" | grep -q "Up"; then
        healthy_services+=("$service")
        print_status "$service is running"
    else
        unhealthy_services+=("$service")
        print_error "$service failed to start"
    fi
done

if [ ${#unhealthy_services[@]} -ne 0 ]; then
    print_error "Some services failed to start: ${unhealthy_services[*]}"
    echo "Checking logs..."
    for service in "${unhealthy_services[@]}"; do
        echo "=== $service logs ==="
        docker-compose -f docker-compose.prod.yml logs "$service" --tail=20
    done
    exit 1
fi

# Wait a bit more for services to be fully ready
print_status "Waiting for services to be fully ready..."
sleep 20

# Test GraphQL endpoint
print_status "Testing GraphQL endpoint..."
curl -f http://localhost:4000/health > /dev/null 2>&1 && {
    print_status "Gateway health check passed"
} || {
    print_error "Gateway health check failed"
    docker-compose -f docker-compose.prod.yml logs gateway --tail=20
    exit 1
}

# Test auth service
print_status "Testing auth service..."
curl -f http://localhost:4001/health > /dev/null 2>&1 && {
    print_status "Auth service health check passed"
} || {
    print_error "Auth service health check failed"
    docker-compose -f docker-compose.prod.yml logs auth-service --tail=20
    exit 1
}

# Test database connection through auth service
print_status "Testing database connection..."
docker-compose -f docker-compose.prod.yml exec auth-service node -e "
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

pool.query('SELECT NOW()')
    .then(() => {
        console.log('Database connection successful');
        process.exit(0);
    })
    .catch(err => {
        console.error('Database connection failed:', err);
        process.exit(1);
    });
" && {
    print_status "Database connection successful"
} || {
    print_error "Database connection failed"
    exit 1
}

print_status "🎉 Production deployment completed successfully!"
echo ""
echo "🌐 Services deployed:"
echo "   - GraphQL Gateway: http://localhost:4000/graphql"
echo "   - GraphQL Playground: http://localhost:4000/graphql"
echo "   - Auth Service: http://localhost:4001/graphql"
echo "   - Organizations Service: http://localhost:4002/graphql"
echo "   - PostgreSQL: localhost:5432"
echo "   - Redis: localhost:6379"
echo ""
echo "📊 Health Checks:"
echo "   - Gateway: http://localhost:4000/health"
echo "   - Auth: http://localhost:4001/health"
echo "   - Organizations: http://localhost:4002/health"
echo ""
echo "🔧 Test GraphQL Query:"
echo "   curl -X POST http://localhost:4000/graphql \\"
echo "     -H \"Content-Type: application/json\" \\"
echo "     -d '{\"query\":\"query { __schema { types { name } } }\"}'"
echo ""
echo "🛑 To stop services: docker-compose -f docker-compose.prod.yml down"
