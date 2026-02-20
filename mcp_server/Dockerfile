# ============================================
# AcademiaOps MCP Server - Dockerfile
# Multi-stage build with Google Distroless
# Ultra-lightweight, secure, production-ready
# ============================================

# ============================================
# Stage 1: Builder - Install dependencies
# ============================================
FROM python:3.10-slim AS builder

# Set working directory
WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .

# Install Python dependencies to /install directory
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir --prefix=/install -r requirements.txt

# ============================================
# Stage 2: Runtime - Google Distroless
# ============================================
FROM gcr.io/distroless/python3-debian12:latest

# Set working directory
WORKDIR /app

# Copy installed packages from builder
COPY --from=builder /install /usr/local

# Copy application code
COPY mcp_server/ ./mcp_server/

# Create logs directory (non-root user in distroless is "nonroot" uid 65532)
USER 65532:65532

# Expose port
EXPOSE 8000

# Environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/usr/local/lib/python3.10/site-packages:/app

# Run FastAPI with uvicorn
# Note: --reload removed for production (not compatible with distroless)
CMD ["/usr/local/bin/uvicorn", "mcp_server.server:app", "--host", "0.0.0.0", "--port", "8000"]
