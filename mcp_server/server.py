"""
OpenWebMCP Server
FastAPI server with JSON-RPC 2.0 protocol implementation
"""

import logging
from typing import Any, Dict, List, Optional
from datetime import datetime

from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, ValidationError

from mcp_server.config import settings
from mcp_server.api import api_router


# ============================================
# Logging setup
# ============================================
logging.basicConfig(
    level=getattr(logging, settings.log_level),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


# ============================================
# FastAPI app
# ============================================
app = FastAPI(
    title="OpenWebMCP Server",
    description="Web browsing infrastructure for AI agents — Model Context Protocol",
    version="1.0.0",
    docs_url="/docs" if settings.environment == "development" else None,
    redoc_url="/redoc" if settings.environment == "development" else None,
)

# ============================================
# CORS Middleware (for frontend development)
# ============================================
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],  # Vite dev servers
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================
# REST API Router
# ============================================
app.include_router(api_router)


# ============================================
# JSON-RPC 2.0 Models
# ============================================

class JSONRPCRequest(BaseModel):
    """JSON-RPC 2.0 Request"""
    jsonrpc: str = Field(default="2.0", description="JSON-RPC version")
    method: str = Field(..., description="Method name to call")
    params: Optional[Dict[str, Any]] = Field(default=None, description="Method parameters")
    id: Optional[str | int] = Field(default=None, description="Request ID")


class JSONRPCError(BaseModel):
    """JSON-RPC 2.0 Error"""
    code: int = Field(..., description="Error code")
    message: str = Field(..., description="Error message")
    data: Optional[Dict[str, Any]] = Field(default=None, description="Additional error data")


class JSONRPCResponse(BaseModel):
    """JSON-RPC 2.0 Response"""
    jsonrpc: str = Field(default="2.0", description="JSON-RPC version")
    result: Optional[Any] = Field(default=None, description="Method result")
    error: Optional[JSONRPCError] = Field(default=None, description="Error object")
    id: Optional[str | int] = Field(default=None, description="Request ID")


# ============================================
# JSON-RPC Error Codes (Standard + Custom)
# ============================================

class ErrorCode:
    """Standard JSON-RPC 2.0 error codes + custom codes"""
    
    # Standard JSON-RPC errors
    PARSE_ERROR = -32700
    INVALID_REQUEST = -32600
    METHOD_NOT_FOUND = -32601
    INVALID_PARAMS = -32602
    INTERNAL_ERROR = -32603
    
    # Custom MCP errors (range: -32000 to -32099)
    TOOL_EXECUTION_ERROR = -32000
    DATABASE_ERROR = -32001
    LLM_ERROR = -32002
    RATE_LIMIT_ERROR = -32003
    AUTHENTICATION_ERROR = -32004


# ============================================
# Tool Registry
# ============================================

class ToolRegistry:
    """
    Registry for MCP tools.
    Tools are Python functions that can be called via JSON-RPC.
    """
    
    def __init__(self):
        self.tools: Dict[str, callable] = {}
        self.tool_metadata: Dict[str, Dict[str, Any]] = {}
    
    def register(
        self, 
        name: str, 
        func: callable,
        description: str = "",
        input_schema: Optional[Dict] = None,
        output_schema: Optional[Dict] = None
    ):
        """
        Register a tool with the MCP server.
        
        Args:
            name: Tool name (used in JSON-RPC method)
            func: Python function to execute
            description: Human-readable description
            input_schema: JSON Schema for input validation
            output_schema: JSON Schema for output structure
        """
        self.tools[name] = func
        self.tool_metadata[name] = {
            "name": name,
            "description": description,
            "input_schema": input_schema or {},
            "output_schema": output_schema or {},
        }
        logger.info(f"Tool registered: {name}")
    
    def get_tool(self, name: str) -> Optional[callable]:
        """Get a tool by name"""
        return self.tools.get(name)
    
    def list_tools(self) -> List[Dict[str, Any]]:
        """List all registered tools with metadata"""
        return list(self.tool_metadata.values())
    
    def has_tool(self, name: str) -> bool:
        """Check if a tool exists"""
        return name in self.tools


# Global tool registry
tool_registry = ToolRegistry()


# ============================================
# Tool Execution
# ============================================

