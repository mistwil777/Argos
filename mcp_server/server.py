"""
AcademiaOps MCP Server
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
    title="AcademiaOps MCP Server",
    description="Model Context Protocol server for AcademiaOps AI platform",
    version="0.1.0",
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
    # Warm up VectorStoreService (DISABLED - CDN HuggingFace inaccessible)
    # Network issue: cdn-lfs-us-1.huggingface.co unreachable from container
    # Model download fails, blocking warmup. Re-enable when network issue resolved.
    # ============================================
    # import asyncio
    # from mcp_server.services.vector_store_singleton import warmup_vector_store
    # asyncio.create_task(warmup_vector_store())
    
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
    # Collector Tools
    # ============================================
    from mcp_server.tools.collector import (
        fetch_rss,
        fetch_apis,
        fetch_all,
        get_collection_stats,
        list_sources
    )
    
    tool_registry.register(
        name="collector.fetch_rss",
        func=fetch_rss,
        description="Fetch items from RSS feeds (all or specific feed)",
        input_schema={
            "type": "object",
            "properties": {
                "feed_name": {
                    "type": "string",
                    "description": "Optional specific feed name. If not provided, fetches all."
                }
            }
        },
        output_schema={
            "type": "object",
            "properties": {
                "success": {"type": "boolean"},
                "fetched": {"type": "integer"},
                "inserted": {"type": "integer"},
                "duplicates": {"type": "integer"},
                "errors": {"type": "integer"},
                "message": {"type": "string"}
            }
        }
    )
    
    tool_registry.register(
        name="collector.fetch_apis",
        func=fetch_apis,
        description="Fetch items from API sources (GitHub, ArXiv)",
        input_schema={
            "type": "object",
            "properties": {
                "api_name": {
                    "type": "string",
                    "description": "Optional specific API name. If not provided, fetches all."
                }
            }
        },
        output_schema={
            "type": "object",
            "properties": {
                "success": {"type": "boolean"},
                "fetched": {"type": "integer"},
                "inserted": {"type": "integer"},
                "duplicates": {"type": "integer"},
                "errors": {"type": "integer"},
                "message": {"type": "string"}
            }
        }
    )
    
    tool_registry.register(
        name="collector.fetch_all",
        func=fetch_all,
        description="Fetch items from all enabled sources (RSS + APIs)",
        input_schema={"type": "object", "properties": {}},
        output_schema={
            "type": "object",
            "properties": {
                "success": {"type": "boolean"},
                "fetched": {"type": "integer"},
                "inserted": {"type": "integer"},
                "duplicates": {"type": "integer"},
                "errors": {"type": "integer"},
                "message": {"type": "string"}
            }
        }
    )
    
    tool_registry.register(
        name="collector.get_stats",
        func=get_collection_stats,
        description="Get statistics about data collection",
        input_schema={"type": "object", "properties": {}},
        output_schema={
            "type": "object",
            "properties": {
                "success": {"type": "boolean"},
                "stats": {"type": "object"}
            }
        }
    )
    
    tool_registry.register(
        name="collector.list_sources",
        func=list_sources,
        description="List all configured sources (RSS feeds, APIs)",
        input_schema={"type": "object", "properties": {}},
        output_schema={
            "type": "object",
            "properties": {
                "success": {"type": "boolean"},
                "sources": {"type": "object"},
                "total_sources": {"type": "integer"}
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
    
    # ============================================
    # Course Generator Tools
    # ============================================
    from mcp_server.tools.course_generator import (
        generate_course,
        score_course_quality,
        list_available_topics,
        get_course,
        update_course_status,
        list_courses
    )
    
    tool_registry.register(
        name="course.generate",
        func=generate_course,
        description="Generate an educational course for a specific topic using LLM",
        input_schema={
            "type": "object",
            "properties": {
                "topic": {
                    "type": "string",
                    "description": "Topic name (e.g., 'Agents', 'RAG', 'LLM')"
                },
                "level": {
                    "type": "string",
                    "description": "Course level",
                    "enum": ["beginner", "intermediate", "advanced"],
                    "default": "intermediate"
                },
                "max_items": {
                    "type": "integer",
                    "description": "Maximum number of source items to use",
                    "default": 5
                },
                "min_importance": {
                    "type": "string",
                    "description": "Minimum importance level",
                    "enum": ["low", "medium", "high", "critical"],
                    "default": "medium"
                }
            },
            "required": ["topic"]
        },
        output_schema={
            "type": "object",
            "properties": {
                "course_id": {"type": "integer"},
                "status": {"type": "string"},
                "title": {"type": "string"},
                "level": {"type": "string"},
                "topic": {"type": "string"},
                "source_items_count": {"type": "integer"},
                "estimated_duration_minutes": {"type": "integer"},
                "model": {"type": "string"},
                "tokens_used": {"type": "integer"},
                "cost_usd": {"type": "number"},
                "latency_ms": {"type": "integer"}
            }
        }
    )
    
    tool_registry.register(
        name="course.score_quality",
        func=score_course_quality,
        description="Evaluate and score course quality using LLM",
        input_schema={
            "type": "object",
            "properties": {
                "course_id": {
                    "type": "integer",
                    "description": "Course identifier"
                }
            },
            "required": ["course_id"]
        },
        output_schema={
            "type": "object",
            "properties": {
                "course_id": {"type": "integer"},
                "qa_score": {"type": "number"},
                "issues": {"type": "array"},
                "strengths": {"type": "array"},
                "recommendations": {"type": "array"},
                "tokens_used": {"type": "integer"},
                "cost_usd": {"type": "number"},
                "latency_ms": {"type": "integer"}
            }
        }
    )
    
    tool_registry.register(
        name="course.list_topics",
        func=list_available_topics,
        description="List topics available for course generation",
        input_schema={
            "type": "object",
            "properties": {
                "min_items": {
                    "type": "integer",
                    "description": "Minimum number of classified items required",
                    "default": 3
                }
            }
        },
        output_schema={
            "type": "object",
            "properties": {
                "topics": {"type": "array"},
                "count": {"type": "integer"}
            }
        }
    )
    
    tool_registry.register(
        name="course.get",
        func=get_course,
        description="Retrieve a course by ID",
        input_schema={
            "type": "object",
            "properties": {
                "course_id": {
                    "type": "integer",
                    "description": "Course identifier"
                }
            },
            "required": ["course_id"]
        },
        output_schema={
            "type": "object",
            "properties": {
                "id": {"type": "integer"},
                "title": {"type": "string"},
                "subject": {"type": "string"},
                "level": {"type": "string"},
                "content": {"type": "string"},
                "learning_objectives": {"type": "array"},
                "prerequisites": {"type": "array"},
                "estimated_duration_minutes": {"type": "integer"},
                "qa_score": {"type": "number"},
                "status": {"type": "string"}
            }
        }
    )
    
    tool_registry.register(
        name="course.update_status",
        func=update_course_status,
        description="Update course publication status",
        input_schema={
            "type": "object",
            "properties": {
                "course_id": {
                    "type": "integer",
                    "description": "Course identifier"
                },
                "status": {
                    "type": "string",
                    "description": "New status",
                    "enum": ["draft", "review", "published", "archived"]
                }
            },
            "required": ["course_id", "status"]
        },
        output_schema={
            "type": "object",
            "properties": {
                "course_id": {"type": "integer"},
                "status": {"type": "string"},
                "updated_at": {"type": "string"}
            }
        }
    )
    
    tool_registry.register(
        name="course.list",
        func=list_courses,
        description="List courses with optional filtering",
        input_schema={
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "description": "Filter by status (optional)"
                },
                "level": {
                    "type": "string",
                    "description": "Filter by level (optional)"
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of courses (default: 10)",
                    "default": 10
                }
            }
        },
        output_schema={
            "type": "object",
            "properties": {
                "courses": {"type": "array"},
                "count": {"type": "integer"}
            }
        }
    )
    
    # ============================================
    # RAG Tools
    # ============================================
    from mcp_server.tools.rag_tools import (
        ask_question,
        search_content,
        index_course as rag_index_course,
        index_item as rag_index_item,
        rebuild_index,
        get_index_stats
    )
    
    tool_registry.register(
        name="rag.ask",
        func=ask_question,
        description="Ask a question and get an AI-generated answer based on indexed courses and items. Uses hybrid search (semantic + lexical) for better relevance.",
        input_schema={
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The question to ask (in French or English)"
                },
                "filter_source_type": {
                    "type": "string",
                    "enum": ["course", "item"],
                    "description": "Optional: filter sources by type"
                },
                "user_identifier": {
                    "type": "string",
                    "description": "Optional: user identifier for logging (default: anonymous)"
                },
                "use_hybrid_search": {
                    "type": "boolean",
                    "description": "Use hybrid search (semantic+lexical, default: true)",
                    "default": True
                }
            },
            "required": ["query"]
        },
        output_schema={
            "type": "object",
            "properties": {
                "success": {"type": "boolean"},
                "query": {"type": "string"},
                "answer": {"type": "string"},
                "sources": {"type": "array"},
                "confidence_score": {"type": "number"},
                "model": {"type": "string"},
                "tokens_used": {"type": "integer"},
                "cost_usd": {"type": "number"},
                "latency_ms": {"type": "integer"}
            }
        }
    )
    
    tool_registry.register(
        name="rag.search",
        func=search_content,
        description="Perform search across indexed content without generating an answer. Uses hybrid search (semantic + lexical) for better relevance.",
        input_schema={
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search query"
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of results (default: 10)",
                    "minimum": 1,
                    "maximum": 50
                },
                "filter_source_type": {
                    "type": "string",
                    "enum": ["course", "item"],
                    "description": "Optional: filter by source type"
                },
                "use_hybrid_search": {
                    "type": "boolean",
                    "description": "Use hybrid search (semantic+lexical, default: true)",
                    "default": True
                }
            },
            "required": ["query"]
        },
        output_schema={
            "type": "object",
            "properties": {
                "success": {"type": "boolean"},
                "query": {"type": "string"},
                "results": {"type": "array"},
                "count": {"type": "integer"}
            }
        }
    )
    
    tool_registry.register(
        name="rag.index_course",
        func=rag_index_course,
        description="Index a specific course into the vector database for RAG",
        input_schema={
            "type": "object",
            "properties": {
                "course_id": {
                    "type": "integer",
                    "description": "ID of the course to index"
                }
            },
            "required": ["course_id"]
        },
        output_schema={
            "type": "object",
            "properties": {
                "success": {"type": "boolean"},
                "course_id": {"type": "integer"},
                "title": {"type": "string"},
                "chunks_indexed": {"type": "integer"}
            }
        }
    )
    
    tool_registry.register(
        name="rag.index_item",
        func=rag_index_item,
        description="Index a specific item into the vector database for RAG",
        input_schema={
            "type": "object",
            "properties": {
                "item_id": {
                    "type": "integer",
                    "description": "ID of the item to index"
                }
            },
            "required": ["item_id"]
        },
        output_schema={
            "type": "object",
            "properties": {
                "success": {"type": "boolean"},
                "item_id": {"type": "integer"},
                "title": {"type": "string"},
                "chunks_indexed": {"type": "integer"}
            }
        }
    )
    
    tool_registry.register(
        name="rag.rebuild_index",
        func=rebuild_index,
        description="Rebuild the entire RAG vector index from scratch",
        input_schema={
            "type": "object",
            "properties": {
                "include_items": {
                    "type": "boolean",
                    "description": "Whether to include items (default: true)"
                }
            }
        },
        output_schema={
            "type": "object",
            "properties": {
                "success": {"type": "boolean"},
                "total_chunks": {"type": "integer"},
                "courses_indexed": {"type": "integer"},
                "items_indexed": {"type": "integer"},
                "course_chunks": {"type": "integer"},
                "item_chunks": {"type": "integer"}
            }
        }
    )
    
    tool_registry.register(
        name="rag.stats",
        func=get_index_stats,
        description="Get statistics about the RAG vector index",
        input_schema={"type": "object", "properties": {}},
        output_schema={
            "type": "object",
            "properties": {
                "success": {"type": "boolean"},
                "total_chunks": {"type": "integer"},
                "course_chunks": {"type": "integer"},
                "item_chunks": {"type": "integer"},
                "last_updated": {"type": "string"}
            }
        }
    )
    
    # ============================================
    # HITL (Human-in-the-Loop) Tools
    # ============================================
    from mcp_server.tools.hitl_tools import (
        notify_new_item,
        notify_classification,
        notify_course_generated,
        notify_rag_query,
        get_pending_decisions,
        get_decisions_history,
        start_telegram_bot,
        stop_telegram_bot
    )
    
    tool_registry.register(
        name="hitl.notify_new_item",
        func=notify_new_item,
        description="Send Telegram notification for newly collected item",
        input_schema={
            "type": "object",
            "properties": {
                "item_id": {
                    "type": "integer",
                    "description": "Item identifier"
                }
            },
            "required": ["item_id"]
        },
        output_schema={
            "type": "object",
            "properties": {
                "success": {"type": "boolean"},
                "item_id": {"type": "integer"},
                "message": {"type": "string"}
            }
        }
    )
    
    tool_registry.register(
        name="hitl.notify_classification",
        func=notify_classification,
        description="Send Telegram notification after classification with validation buttons",
        input_schema={
            "type": "object",
            "properties": {
                "item_id": {
                    "type": "integer",
                    "description": "Item identifier"
                },
                "topics": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Classified topics"
                },
                "importance": {
                    "type": "string",
                    "description": "Importance level"
                },
                "item_type": {
                    "type": "string",
                    "description": "Content type"
                }
            },
            "required": ["item_id", "topics", "importance", "item_type"]
        },
        output_schema={
            "type": "object",
            "properties": {
                "success": {"type": "boolean"},
                "item_id": {"type": "integer"},
                "message": {"type": "string"}
            }
        }
    )
    
    tool_registry.register(
        name="hitl.notify_course_generated",
        func=notify_course_generated,
        description="Send Telegram notification after course generation with review buttons",
        input_schema={
            "type": "object",
            "properties": {
                "course_id": {
                    "type": "integer",
                    "description": "Course identifier"
                },
                "qa_score": {
                    "type": "number",
                    "description": "Optional QA score"
                }
            },
            "required": ["course_id"]
        },
        output_schema={
            "type": "object",
            "properties": {
                "success": {"type": "boolean"},
                "course_id": {"type": "integer"},
                "message": {"type": "string"}
            }
        }
    )
    
    tool_registry.register(
        name="hitl.notify_rag_query",
        func=notify_rag_query,
        description="Send RAG query result to admin for feedback",
        input_schema={
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "User's question"
                },
                "answer": {
                    "type": "string",
                    "description": "Generated answer"
                },
                "confidence": {
                    "type": "number",
                    "description": "Confidence score"
                },
                "sources_count": {
                    "type": "integer",
                    "description": "Number of sources used"
                }
            },
            "required": ["query", "answer", "confidence", "sources_count"]
        },
        output_schema={
            "type": "object",
            "properties": {
                "success": {"type": "boolean"},
                "message": {"type": "string"}
            }
        }
    )
    
    tool_registry.register(
        name="hitl.get_pending_decisions",
        func=get_pending_decisions,
        description="Get list of items/courses pending human decision",
        input_schema={"type": "object", "properties": {}},
        output_schema={
            "type": "object",
            "properties": {
                "success": {"type": "boolean"},
                "pending_items": {"type": "array"},
                "pending_items_count": {"type": "integer"},
                "pending_courses": {"type": "array"},
                "pending_courses_count": {"type": "integer"}
            }
        }
    )
    
    tool_registry.register(
        name="hitl.get_decisions_history",
        func=get_decisions_history,
        description="Get history of human decisions",
        input_schema={
            "type": "object",
            "properties": {
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of decisions to return (default: 20)",
                    "default": 20
                }
            }
        },
        output_schema={
            "type": "object",
            "properties": {
                "success": {"type": "boolean"},
                "decisions": {"type": "array"},
                "count": {"type": "integer"}
            }
        }
    )
    
    tool_registry.register(
        name="hitl.start_bot",
        func=start_telegram_bot,
        description="Start Telegram bot in polling mode (for development)",
        input_schema={"type": "object", "properties": {}},
        output_schema={
            "type": "object",
            "properties": {
                "success": {"type": "boolean"},
                "message": {"type": "string"},
                "admin_chat_id": {"type": "string"}
            }
        }
    )
    
    tool_registry.register(
        name="hitl.stop_bot",
        func=stop_telegram_bot,
        description="Stop Telegram bot polling",
        input_schema={"type": "object", "properties": {}},
        output_schema={
            "type": "object",
            "properties": {
                "success": {"type": "boolean"},
                "message": {"type": "string"}
            }
        }
    )
    
    logger.info(f"Registered {len(tool_registry.tools)} tools")

    # ============================================
    # Site Monitor Scheduler
    # ============================================
    try:
        from mcp_server.services.site_monitor import init_site_monitor
        from mcp_server.services.teams_bot import get_teams_bot
        from mcp_server.api.router import db as api_db

        teams_bot = get_teams_bot(settings.teams_webhook_url)
        monitor = init_site_monitor(
            db_manager=api_db,
            teams_bot=teams_bot,
            dashboard_url="http://localhost:3000",
        )
        # Poll every 60 s — les sources sont vérifiées selon leur check_interval_minutes
        await monitor.start_scheduler(poll_interval_seconds=60)
        logger.info("Site monitor scheduler démarré")
    except Exception as exc:
        logger.warning(f"Site monitor non démarré : {exc}")

    logger.info("MCP Server ready!")


@app.on_event("shutdown")
async def shutdown_event():
    """
    Application shutdown: cleanup.
    """
    logger.info("Shutting down AcademiaOps MCP Server...")

    # Arrêter le scheduler de surveillance
    try:
        from mcp_server.services.site_monitor import get_site_monitor
        monitor = get_site_monitor()
        if monitor:
            monitor.stop_scheduler()
            logger.info("Site monitor scheduler arrêté")
    except Exception:
        pass

