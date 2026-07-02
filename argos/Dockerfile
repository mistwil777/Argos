# ============================================
# Argos - Dockerfile
# Lightweight production build
# ============================================

# Use Python 3.11 slim as base (has CA certificates pre-configured)
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install runtime dependencies (minimal)
RUN apt-get update && apt-get install -y \
    --no-install-recommends \
    gcc \
    ca-certificates \
    tesseract-ocr \
    tesseract-ocr-fra \
    libtesseract-dev \
    poppler-utils \
    && update-ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt && \
    pip install --no-cache-dir "crawl4ai==0.3.746" --no-deps && \
    pip install --no-cache-dir "aiosqlite>=0.20" "lxml>=5.3" "cssselect>=1.2" 2>/dev/null || true

# Copy application code
COPY argos/ ./argos/

# Create data directory for LanceDB and caches
RUN mkdir -p /data/lancedb && \
    chmod 777 /data/lancedb

# Create non-root user for security
RUN useradd -m -u 1000 appuser && \
    chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 8000

# Environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"

# Run FastAPI with uvicorn
CMD ["uvicorn", "argos.server:app", "--host", "0.0.0.0", "--port", "8000"]