async def execute_tool(method: str, params: Optional[Dict[str, Any]] = None) -> Any:
    """
    Execute a registered tool.
    
    Args:
        method: Tool name
        params: Tool parameters
        
    Returns:
        Tool execution result
        
    Raises:
        ValueError: If tool not found or execution fails
    """
    tool_func = tool_registry.get_tool(method)
    
    if tool_func is None:
        raise ValueError(f"Tool not found: {method}")
    
    try:
        # Execute tool (support both sync and async functions)
        if hasattr(tool_func, "__call__"):
            import inspect
            if inspect.iscoroutinefunction(tool_func):
                result = await tool_func(**(params or {}))
            else:
                result = tool_func(**(params or {}))
        else:
            raise ValueError(f"Tool {method} is not callable")
        
        return result
    
    except ValidationError as e:
        # Pydantic validation error
        raise ValueError(f"Invalid parameters: {str(e)}")
    
    except Exception as e:
        logger.error(f"Tool execution error for {method}: {str(e)}", exc_info=True)
        raise ValueError(f"Tool execution failed: {str(e)}")


# ============================================
# JSON-RPC Endpoints
# ============================================

@app.post("/rpc", response_model=JSONRPCResponse)
async def rpc_endpoint(request: Request):
    """
    Main JSON-RPC 2.0 endpoint.
    Accepts tool calls and returns results or errors.
    """
    try:
        # Parse request body
        body = await request.json()
        
        # Validate JSON-RPC request
        try:
            rpc_request = JSONRPCRequest(**body)
        except ValidationError as e:
            return JSONRPCResponse(
                error=JSONRPCError(
                    code=ErrorCode.INVALID_REQUEST,
                    message="Invalid JSON-RPC request",
                    data={"validation_errors": e.errors()}
                ),
                id=body.get("id")
            )
        
        # Handle method call
        method = rpc_request.method
        
        # Special methods
        if method == "tools.list":
            # List all available tools
            result = tool_registry.list_tools()
            return JSONRPCResponse(result=result, id=rpc_request.id)
        
        elif method == "server.info":
            result = {
                "name": "OpenWebMCP Server",
                "version": "1.0.0",
                "environment": settings.environment,
                "tools_count": len(tool_registry.tools),
                "timestamp": datetime.utcnow().isoformat()
            }
            return JSONRPCResponse(result=result, id=rpc_request.id)
        
        # Regular tool execution
        elif tool_registry.has_tool(method):
            try:
                result = await execute_tool(method, rpc_request.params)
                return JSONRPCResponse(result=result, id=rpc_request.id)
            
            except ValueError as e:
                return JSONRPCResponse(
                    error=JSONRPCError(
                        code=ErrorCode.INVALID_PARAMS,
                        message=str(e)
                    ),
                    id=rpc_request.id
                )
            
            except Exception as e:
                logger.error(f"Internal error executing {method}: {str(e)}", exc_info=True)
                return JSONRPCResponse(
                    error=JSONRPCError(
                        code=ErrorCode.INTERNAL_ERROR,
                        message="Internal server error",
                        data={"detail": str(e)}
                    ),
                    id=rpc_request.id
                )
        
        else:
            # Method not found
            return JSONRPCResponse(
                error=JSONRPCError(
                    code=ErrorCode.METHOD_NOT_FOUND,
                    message=f"Method not found: {method}",
                    data={"available_methods": list(tool_registry.tools.keys())}
                ),
                id=rpc_request.id
            )
    
    except Exception as e:
        # Parse error or unexpected error
        logger.error(f"RPC endpoint error: {str(e)}", exc_info=True)
        return JSONRPCResponse(
            error=JSONRPCError(
                code=ErrorCode.PARSE_ERROR,
                message="Parse error",
                data={"detail": str(e)}
            )
        )


@app.get("/health")
async def health_check():
    """
    Health check endpoint for monitoring.
    Checks database connectivity and Playwright availability.
    """
    from mcp_server.api.router import db as api_db

    # Database check
    database_status = "error"
    try:
        with api_db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
                cur.fetchone()
        database_status = "ok"
    except Exception:
        pass

    # Playwright check
    playwright_status = "error"
    try:
        from playwright.async_api import async_playwright  # noqa: F401
        playwright_status = "ok"
    except ImportError:
        playwright_status = "not_installed"

    return {
        "status": "ok",
        "timestamp": datetime.utcnow().isoformat(),
        "version": "1.0.0",
        "environment": settings.environment,
        "tools_registered": len(tool_registry.tools),
        "database": database_status,
        "playwright": playwright_status,
    }


