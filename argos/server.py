"""
Argos Server
FastAPI server with JSON-RPC 2.0 protocol implementation
"""

import logging
from typing import Any, Dict, List, Optional
from datetime import datetime

from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, ValidationError

from argos.config import settings
from argos.api import api_router


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
    title="Argos Server",
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
                "name": "Argos Server",
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
    from argos.api.router import db as api_db

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
        "service": "Argos Server",
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
    logger.info("Starting Argos Server...")

    # ---- Test ----
    from argos.tools.hello import hello_world
    tool_registry.register("hello.world", hello_world, "Health check — vérifie que le serveur répond",
        input_schema={},
        output_schema={"type":"object","properties":{"status":{"type":"string"},"message":{"type":"string"}}})

    # ---- Collector ----
    from argos.tools.collector import (
        fetch_rss, fetch_apis, fetch_all, get_collection_stats, list_sources
    )
    tool_registry.register("collector.fetch_rss", fetch_rss,
        "Collecte les flux RSS configurés et insère les nouveaux items en base",
        input_schema={"type":"object","properties":{"workspace_id":{"type":"integer","description":"Filtrer par workspace (optionnel)"}}})
    tool_registry.register("collector.fetch_apis", fetch_apis,
        "Collecte les APIs GitHub et ArXiv configurées",
        input_schema={"type":"object","properties":{"workspace_id":{"type":"integer","description":"Filtrer par workspace (optionnel)"}}})
    tool_registry.register("collector.fetch_all", fetch_all,
        "Lance la collecte sur toutes les sources actives (RSS + APIs)",
        input_schema={"type":"object","properties":{"workspace_id":{"type":"integer","description":"Filtrer par workspace (optionnel)"}}})
    tool_registry.register("collector.get_stats", get_collection_stats,
        "Retourne les statistiques de collecte (nb items, sources actives, dernière collecte)",
        input_schema={})
    tool_registry.register("collector.list_sources", list_sources,
        "Liste toutes les sources de collecte configurées avec leur statut",
        input_schema={"type":"object","properties":{"workspace_id":{"type":"integer","description":"Filtrer par workspace (optionnel)"}}})

    # ---- Classifier ----
    from argos.tools.classifier import (
        classify_item, classify_batch, get_classification_stats, get_unclassified_items
    )
    tool_registry.register("classifier.classify", classify_item,
        "Classifie un item via LLM : importance (critical/high/medium/low), type, topics, résumé FR",
        input_schema={"type":"object","properties":{"item_id":{"type":"integer","description":"ID de l'item à classifier"}},"required":["item_id"]})
    tool_registry.register("classifier.classify_batch", classify_batch,
        "Classifie plusieurs items en batch (jusqu'à 50 à la fois)",
        input_schema={"type":"object","properties":{"item_ids":{"type":"array","items":{"type":"integer"},"description":"Liste des IDs"},"limit":{"type":"integer","description":"Nb max si item_ids non fourni","default":10}}})
    tool_registry.register("classifier.stats", get_classification_stats,
        "Statistiques de classification : nb pending, classified, rejected, répartition par importance",
        input_schema={})
    tool_registry.register("classifier.get_unclassified", get_unclassified_items,
        "Retourne les items en attente de classification (status=pending)",
        input_schema={"type":"object","properties":{"limit":{"type":"integer","default":20,"description":"Nombre d'items à retourner"}}})

    # ---- RAG ----
    from argos.tools.rag_tools import (
        ask_question, search_content,
        index_item as rag_index_item,
        rebuild_index, get_index_stats
    )
    tool_registry.register(
        "rag.ask", ask_question,
        "Pose une question en langage naturel sur la base de connaissances indexée (recherche hybride sémantique + lexicale)",
        input_schema={"type":"object","properties":{
            "query":{"type":"string","description":"Question en langage naturel"},
            "filter_source_type":{"type":"string","enum":["course","item"],"description":"Filtrer par type de source (optionnel)"},
            "use_hybrid_search":{"type":"boolean","default":True,"description":"Utiliser la recherche hybride"},
            "workspace_id":{"type":"integer","description":"Filtrer par workspace (optionnel)"}
        },"required":["query"]}
    )
    tool_registry.register("rag.search", search_content,
        "Recherche sémantique dans la base vectorielle sans génération LLM",
        input_schema={"type":"object","properties":{
            "query":{"type":"string","description":"Requête de recherche"},
            "limit":{"type":"integer","default":10,"description":"Nombre de résultats"},
            "use_hybrid_search":{"type":"boolean","default":True}
        },"required":["query"]})
    tool_registry.register("rag.index_item", rag_index_item,
        "Indexe un item spécifique dans la base vectorielle LanceDB",
        input_schema={"type":"object","properties":{"item_id":{"type":"integer","description":"ID de l'item à indexer"}},"required":["item_id"]})
    tool_registry.register("rag.rebuild_index", rebuild_index,
        "Reconstruit l'intégralité de l'index vectoriel depuis la base de données",
        input_schema={"type":"object","properties":{"include_items":{"type":"boolean","default":True}}})
    tool_registry.register("rag.stats", get_index_stats,
        "Statistiques de l'index RAG : nb chunks, dimension des embeddings, modèle utilisé",
        input_schema={})

    # ---- Web Tools ----
    from argos.tools.web_tools import WEB_TOOLS
    from argos.api.router import db as api_db
    try:
        from argos.services.llm_provider import create_llm_provider
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
        """Wrap web tools into the MCP execute_tool interface (func(**kwargs)).
        Only passes llm_provider if the function signature accepts it."""
        import inspect
        sig = inspect.signature(tool_func)
        accepts_llm = "llm_provider" in sig.parameters

        async def wrapper(**kwargs):
            if accepts_llm:
                return await tool_func(params=kwargs, db=_db, llm_provider=_llm)
            else:
                return await tool_func(params=kwargs, db=_db)
        return wrapper

    WEB_TOOL_META = {
        "web.browse": {
            "desc": "Fetche une URL avec Playwright (rendu JS). Si l'URL se termine par '/', crawle toutes les sous-pages.",
            "schema": {"type":"object","properties":{
                "url":{"type":"string","description":"URL à fetcher (terminer par / pour crawl enfants)"},
                "use_playwright":{"type":"boolean","default":True},
                "timeout_ms":{"type":"integer","default":30000},
                "max_crawl":{"type":"integer","default":10,"description":"Nb max pages pour le crawl"}
            },"required":["url"]}
        },
        "web.digest": {
            "desc": "Fetche une URL, génère un résumé markdown structuré + JSON via LLM, et sauvegarde l'item en base.",
            "schema": {"type":"object","properties":{
                "url":{"type":"string","description":"URL à digérer"},
                "save_item":{"type":"boolean","default":True,"description":"Sauvegarder en base"},
                "workspace_id":{"type":"integer","description":"Workspace cible (optionnel)"}
            },"required":["url"]}
        },
        "web.watch": {
            "desc": "Enregistre une URL pour surveillance périodique des changements.",
            "schema": {"type":"object","properties":{
                "url":{"type":"string"},
                "name":{"type":"string","description":"Nom affiché"},
                "interval_minutes":{"type":"integer","default":60},
                "workspace_id":{"type":"integer"}
            },"required":["url"]}
        },
        "web.watched_pages": {
            "desc": "Liste toutes les URLs en cours de surveillance avec leur dernier statut.",
            "schema": {}
        },
    }

    for name, func in WEB_TOOLS.items():
        wrapper = _make_web_tool_wrapper(func, api_db, llm)
        meta = WEB_TOOL_META.get(name, {})
        tool_registry.register(name, wrapper,
            meta.get("desc", f"Web tool: {name}"),
            input_schema=meta.get("schema", {}))

    logger.info(f"Registered {len(tool_registry.tools)} tools")

    # ---- Warmup VectorStore (async, non-blocking) ----
    try:
        from argos.services.vector_store_singleton import warmup_vector_store
        import asyncio
        asyncio.ensure_future(warmup_vector_store())
        logger.info("VectorStore warmup scheduled in background")
    except Exception as exc:
        logger.warning(f"VectorStore warmup could not be scheduled: {exc}")

    # ---- Site Monitor Scheduler ----
    try:
        from argos.services.site_monitor import init_site_monitor
        monitor = init_site_monitor(db_manager=api_db, dashboard_url="http://localhost:3000")
        await monitor.start_scheduler(poll_interval_seconds=60)
        logger.info("Site monitor scheduler started")
    except Exception as exc:
        logger.warning(f"Site monitor not started: {exc}")

    # ---- Daily Briefing Scheduler ----
    try:
        import asyncio as _asyncio
        from argos.config import settings as _settings

        async def _daily_briefing_job():
            """Generate daily briefing at configured hour (default 7:00)."""
            import datetime as _dt
            briefing_hour = int(getattr(_settings, 'briefing_hour', 7))
            logger.info(f"Daily briefing scheduler started — fires at {briefing_hour:02d}:00 daily")
            while True:
                now = _dt.datetime.now()
                next_run = now.replace(hour=briefing_hour, minute=0, second=0, microsecond=0)
                if now >= next_run:
                    next_run += _dt.timedelta(days=1)
                wait_seconds = (next_run - now).total_seconds()
                logger.info(f"Next briefing in {wait_seconds/3600:.1f}h (at {next_run.strftime('%H:%M')})")
                await _asyncio.sleep(wait_seconds)
                try:
                    from argos.api.router import db as _db
                    from argos.api.router import _generate_briefing_content
                    import json as _json
                    import datetime as _dt2
                    today = _dt2.date.today()
                    result = await _generate_briefing_content(hours=24)
                    if "error" not in result:
                        with _db.get_connection() as conn:
                            with conn.cursor() as cur:
                                cur.execute(
                                    """INSERT INTO daily_briefings
                                       (briefing_date, executive_summary, top_items, trends, stats, tokens_used, cost_usd)
                                       VALUES (%s,%s,%s::jsonb,%s::jsonb,%s::jsonb,%s,%s)
                                       ON CONFLICT (briefing_date) DO NOTHING""",
                                    (today, result["markdown"],
                                     _json.dumps(result["top_items"]),
                                     _json.dumps(result["trends"]),
                                     _json.dumps(result["stats"]),
                                     result["tokens_used"], result["cost_usd"])
                                )
                                conn.commit()
                        logger.info(f"Daily briefing generated for {today}")
                    else:
                        logger.warning(f"Briefing skipped: {result.get('message')}")
                except Exception as e:
                    logger.error(f"Daily briefing generation failed: {e}", exc_info=True)

        _asyncio.ensure_future(_daily_briefing_job())
        logger.info("Daily briefing scheduler started")
    except Exception as exc:
        logger.warning(f"Daily briefing scheduler not started: {exc}")

    logger.info("Argos Server ready!")


@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Shutting down Argos Server...")

    # Arrêter le scheduler de surveillance
    try:
        from argos.services.site_monitor import get_site_monitor
        monitor = get_site_monitor()
        if monitor:
            monitor.stop_scheduler()
            logger.info("Site monitor scheduler arrêté")
    except Exception:
        pass

