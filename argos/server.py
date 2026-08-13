"""
Argos Server
FastAPI server with JSON-RPC 2.0 protocol implementation
"""

import logging
from typing import Any, Dict, List, Optional
from datetime import datetime

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, ValidationError

from argos.config import settings
from argos.api import api_router, veille_router, assistant_router
from argos.api.auth import auth_router
from argos.api.projects import router as projects_router
from argos.api.project_calibration import router as project_calibration_router
from argos.mcp_server import mcp


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
# Initialise le streamable_http_app MCP (crée le session_manager)
_mcp_starlette = mcp.streamable_http_app()


async def _run_startup():
    """Forward reference shim — appelle startup_event() après sa définition."""
    # startup_event est défini plus bas dans ce module ; on l'importe dynamiquement
    import sys
    mod = sys.modules[__name__]
    fn = getattr(mod, "startup_event", None)
    if fn:
        await fn()


async def _run_shutdown():
    import sys
    mod = sys.modules[__name__]
    fn = getattr(mod, "shutdown_event", None)
    if fn:
        await fn()


@asynccontextmanager
async def _lifespan(app: FastAPI):
    """Lifespan combiné FastAPI + MCP session manager."""
    async with mcp.session_manager.run():
        await _run_startup()
        yield
        await _run_shutdown()


app = FastAPI(
    title="Argos Server",
    description="Web browsing infrastructure for AI agents — Model Context Protocol",
    version="1.0.0",
    docs_url="/docs" if settings.environment == "development" else None,
    redoc_url="/redoc" if settings.environment == "development" else None,
    lifespan=_lifespan,
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
app.include_router(auth_router)
app.include_router(api_router)
app.include_router(veille_router)
app.include_router(assistant_router)
app.include_router(projects_router, prefix="/api/v1")
app.include_router(project_calibration_router, prefix="/api/v1")

# ── MCP Server (Streamable HTTP) ──────────────────────────────────────────────
# On ajoute directement la route /mcp en passant l'ASGI handler du session manager.
# Cela évite le double-préfixe /mcp/mcp tout en gardant les routes FastAPI intactes.
# FastMCP utilise streamable_http_path="/" en interne.
# En montant sur /mcp, FastAPI strip le préfixe /mcp et passe "/" à l'app FastMCP.
# Les routes FastAPI (/health, /api/v1/*, /rpc) restent intactes.
app.mount("/mcp", _mcp_starlette)


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

    # ---- Site Monitor (intégré dans APScheduler via site_monitor.py) ----
    try:
        from argos.services.site_monitor import init_site_monitor
        monitor = init_site_monitor(db_manager=api_db, dashboard_url="http://localhost:3000")
        await monitor.start_scheduler(poll_interval_seconds=60)
        logger.info("Site monitor démarré")
    except Exception as exc:
        logger.warning(f"Site monitor non démarré : {exc}")

    # ---- APScheduler — remplace toutes les boucles asyncio ad-hoc ----
    try:
        from argos.services.scheduler import start_scheduler
        from argos.config import settings as _settings
        await start_scheduler(database_url=_settings.database_url)
    except Exception as exc:
        logger.warning(f"APScheduler non démarré : {exc}")

    logger.info("Argos Server ready!")


async def shutdown_event():
    logger.info("Shutting down Argos Server...")

    # Arrêter APScheduler
    try:
        from argos.services.scheduler import stop_scheduler
        stop_scheduler()
    except Exception:
        pass

    # Arrêter le site monitor
    try:
        from argos.services.site_monitor import get_site_monitor
        monitor = get_site_monitor()
        if monitor:
            monitor.stop_scheduler()
    except Exception:
        pass