@app.get("/")
async def root():
    return {
        "service": "OpenWebMCP Server",
        "version": "1.0.0",
        "docs": "/docs" if settings.environment == "development" else None,
        "health": "/health",
        "rpc_endpoint": "/rpc"
    }


# ============================================
# Startup Event - Register Tools
# ============================================

@app.on_event("startup")
async def startup_event():
    """Register all MCP tools at startup."""
    logger.info("Starting OpenWebMCP Server...")

    # ---- Test ----
    from mcp_server.tools.hello import hello_world
    tool_registry.register("hello.world", hello_world, "Health check tool")

    # ---- Collector ----
    from mcp_server.tools.collector import (
        fetch_rss, fetch_apis, fetch_all, get_collection_stats, list_sources
    )
    tool_registry.register("collector.fetch_rss", fetch_rss, "Fetch RSS feeds")
    tool_registry.register("collector.fetch_apis", fetch_apis, "Fetch GitHub/ArXiv APIs")
    tool_registry.register("collector.fetch_all", fetch_all, "Fetch all sources")
    tool_registry.register("collector.get_stats", get_collection_stats, "Collection stats")
    tool_registry.register("collector.list_sources", list_sources, "List configured sources")

    # ---- Classifier ----
    from mcp_server.tools.classifier import (
        classify_item, classify_batch, get_classification_stats, get_unclassified_items
    )
    tool_registry.register("classifier.classify", classify_item, "Classify a single item with LLM")
    tool_registry.register("classifier.classify_batch", classify_batch, "Classify items in batch")
    tool_registry.register("classifier.stats", get_classification_stats, "Classification stats")
    tool_registry.register("classifier.get_unclassified", get_unclassified_items, "Get pending items")

    # ---- RAG ----
    from mcp_server.tools.rag_tools import (
        ask_question, search_content,
        index_item as rag_index_item,
        rebuild_index, get_index_stats
    )
    tool_registry.register(
        "rag.ask", ask_question,
        "Q&A on indexed content (hybrid semantic+lexical search)",
        input_schema={"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]}
    )
    tool_registry.register("rag.search", search_content, "Search indexed content")
    tool_registry.register("rag.index_item", rag_index_item, "Index an item into RAG")
    tool_registry.register("rag.rebuild_index", rebuild_index, "Rebuild full RAG index")
    tool_registry.register("rag.stats", get_index_stats, "RAG index statistics")

    # ---- Web Tools (new) ----
    from mcp_server.tools.web_tools import WEB_TOOLS
    from mcp_server.api.router import db as api_db
    try:
        from mcp_server.services.llm_provider import create_llm_provider
        llm = create_llm_provider(
            provider_type=settings.llm_provider,
            openai_api_key=settings.openai_api_key,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
            aws_region=settings.aws_region,
            model=settings.aws_bedrock_model if settings.llm_provider == "aws" else settings.default_classification_model
        )
    except Exception:
        llm = None

    import functools

    def _make_web_tool_wrapper(tool_func, _db, _llm):
        """Wrap web tools (signature: func(params:dict, db, llm_provider))
        into the MCP execute_tool interface (func(**kwargs))."""
        async def wrapper(**kwargs):
            return await tool_func(params=kwargs, db=_db, llm_provider=_llm)
        return wrapper

    for name, func in WEB_TOOLS.items():
        wrapper = _make_web_tool_wrapper(func, api_db, llm)
        tool_registry.register(name, wrapper, f"Web tool: {name}")

    logger.info(f"Registered {len(tool_registry.tools)} tools")

    # ---- Site Monitor Scheduler ----
    try:
        from mcp_server.services.site_monitor import init_site_monitor
        monitor = init_site_monitor(db_manager=api_db, dashboard_url="http://localhost:3000")
        await monitor.start_scheduler(poll_interval_seconds=60)
        logger.info("Site monitor scheduler started")
    except Exception as exc:
        logger.warning(f"Site monitor not started: {exc}")

    logger.info("OpenWebMCP Server ready!")


@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Shutting down OpenWebMCP Server...")

    # Arrêter le scheduler de surveillance
    try:
        from mcp_server.services.site_monitor import get_site_monitor
        monitor = get_site_monitor()
        if monitor:
            monitor.stop_scheduler()
            logger.info("Site monitor scheduler arrêté")
    except Exception:
        pass

