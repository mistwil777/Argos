"""
AcademiaOps MCP Server
FastAPI server with JSON-RPC 2.0 protocol implementation
"""

import logging
from typing import Any, Dict, List, Optional
from datetime import datetime

from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, ValidationError

from mcp_server.config import settings


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
    title="AcademiaOps MCP Server",
    description="Model Context Protocol server for AcademiaOps AI platform",
    version="0.1.0",
    docs_url="/docs" if settings.environment == "development" else None,
    redoc_url="/redoc" if settings.environment == "development" else None,
)


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
            # Server information
            result = {
                "name": "AcademiaOps MCP Server",
                "version": "0.1.0",
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
    Used by Docker healthcheck and load balancers.
    """
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "version": "0.1.0",
        "environment": settings.environment,
        "tools_registered": len(tool_registry.tools)
    }


@app.get("/")
async def root():
    """
    Root endpoint - redirect to docs in development.
    """
    return {
        "service": "AcademiaOps MCP Server",
        "version": "0.1.0",
        "docs": "/docs" if settings.environment == "development" else "Documentation not available in production",
        "health": "/health",
        "rpc_endpoint": "/rpc"
    }


# ============================================
# Startup Event - Register Tools
# ============================================

@app.on_event("startup")
async def startup_event():
    """
    Application startup: register all tools.
    """
    logger.info("Starting AcademiaOps MCP Server...")
    logger.info(f"Environment: {settings.environment}")
    logger.info(f"Log level: {settings.log_level}")
    
    # ============================================
    # Test Tools
    # ============================================
    from mcp_server.tools.hello import hello_world
    
    tool_registry.register(
        name="hello.world",
        func=hello_world,
        description="Simple hello world tool for testing",
        input_schema={
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Name to greet"}
            }
        },
        output_schema={
            "type": "object",
            "properties": {
                "message": {"type": "string"},
                "timestamp": {"type": "string"}
            }
        }
    )
    
    # ============================================
    # Classifier Tools
    # ============================================
    from mcp_server.tools.classifier import (
        classify_item,
        classify_batch,
        get_classification_stats,
        get_unclassified_items
    )
    
    tool_registry.register(
        name="classifier.classify",
        func=classify_item,
        description="Classify a single tech watch item using LLM (extracts topics, importance, type)",
        input_schema={
            "type": "object",
            "properties": {
                "item_id": {
                    "type": "integer",
                    "description": "ID of the item to classify"
                }
            },
            "required": ["item_id"]
        },
        output_schema={
            "type": "object",
            "properties": {
                "item_id": {"type": "integer"},
                "topics": {"type": "array", "items": {"type": "string"}},
                "importance": {"type": "string", "enum": ["critical", "high", "medium", "low"]},
                "item_type": {"type": "string", "enum": ["innovation", "tutorial", "research", "news", "opinion"]},
                "reasoning": {"type": "string"},
                "model": {"type": "string"},
                "tokens_used": {"type": "integer"},
                "cost_usd": {"type": "number"},
                "latency_ms": {"type": "integer"}
            }
        }
    )
    
    tool_registry.register(
        name="classifier.classify_batch",
        func=classify_batch,
        description="Classify multiple unclassified items in batch",
        input_schema={
            "type": "object",
            "properties": {
                "item_ids": {
                    "type": "array",
                    "items": {"type": "integer"},
                    "description": "Specific item IDs to classify (optional)"
                },
                "limit": {
                    "type": "integer",
                    "description": "If item_ids not provided, process up to this many items (default: 10)",
                    "default": 10
                }
            }
        },
        output_schema={
            "type": "object",
            "properties": {
                "processed": {"type": "integer"},
                "successful": {"type": "integer"},
                "failed": {"type": "integer"},
                "total_cost_usd": {"type": "number"},
                "total_tokens": {"type": "integer"},
                "results": {"type": "array"}
            }
        }
    )
    
    tool_registry.register(
        name="classifier.stats",
        func=get_classification_stats,
        description="Get classification statistics and progress",
        input_schema={"type": "object", "properties": {}},
        output_schema={
            "type": "object",
            "properties": {
                "items_by_status": {"type": "object"},
                "total_cost_usd": {"type": "number"},
                "total_tokens": {"type": "integer"},
                "top_topics": {"type": "array"}
            }
        }
    )
    
    tool_registry.register(
        name="classifier.get_unclassified",
        func=get_unclassified_items,
        description="Get list of items pending classification",
        input_schema={
            "type": "object",
            "properties": {
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of items to return (default: 20)",
                    "default": 20
                }
            }
        },
        output_schema={
            "type": "object",
            "properties": {
                "count": {"type": "integer"},
                "items": {"type": "array"}
            }
        }
    )
    
    logger.info(f"Registered {len(tool_registry.tools)} tools")
    logger.info("MCP Server ready!")


@app.on_event("shutdown")
async def shutdown_event():
    """
    Application shutdown: cleanup.
    """
    logger.info("Shutting down AcademiaOps MCP Server...")
