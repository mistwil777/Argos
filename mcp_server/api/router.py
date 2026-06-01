"""
REST API Router for OpenWebMCP Web Interface

Provides REST endpoints alongside the existing JSON-RPC interface.
"""

from fastapi import APIRouter, HTTPException, Query, BackgroundTasks, UploadFile, File, Form, Header
from typing import Optional, Dict, Any
import logging
from datetime import datetime, timezone
from pathlib import Path

from mcp_server.database import DatabaseManager
from mcp_server.config import settings
from mcp_server.services.llm_provider import create_llm_provider

logger = logging.getLogger(__name__)

# Create router
api_router = APIRouter(prefix="/api/v1", tags=["api"])

# Import and include sub-routers
from mcp_server.api.workspaces import router as workspaces_router
api_router.include_router(workspaces_router)

# Database instance
db = DatabaseManager(settings.database_url)


# ===========================================
# Background: auto-collect + auto-classify
# ===========================================

async def _auto_collect_and_classify(source_id: int):
    """Background task: collect items from a source then classify them all."""
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id, name, url, type, workspace_id FROM sources WHERE id = %s AND active = TRUE",
                    (source_id,)
                )
                row = cur.fetchone()
                if not row:
                    return
                src_id, src_name, src_url, src_type, src_wid = row

        from mcp_server.services.collector import CollectorService
        collector = CollectorService(db_manager=db)

        items = []
        if src_type == 'rss':
            config = {"url": src_url, "name": src_name or src_url, "enabled": True}
            items = collector.fetch_rss_feed(config)
            for i in items:
                i.update({'workspace_id': src_wid, 'source_url': src_url})
        elif src_type == 'website':
            items = collector.fetch_website_page(src_url, workspace_id=src_wid)
        elif src_type == 'github':
            config = {"type": "github", "url": src_url, "name": src_name or src_url, "enabled": True}
            items = collector.fetch_github_repos(config)
            for i in items:
                i.update({'workspace_id': src_wid, 'source_url': src_url})
        else:
            logger.warning(f"[auto-collect] source type '{src_type}' not supported")
            return

        inserted, duplicates = collector.insert_items(items)
        logger.info(f"[auto-collect] source={source_id} fetched={len(items)} inserted={inserted} duplicates={duplicates}")

        # Fetch all pending items from this source URL and classify them
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id FROM items WHERE source_url = %s AND classification_status = 'pending'",
                    (src_url,)
                )
                pending_ids = [r[0] for r in cur.fetchall()]

        if not pending_ids:
            logger.info(f"[auto-classify] no pending items for source={source_id}")
            return

        from mcp_server.services.classifier import ClassifierService
        llm_provider = create_llm_provider(
            provider_type=settings.llm_provider,
            openai_api_key=settings.openai_api_key,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
            aws_region=settings.aws_region,
            model=settings.default_classification_model
        )
        classifier = ClassifierService(llm_provider=llm_provider, db_manager=db, temperature=0.5, max_tokens=800)

        logger.info(f"[auto-classify] classifying {len(pending_ids)} items for source={source_id}")
        for item_id in pending_ids:
            try:
                await classifier.classify_item(item_id)
                logger.info(f"[auto-classify] item={item_id} classified")
            except Exception as e:
                logger.error(f"[auto-classify] item={item_id} failed: {e}")

    except Exception as e:
        logger.error(f"[auto-collect-classify] source={source_id} error={e}", exc_info=True)


# ===========================================
# Stats Endpoints
# ===========================================

@api_router.get("/stats/global")
async def get_global_stats():
    """Get global statistics."""
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM items")
                total_items = cur.fetchone()[0]

                cur.execute("SELECT COUNT(*) FROM items WHERE classification_status = 'classified'")
                classified_items = cur.fetchone()[0]

                cur.execute("SELECT COUNT(*) FROM items WHERE classification_status = 'pending'")
                pending_items = cur.fetchone()[0]

                cur.execute("SELECT COUNT(*) FROM browse_sessions")
                total_browses = cur.fetchone()[0]

                cur.execute("SELECT COUNT(*) FROM search_sessions")
                total_searches = cur.fetchone()[0]

                cur.execute("SELECT COALESCE(SUM(cost_usd), 0) FROM llm_usage")
                total_cost = float(cur.fetchone()[0] or 0)

                cur.execute("""
                    SELECT COALESCE(SUM(cost_usd), 0) FROM llm_usage
                    WHERE created_at >= CURRENT_DATE
                """)
                cost_today = float(cur.fetchone()[0] or 0)

                cur.execute("""
                    SELECT COALESCE(SUM(cost_usd), 0) FROM llm_usage
                    WHERE created_at >= date_trunc('month', CURRENT_DATE)
                """)
                cost_this_month = float(cur.fetchone()[0] or 0)

        return {
            "total_items": total_items,
            "classified_items": classified_items,
            "pending_items": pending_items,
            "total_browses": total_browses,
            "total_searches": total_searches,
            "total_cost": total_cost,
            "cost_today": cost_today,
            "cost_this_month": cost_this_month,
        }
    except Exception as e:
        logger.error(f"Error fetching global stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/stats/timeline")
async def get_timeline_stats(days: int = Query(default=7, ge=1, le=90)):
    """Get timeline statistics for the last N days."""
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT
                        DATE(created_at) as date,
                        COUNT(*) as items_collected,
                        COUNT(CASE WHEN classification_status = 'classified' THEN 1 END) as items_classified
                    FROM items
                    WHERE created_at >= NOW() - INTERVAL '%s days'
                    GROUP BY DATE(created_at)
                    ORDER BY date DESC
                    LIMIT %s
                """, (days, days))
                items_data = cur.fetchall()

                cur.execute("""
                    SELECT DATE(created_at) as date, COUNT(*) as browses
                    FROM browse_sessions
                    WHERE created_at >= NOW() - INTERVAL '%s days'
                    GROUP BY DATE(created_at)
                """, (days,))
                browses_data = {row[0]: row[1] for row in cur.fetchall()}

        timeline = []
        for row in items_data:
            date_str = row[0].strftime("%Y-%m-%d") if hasattr(row[0], 'strftime') else str(row[0])
            timeline.append({
                "date": date_str,
                "items_collected": row[1],
                "items_classified": row[2],
                "browses": browses_data.get(row[0], 0),
            })

        return timeline
    except Exception as e:
        logger.error(f"Error fetching timeline stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/stats/topics")
async def get_topics_stats(limit: int = Query(default=10, ge=1, le=50)):
    """Get top topics by item and course count."""
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                # Get topic counts from subject column
                cur.execute("""
                    SELECT 
                        subject as topic,
                        COUNT(*) as item_count,
                        COUNT(DISTINCT CASE WHEN classification_status = 'classified' THEN id END) as classified_count
                    FROM items
                    WHERE subject IS NOT NULL
                    GROUP BY subject
                    ORDER BY item_count DESC
                    LIMIT %s
                """, (limit,))
                
                results = []
                for row in cur.fetchall():
                    results.append({
                        "topic": row[0],
                        "item_count": row[1],
                        "course_count": row[2]
                    })
                
                return results
    except Exception as e:
        logger.error(f"Error fetching topics stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/stats/costs")
async def get_costs_stats(period: str = Query(default="month", regex="^(week|month|year)$")):
    """Get daily cost breakdown over the requested period."""
    try:
        days = {"week": 7, "month": 30, "year": 365}.get(period, 30)
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT
                        DATE(created_at) as date,
                        COALESCE(SUM(cost_usd), 0) as total,
                        SUM(CASE WHEN operation_type = 'classification' THEN cost_usd ELSE 0 END) as classifier_cost,
                        SUM(CASE WHEN operation_type = 'digest' THEN cost_usd ELSE 0 END) as digest_cost,
                        SUM(CASE WHEN operation_type = 'rag' THEN cost_usd ELSE 0 END) as rag_cost
                    FROM llm_usage
                    WHERE created_at >= NOW() - INTERVAL '%s days'
                    GROUP BY DATE(created_at)
                    ORDER BY date ASC
                    LIMIT %s
                """, (days, days))
                rows = cur.fetchall()

        return [
            {
                "date": row[0].strftime("%Y-%m-%d") if hasattr(row[0], "strftime") else str(row[0]),
                "classifier_cost": float(row[2] or 0),
                "digest_cost": float(row[3] or 0),
                "rag_cost": float(row[4] or 0),
                "total": float(row[1] or 0),
            }
            for row in rows
        ]
    except Exception as e:
        logger.error(f"Error fetching costs stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# Items Endpoints
# ============================================

@api_router.get("/items")
async def list_items(
    status: str = Query(default="all", description="Filter by status: all, pending, classified"),
    source: str = Query(default="all", description="Filter by source"),
    workspace_id: Optional[int] = Query(default=None, description="Filter by workspace ID"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0)
):
    """List items with optional filters."""
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                # Build query with filters
                where_conditions = []
                params = []
                
                if status != "all":
                    where_conditions.append("classification_status = %s")
                    params.append(status)
                
                
                if source != "all":
                    where_conditions.append("source_type = %s")
                    params.append(source)
                
                if workspace_id is not None:
                    where_conditions.append("workspace_id = %s")
                    params.append(workspace_id)
                
                where_clause = " AND ".join(where_conditions) if where_conditions else "1=1"
                
                query = f"""
                    SELECT 
                        id, title, summary, url, source_type, source_url,
                        subject, importance, classification_status,
                        published_at, created_at, workspace_id,
                        keywords
                    FROM items
                    WHERE {where_clause}
                    ORDER BY created_at DESC
                    LIMIT %s OFFSET %s
                """
                
                params.extend([limit, offset])
                cur.execute(query, params)
                
                items = []
                for row in cur.fetchall():
                    items.append({
                        "id": row[0],
                        "title": row[1],
                        "summary": row[2],
                        "url": row[3],
                        "source_type": row[4],
                        "source_url": row[5],
                        "subject": row[6],
                        "importance": row[7],
                        "classification_status": row[8],
                        "status": row[8],  # backward compat alias
                        "published_at": row[9].isoformat() if row[9] else None,
                        "created_at": row[10].isoformat() if row[10] else None,
                        "workspace_id": row[11],
                        "topics": row[12] or []
                    })
                
                # Get total count
                count_query = f"SELECT COUNT(*) FROM items WHERE {where_clause}"
                cur.execute(count_query, params[:-2])  # Exclude limit and offset
                total = cur.fetchone()[0]
                
                return {"items": items, "total": total}
    except Exception as e:
        logger.error(f"Error listing items: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/items")
async def create_item(data: Dict[str, Any]):
    """Ingest a single item (from n8n or external sources). Deduplicates by URL."""
    required = ['url', 'title', 'workspace_id']
    missing = [f for f in required if not data.get(f)]
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing required fields: {missing}")
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO items (
                        title, summary, url, source_type, source_url,
                        workspace_id, published_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (url) DO NOTHING
                    RETURNING id
                """, (
                    data['title'],
                    data.get('summary') or data.get('description') or '',
                    data['url'],
                    data.get('source_type', 'rss'),
                    data.get('source_url'),
                    data['workspace_id'],
                    data.get('published_at'),
                ))
                row = cur.fetchone()
                conn.commit()
                if row:
                    return {"id": row[0], "created": True}
                return {"id": None, "created": False, "reason": "duplicate"}
    except Exception as e:
        logger.error(f"Error creating item: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.patch("/items/batch/workspace")
async def batch_assign_workspace(data: Dict[str, Any]):
    """Assign / move a batch of items to a workspace."""
    item_ids = data.get("item_ids", [])
    target_workspace_id = data.get("workspace_id")
    if not item_ids or target_workspace_id is None:
        raise HTTPException(status_code=400, detail="item_ids and workspace_id are required")
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE items SET workspace_id = %s WHERE id = ANY(%s::int[])",
                    (target_workspace_id, item_ids)
                )
                updated = cur.rowcount
                conn.commit()
                return {"updated": updated, "workspace_id": target_workspace_id}
    except Exception as e:
        logger.error(f"Error batch-assigning workspace: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/items/{item_id}")
async def get_item(item_id: int):
    """Get a single item by ID."""
    try:
        item = db.get_item_by_id(item_id)
        if not item:
            raise HTTPException(status_code=404, detail="Item not found")
        return item
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching item {item_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/items/batch/classify")
async def classify_items_batch(data: Dict[str, Any]):
    """Classify multiple items using LLM."""
    item_ids = data.get("item_ids", [])
    if not item_ids:
        raise HTTPException(status_code=400, detail="item_ids is required")
    try:
        from mcp_server.services.classifier import ClassifierService
        from mcp_server.services.llm_provider import create_llm_provider

        llm_provider = create_llm_provider(
            provider_type=settings.llm_provider,
            openai_api_key=settings.openai_api_key,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
            aws_region=settings.aws_region,
            model=settings.default_classification_model
        )
        classifier = ClassifierService(
            llm_provider=llm_provider,
            db_manager=db,
            temperature=0.5,
            max_tokens=800
        )

        results = []
        errors = []
        for item_id in item_ids:
            try:
                result = await classifier.classify_item(item_id)
                results.append({"item_id": item_id, "status": "classified", "topics": result.get("topics", [])})
            except Exception as e:
                logger.error(f"Failed to classify item {item_id}: {e}")
                errors.append({"item_id": item_id, "error": str(e)})

        return {"classified": len(results), "errors": len(errors), "results": results, "error_details": errors}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in batch classify: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch classification failed: {str(e)}")


@api_router.post("/items/{item_id}/classify")
async def classify_item(item_id: int):
    """Classify a single item using LLM."""
    try:
        from mcp_server.services.classifier import ClassifierService
        from mcp_server.services.llm_provider import create_llm_provider
        
        item = db.get_item_by_id(item_id)
        if not item:
            raise HTTPException(status_code=404, detail="Item not found")
        
        llm_provider = create_llm_provider(
            provider_type=settings.llm_provider,
            openai_api_key=settings.openai_api_key,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
            aws_region=settings.aws_region,
            model=settings.default_classification_model
        )
        
        classifier = ClassifierService(
            llm_provider=llm_provider,
            db_manager=db,
            temperature=0.5,
            max_tokens=800
        )
        
        result = await classifier.classify_item(item_id)
        
        logger.info(f"Item {item_id} classified: topics={result.get('topics')}, importance={result.get('importance')}")
        
        return {
            "message": "Item classified successfully",
            "item_id": item_id,
            "topics": result.get("topics", []),
            "importance": result.get("importance"),
            "item_type": result.get("item_type"),
            "summary_fr": result.get("summary_fr", ""),
            "tokens_used": result.get("tokens_used", 0),
            "cost_usd": result.get("cost_usd", 0.0)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error classifying item {item_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Classification failed: {str(e)}")


@api_router.delete("/items/{item_id}")
async def delete_item(item_id: int):
    """Delete an item."""
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM items WHERE id = %s", (item_id,))
                if cur.rowcount == 0:
                    raise HTTPException(status_code=404, detail="Item not found")
                conn.commit()
        
        return {"message": "Item deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting item {item_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# RAG Endpoints
# ============================================

@api_router.post("/rag/extract-document")
async def rag_extract_document(
    file: UploadFile = File(...),
    use_vision: bool = Form(default=True),
):
    """
    Extract text from an uploaded document (PDF, image, DOCX, TXT).
    Returns the extracted text to be passed as document_context to /rag/ask.
    """
    from mcp_server.services.document_extractor import extract_document, SUPPORTED_MIME_TYPES

    mime_type = file.content_type or "application/octet-stream"
    short_mime = mime_type.lower().split(";")[0].strip()
    if short_mime not in SUPPORTED_MIME_TYPES and not file.filename.endswith(".docx"):
        raise HTTPException(
            status_code=415,
            detail=f"Type de fichier non supporté : {mime_type}. Formats acceptés : PDF, PNG, JPG, WEBP, TIFF, TXT, DOCX.",
        )

    # Size limit: 20 MB
    content = await file.read()
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Fichier trop volumineux (max 20 Mo).")

    try:
        result = await extract_document(
            file_bytes=content,
            mime_type=mime_type,
            filename=file.filename or "",
            use_vision_for_images=use_vision,
        )
    except Exception as e:
        logger.error(f"Document extraction failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Extraction échouée : {str(e)}")

    if not result["text"]:
        raise HTTPException(
            status_code=422,
            detail="Impossible d'extraire du texte de ce document. Vérifiez que le fichier n'est pas protégé ou vide.",
        )

    return {
        "filename": file.filename,
        "mime_type": mime_type,
        "method": result["method"],
        "char_count": result["char_count"],
        "truncated": result["truncated"],
        "text": result["text"],
    }


@api_router.post("/rag/ask")
async def rag_ask(request: Dict[str, Any]):
    """Ask a question to the RAG system."""
    try:
        query = request.get("query")
        if not query:
            raise HTTPException(status_code=400, detail="Query is required")
        
        # Import RAG services
        from mcp_server.services.rag import RAGService
        from mcp_server.services.vector_store_singleton import get_vector_store
        from mcp_server.services.llm_provider import create_llm_provider
        
        # Get pre-loaded VectorStore singleton (fast, no model loading)
        vector_store = get_vector_store()
        
        # Determine model based on provider
        if settings.llm_provider == "aws":
            model = settings.aws_bedrock_model
        else:
            model = settings.default_classification_model
        
        llm_provider = create_llm_provider(
            provider_type=settings.llm_provider,
            aws_access_key_id=settings.aws_access_key_id if settings.llm_provider == "aws" else None,
            aws_secret_access_key=settings.aws_secret_access_key if settings.llm_provider == "aws" else None,
            aws_region=settings.aws_region if settings.llm_provider == "aws" else None,
            openai_api_key=settings.openai_api_key if settings.llm_provider == "openai" else None,
            model=model
        )
        
        rag_service = RAGService(
            llm_provider=llm_provider,
            vector_store=vector_store,
            db_manager=db,
            top_k=5,
            temperature=0.6
        )
        
        # Optionally prepend extracted document context to the query
        document_context = request.get("document_context", "").strip()
        effective_query = query
        if document_context:
            effective_query = (
                f"[Document joint]\n{document_context}\n\n"
                f"[Question de l'utilisateur]\n{query}"
            )

        workspace_id_raw = request.get("workspace_id")
        workspace_id = int(workspace_id_raw) if workspace_id_raw is not None else None

        # Ask question
        result = await rag_service.ask(
            query=effective_query,
            use_hybrid_search=request.get("use_hybrid_search", True),
            workspace_id=workspace_id
        )
        
        # Return result (RAGService returns all required fields)
        return {
            "answer": result.get("answer", ""),
            "sources": result.get("sources", []),
            "confidence": result.get("confidence_score", 0.0),
            "tokens_used": result.get("tokens_used", 0),
            "cost_usd": result.get("cost_usd", 0.0),
            "model": result.get("model", "unknown")
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in RAG ask: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/rag/history")
async def rag_history(limit: int = Query(default=20, ge=1, le=100)):
    """Get RAG query history."""
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT id, query, answer, sources, created_at
                    FROM rag_queries
                    ORDER BY created_at DESC
                    LIMIT %s
                """, (limit,))
                
                history = []
                for row in cur.fetchall():
                    history.append({
                        "id": row[0],
                        "query": row[1],
                        "answer": row[2],
                        "sources": row[3],  # JSONB field
                        "created_at": row[4].isoformat() if row[4] else None
                    })
                
                return history
    except Exception as e:
        logger.error(f"Error fetching RAG history: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.delete("/rag/history")
async def clear_rag_history():
    """Clear all RAG query history."""
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM rag_queries")
                deleted_count = cur.rowcount
                conn.commit()
                logger.info(f"Cleared {deleted_count} RAG history entries")
                return {"message": f"Historique effacé ({deleted_count} entrées)", "deleted": deleted_count}
    except Exception as e:
        logger.error(f"Error clearing RAG history: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/rag/index-all-items")
async def index_all_items():
    """Index all classified items with a digest into the RAG vector store."""
    try:
        from mcp_server.services.vector_store_singleton import get_vector_store

        vector_store = get_vector_store()

        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT id, title, summary, digest_markdown, workspace_id
                    FROM items
                    WHERE classification_status = 'classified'
                      AND digest_json IS NOT NULL
                    ORDER BY created_at DESC
                """)
                items = [
                    {"id": r[0], "title": r[1], "summary": r[2], "content": r[3] or r[2] or "", "workspace_id": r[4]}
                    for r in cur.fetchall()
                ]

        if not items:
            return {"message": "No items to index", "indexed": 0, "total_chunks": 0}

        total_chunks = 0
        indexed = 0
        errors = []

        for item in items:
            try:
                n = vector_store.index_item(item)
                total_chunks += n
                indexed += 1
            except Exception as e:
                logger.error(f"Error indexing item {item['id']}: {e}")
                errors.append({"item_id": item["id"], "error": str(e)})

        return {
            "message": f"Indexed {indexed} items with {total_chunks} chunks",
            "indexed": indexed,
            "total_chunks": total_chunks,
            "errors": errors if errors else None,
        }

    except Exception as e:
        logger.error(f"Error indexing items: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/rag/stats")
async def rag_stats():
    """Get RAG system statistics."""
    try:
        from mcp_server.services.vector_store import VectorStoreService
        
        vector_store = VectorStoreService(
            db_path=str(settings.lancedb_path),
            model_name=settings.embedding_model
        )
        
        stats = vector_store.get_stats()

        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM items WHERE rag_indexed = TRUE")
                indexed_items = cur.fetchone()[0]

                cur.execute("SELECT COUNT(*) FROM rag_queries")
                total_queries = cur.fetchone()[0]

        return {
            "vector_store": stats,
            "indexed_items": indexed_items,
            "total_queries": total_queries,
            "embedding_model": settings.embedding_model,
            "lancedb_path": str(settings.lancedb_path)
        }
        
    except Exception as e:
        logger.error(f"Error fetching RAG stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ===========================================
# Sources Endpoints
# ===========================================

@api_router.get("/sources")
async def list_sources(
    type: Optional[str] = Query(None, description="Filter by source type (rss, github, api)"),
    category: Optional[str] = Query(None, description="Filter by category"),
    active: Optional[bool] = Query(None, description="Filter by active status"),
    workspace_id: Optional[int] = Query(None, description="Filter by workspace ID"),
    limit: int = Query(100, ge=1, le=500)
):
    """List all data sources with optional filters."""
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                # Build query with filters
                conditions = []
                params = []
                
                if type:
                    conditions.append("type = %s")
                    params.append(type)
                
                if category:
                    conditions.append("category = %s")
                    params.append(category)
                
                if active is not None:
                    conditions.append("active = %s")
                    params.append(active)
                
                if workspace_id is not None:
                    conditions.append("workspace_id = %s")
                    params.append(workspace_id)
                
                where_clause = "WHERE " + " AND ".join(conditions) if conditions else ""
                
                cur.execute(f"""
                    SELECT 
                        id, name, url, type, category, description, 
                        tags, active, created_at, updated_at
                    FROM sources
                    {where_clause}
                    ORDER BY created_at DESC
                    LIMIT %s
                """, params + [limit])
                
                rows = cur.fetchall()
                sources = []
                for row in rows:
                    sources.append({
                        "id": row[0],
                        "name": row[1],
                        "url": row[2],
                        "type": row[3],
                        "category": row[4],
                        "description": row[5],
                        "tags": row[6] or [],
                        "active": row[7],
                        "createdAt": row[8].isoformat() if row[8] else None,
                        "updatedAt": row[9].isoformat() if row[9] else None
                    })
                
                return {"sources": sources, "total": len(sources)}
    except Exception as e:
        logger.error(f"Error listing sources: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/sources/{source_id}")
async def get_source(source_id: int):
    """Get details of a specific source."""
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT 
                        id, name, url, type, category, description, 
                        tags, active, created_at, updated_at
                    FROM sources
                    WHERE id = %s
                """, (source_id,))
                
                row = cur.fetchone()
                if not row:
                    raise HTTPException(status_code=404, detail="Source not found")
                
                return {
                    "id": row[0],
                    "name": row[1],
                    "url": row[2],
                    "type": row[3],
                    "category": row[4],
                    "description": row[5],
                    "tags": row[6] or [],
                    "active": row[7],
                    "createdAt": row[8].isoformat() if row[8] else None,
                    "updatedAt": row[9].isoformat() if row[9] else None
                }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching source: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/sources")
async def create_source(source: Dict[str, Any], background_tasks: BackgroundTasks):
    """Create a new data source."""
    try:
        # Validate required fields
        required_fields = ["name", "url", "type", "category"]
        for field in required_fields:
            if field not in source:
                raise HTTPException(status_code=400, detail=f"Missing required field: {field}")
        
        # Validate type
        if source["type"] not in ["rss", "github", "api", "website"]:
            raise HTTPException(status_code=400, detail="Invalid type. Must be rss, github, api, or website")

        # workspace_id is required — no silent default
        workspace_id = source.get("workspace_id")
        if not workspace_id:
            raise HTTPException(status_code=400, detail="workspace_id is required to create a source")

        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO sources (name, url, type, category, description, tags, active, workspace_id)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                """, (
                    source["name"],
                    source["url"],
                    source["type"],
                    source["category"],
                    source.get("description", ""),
                    source.get("tags", []),
                    source.get("active", True),
                    workspace_id
                ))
                
                source_id = cur.fetchone()[0]
                conn.commit()

                if source.get("active", True):
                    background_tasks.add_task(_auto_collect_and_classify, source_id)

                return {"id": source_id, "message": "Source created successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating source: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.patch("/sources/{source_id}/toggle")
async def toggle_source(source_id: int, data: Dict[str, Any], background_tasks: BackgroundTasks):
    """Toggle source active status."""
    try:
        active = data.get("active")
        if active is None:
            raise HTTPException(status_code=400, detail="Missing 'active' field")
        
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE sources
                    SET active = %s, updated_at = CURRENT_TIMESTAMP
                    WHERE id = %s
                    RETURNING id
                """, (active, source_id))
                
                if not cur.fetchone():
                    raise HTTPException(status_code=404, detail="Source not found")
                
                conn.commit()

                if active:
                    background_tasks.add_task(_auto_collect_and_classify, source_id)

                return {"message": "Source updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error toggling source: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.put("/sources/{source_id}")
async def update_source(source_id: int, data: Dict[str, Any]):
    """Update a data source's fields."""
    try:
        allowed = ['name', 'url', 'type', 'category', 'description', 'tags']
        updates = {k: v for k, v in data.items() if k in allowed}
        if not updates:
            raise HTTPException(status_code=400, detail="No valid fields to update")
        if 'type' in updates and updates['type'] not in ['rss', 'github', 'api', 'website']:
            raise HTTPException(status_code=400, detail="Invalid type")
        set_clause = ', '.join(f"{k} = %s" for k in updates)
        params = list(updates.values()) + [source_id]
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"UPDATE sources SET {set_clause}, updated_at = CURRENT_TIMESTAMP WHERE id = %s RETURNING id",
                    params
                )
                if not cur.fetchone():
                    raise HTTPException(status_code=404, detail="Source not found")
                conn.commit()
        return {"message": "Source updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating source {source_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.delete("/sources/{source_id}")
async def delete_source(source_id: int):
    """Delete a data source."""
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    DELETE FROM sources
                    WHERE id = %s
                    RETURNING id
                """, (source_id,))
                
                if not cur.fetchone():
                    raise HTTPException(status_code=404, detail="Source not found")
                
                conn.commit()
                
                return {"message": "Source deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting source: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/sources/{source_id}/collect")
async def collect_from_source(source_id: int):
    """Manually trigger content collection for a specific source."""
    try:
        # Load source from DB
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id, name, url, type, workspace_id FROM sources WHERE id = %s",
                    (source_id,)
                )
                row = cur.fetchone()
                if not row:
                    raise HTTPException(status_code=404, detail="Source not found")
                src_id, src_name, src_url, src_type, src_wid = row

        from mcp_server.services.collector import CollectorService
        collector = CollectorService(db_manager=db)

        items: list = []
        if src_type == 'rss':
            config = {"url": src_url, "name": src_name or src_url, "enabled": True}
            items = collector.fetch_rss_feed(config)
            for item in items:
                item['workspace_id'] = src_wid
                item['source_url'] = src_url
        elif src_type == 'website':
            items = collector.fetch_website_page(src_url, workspace_id=src_wid)
        elif src_type == 'github':
            config = {"type": "github", "url": src_url, "name": src_name or src_url, "enabled": True}
            items = collector.fetch_github_repos(config)
            for item in items:
                item['workspace_id'] = src_wid
                item['source_url'] = src_url
        else:
            return {"message": f"Type '{src_type}' not supported for manual collection", "fetched": 0, "inserted": 0, "duplicates": 0}

        inserted, duplicates = collector.insert_items(items)
        return {
            "message": "Collection terminée",
            "source_id": source_id,
            "fetched": len(items),
            "inserted": inserted,
            "duplicates": duplicates,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error collecting source {source_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/workspaces/{workspace_id}/collect")
async def collect_workspace_sources(workspace_id: int):
    """Trigger collection for ALL active sources of a workspace."""
    try:
        from mcp_server.services.collector import CollectorService
        collector = CollectorService(db_manager=db)
        stats = collector.fetch_from_db_sources(workspace_id=workspace_id)
        return {
            "message": "Collection complète",
            "workspace_id": workspace_id,
            **stats,
        }
    except Exception as e:
        logger.error(f"Error collecting workspace {workspace_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ===========================================
# Monitor Endpoints — surveillance de sites web
# ===========================================

@api_router.patch("/sources/{source_id}/monitor")
async def update_monitor_settings(source_id: int, data: Dict[str, Any]):
    """
    Met à jour les paramètres de surveillance d'une source website.
    Champs acceptés : monitor_enabled (bool), check_interval_minutes (int >= 5).
    """
    try:
        allowed = {"monitor_enabled": bool, "check_interval_minutes": int}
        updates: Dict[str, Any] = {}

        if "monitor_enabled" in data:
            val = data["monitor_enabled"]
            if not isinstance(val, bool):
                raise HTTPException(status_code=400, detail="monitor_enabled must be a boolean")
            updates["monitor_enabled"] = val

        if "check_interval_minutes" in data:
            val = int(data["check_interval_minutes"])
            if val < 5:
                raise HTTPException(status_code=400, detail="check_interval_minutes must be >= 5")
            updates["check_interval_minutes"] = val

        if not updates:
            raise HTTPException(status_code=400, detail="No valid monitor fields provided")

        set_clause = ", ".join(f"{k} = %s" for k in updates)
        params = list(updates.values()) + [source_id]

        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    UPDATE sources
                    SET {set_clause}, updated_at = NOW()
                    WHERE id = %s
                    RETURNING id, type
                    """,
                    params,
                )
                row = cur.fetchone()
                if not row:
                    raise HTTPException(status_code=404, detail="Source not found")
                if row[1] != "website":
                    conn.rollback()
                    raise HTTPException(
                        status_code=400,
                        detail="La surveillance n'est disponible que pour les sources de type 'website'"
                    )
                conn.commit()

        return {"message": "Paramètres de surveillance mis à jour", "source_id": source_id, **updates}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating monitor settings for source {source_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/sources/{source_id}/check-monitor")
async def check_source_monitor(source_id: int, background_tasks: BackgroundTasks):
    """
    Déclenche manuellement la vérification de changement de contenu
    pour une source website surveillée.
    """
    try:
        from mcp_server.services.site_monitor import get_site_monitor, SiteMonitorService

        monitor = get_site_monitor()
        if monitor is None:
            monitor = SiteMonitorService(db_manager=db)

        async def _run():
            result = await monitor.check_source(source_id)
            logger.info(f"[monitor] check-monitor result: {result}")

        background_tasks.add_task(_run)
        return {"message": "Vérification lancée en arrière-plan", "source_id": source_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error triggering monitor check for source {source_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/monitors/check-all")
async def check_all_monitors(background_tasks: BackgroundTasks):
    """
    Déclenche manuellement la vérification de toutes les sources website
    avec monitor_enabled=True dont l'intervalle est écoulé.
    """
    try:
        from mcp_server.services.site_monitor import get_site_monitor, SiteMonitorService

        monitor = get_site_monitor()
        if monitor is None:
            monitor = SiteMonitorService(db_manager=db)

        async def _run():
            results = await monitor.check_all_sources()
            changed = sum(1 for r in results if r.get("changed"))
            logger.info(f"[monitor] check-all: {len(results)} vérifié(es), {changed} changement(s)")

        background_tasks.add_task(_run)
        return {"message": "Vérification globale lancée en arrière-plan"}

    except Exception as e:
        logger.error(f"Error triggering global monitor check: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# Admin Endpoints (codebase ingestion + auto-diag)
# ============================================

def _check_admin(token: Optional[str]):
    """Raise 403 if admin token is invalid or not configured."""
    if not settings.admin_token:
        raise HTTPException(status_code=503, detail="Admin access not configured (ADMIN_TOKEN not set)")
    if token != settings.admin_token:
        raise HTTPException(status_code=403, detail="Invalid admin token")


# Files to index from the codebase (relative to /app)
_CODEBASE_EXTENSIONS = {".py", ".ts", ".tsx", ".sql", ".yaml", ".yml", ".md", ".sh", ".json"}
_CODEBASE_ROOTS = [
    Path("/app/mcp_server"),
    Path("/app/docs"),
    Path("/app/database"),
    Path("/app/scripts"),
    Path("/app/workflows"),
    Path("/app/migrations"),
    Path("/app/n8n"),
    Path("/app/frontend/src"),
    Path("/app/config"),
]
# Root-level .md files via the full project_root mount (README, CAHIER_DES_CHARGES, etc.)
_CODEBASE_ROOT_LEVEL = Path("/app/project_root")
# Subdirs to skip when walking project_root (already covered by specific roots above)
_CODEBASE_SKIP_DIRS = {"__pycache__", ".git", "node_modules", "dist", ".venv", "venv", "__snapshots__", ".cache"}
_CODEBASE_SKIP_DIRS_ROOT = _CODEBASE_SKIP_DIRS | {"mcp_server", "docs", "database", "scripts", "workflows", "migrations", "n8n", "frontend", "config", "data", "logs", "tests", "lancedb"}
_CODEBASE_SKIP_FILES = {"package-lock.json", "yarn.lock", "pnpm-lock.yaml"}
_CODEBASE_MAX_FILE_BYTES = 300_000  # skip very large files


def _walk_codebase():
    """Yield (relative_path, content) for all indexable source files."""
    from pathlib import Path as _Path
    for root in _CODEBASE_ROOTS:
        root_path = _Path(root)
        if not root_path.exists():
            continue
        for fpath in root_path.rglob("*"):
            if fpath.is_dir():
                continue
            # Skip ignored dirs
            if any(part in _CODEBASE_SKIP_DIRS for part in fpath.parts):
                continue
            if fpath.suffix not in _CODEBASE_EXTENSIONS:
                continue
            if fpath.name in _CODEBASE_SKIP_FILES:
                continue
            if fpath.stat().st_size > _CODEBASE_MAX_FILE_BYTES:
                continue
            try:
                content = fpath.read_text(encoding="utf-8", errors="replace")
                rel = str(fpath.relative_to("/app"))
                yield rel, content
            except Exception:
                pass

    # Also index root-level files (README, CAHIER_DES_CHARGES, SOLUTIONS, etc.)
    if _CODEBASE_ROOT_LEVEL.exists():
        for fpath in _CODEBASE_ROOT_LEVEL.iterdir():
            if fpath.is_dir():
                # skip subdirs already covered
                if fpath.name in _CODEBASE_SKIP_DIRS_ROOT:
                    continue
                # recurse one level for any unexpected subdir not covered above
                for sub in fpath.rglob("*"):
                    if sub.is_dir() or sub.suffix not in _CODEBASE_EXTENSIONS:
                        continue
                    if sub.name in _CODEBASE_SKIP_FILES:
                        continue
                    if sub.stat().st_size > _CODEBASE_MAX_FILE_BYTES:
                        continue
                    try:
                        content = sub.read_text(encoding="utf-8", errors="replace")
                        yield f"project_root/{sub.relative_to(_CODEBASE_ROOT_LEVEL)}", content
                    except Exception:
                        pass
                continue
            if fpath.suffix not in _CODEBASE_EXTENSIONS:
                continue
            if fpath.name in _CODEBASE_SKIP_FILES:
                continue
            if fpath.stat().st_size > _CODEBASE_MAX_FILE_BYTES:
                continue
            try:
                content = fpath.read_text(encoding="utf-8", errors="replace")
                yield f"project_root/{fpath.name}", content
            except Exception:
                pass


@api_router.post("/admin/ingest-codebase")
async def admin_ingest_codebase(
    background_tasks: BackgroundTasks,
    x_admin_token: Optional[str] = Header(default=None)
):
    """Index the entire VeilleOps codebase into the RAG vector store."""
    _check_admin(x_admin_token)

    async def _run():
        from mcp_server.services.vector_store_singleton import get_vector_store
        vector_store = get_vector_store()
        # Clear previous codebase index
        vector_store.delete_codebase()
        total_files = 0
        total_chunks = 0
        for rel_path, content in _walk_codebase():
            try:
                n = vector_store.index_codebase_file(rel_path, content)
                total_chunks += n
                total_files += 1
            except Exception as exc:
                logger.warning(f"[admin] skip {rel_path}: {exc}")
        logger.info(f"[admin] codebase ingestion done: {total_files} files, {total_chunks} chunks")

    background_tasks.add_task(_run)
    return {"message": "Ingestion du code source lancée en arrière-plan"}


@api_router.get("/admin/codebase-stats")
async def admin_codebase_stats(
    x_admin_token: Optional[str] = Header(default=None)
):
    """Return stats about the indexed codebase."""
    _check_admin(x_admin_token)
    try:
        from mcp_server.services.vector_store_singleton import get_vector_store
        vector_store = get_vector_store()
        if vector_store.table_name in vector_store.db.table_names():
            table = vector_store.db.open_table(vector_store.table_name)
            rows = table.search().where("source_type = 'codebase'").limit(100000).to_list()
            files = list({r["title"] for r in rows})
            return {
                "chunks": len(rows),
                "files": len(files),
                "file_list": sorted(files),
            }
        return {"chunks": 0, "files": 0, "file_list": []}
    except Exception as e:
        logger.error(f"Error fetching codebase stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/admin/rag-diag")
async def admin_rag_diag(
    request: Dict[str, Any],
    x_admin_token: Optional[str] = Header(default=None)
):
    """RAG query scoped to the indexed codebase — for auto-diagnostics."""
    _check_admin(x_admin_token)
    query = request.get("query", "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="query is required")
    try:
        from mcp_server.services.vector_store_singleton import get_vector_store
        from mcp_server.services.rag import RAGService

        vector_store = get_vector_store()
        if settings.llm_provider == "aws":
            model = settings.aws_bedrock_model
        else:
            model = settings.default_classification_model

        llm_provider = create_llm_provider(
            provider_type=settings.llm_provider,
            aws_access_key_id=settings.aws_access_key_id if settings.llm_provider == "aws" else None,
            aws_secret_access_key=settings.aws_secret_access_key if settings.llm_provider == "aws" else None,
            aws_region=settings.aws_region if settings.llm_provider == "aws" else None,
            openai_api_key=settings.openai_api_key if settings.llm_provider == "openai" else None,
            model=model
        )

        # Override the system prompt for code-focused diagnostics
        rag = RAGService(
            llm_provider=llm_provider,
            vector_store=vector_store,
            db_manager=db,
            top_k=request.get("top_k", 8),
            temperature=0.3,
            max_tokens=1200
        )

        result = await rag.ask(
            query=query,
            use_hybrid_search=True,
            filter_source_type="codebase",
            workspace_id=None
        )
        return {
            "answer": result.get("answer", ""),
            "sources": result.get("sources", []),
            "confidence": result.get("confidence_score", 0.0),
        }
    except Exception as e:
        logger.error(f"Error in admin RAG diag: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ===========================================
# Web Tools Endpoints — REST wrappers for web.browse / web.search / web.digest
# ===========================================

@api_router.post("/web/browse")
async def web_browse(request: Dict[str, Any]):
    """Fetch a URL with headless browser (Playwright + stealth)."""
    try:
        from mcp_server.tools.web_tools import tool_browse
        from mcp_server.services.llm_provider import create_llm_provider

        result = await tool_browse(params=request, db=db)
        return result
    except Exception as e:
        logger.error(f"Error in web browse: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/web/search")
async def web_search(request: Dict[str, Any]):
    """Search the web without API keys (DuckDuckGo / Bing)."""
    try:
        from mcp_server.tools.web_tools import tool_search

        result = await tool_search(params=request, db=db)
        return result
    except Exception as e:
        logger.error(f"Error in web search: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/web/digest")
async def web_digest(request: Dict[str, Any]):
    """Browse a URL and generate a markdown + JSON digest via LLM."""
    try:
        from mcp_server.tools.web_tools import tool_digest
        from mcp_server.services.llm_provider import create_llm_provider

        try:
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

        result = await tool_digest(params=request, db=db, llm_provider=llm)
        return result
    except Exception as e:
        logger.error(f"Error in web digest: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/web/browse/history")
async def web_browse_history(
    workspace_id: Optional[int] = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100)
):
    """Recent browse sessions."""
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                args = []
                where = ""
                if workspace_id is not None:
                    where = "WHERE workspace_id = %s"
                    args.append(workspace_id)
                cur.execute(
                    f"""SELECT id, url, status, title, content_length, engine, duration_ms, created_at
                        FROM browse_sessions {where}
                        ORDER BY created_at DESC LIMIT %s""",
                    args + [limit]
                )
                rows = cur.fetchall()
        return [
            {
                "id": r[0], "url": r[1], "status": r[2], "title": r[3],
                "content_length": r[4], "engine": r[5], "duration_ms": r[6],
                "created_at": r[7].isoformat() if r[7] else None,
            }
            for r in rows
        ]
    except Exception as e:
        logger.error(f"Error fetching browse history: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/web/search/history")
async def web_search_history(
    workspace_id: Optional[int] = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100)
):
    """Recent search sessions."""
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                args = []
                where = ""
                if workspace_id is not None:
                    where = "WHERE workspace_id = %s"
                    args.append(workspace_id)
                cur.execute(
                    f"""SELECT id, query, engine, results_count, duration_ms, created_at
                        FROM search_sessions {where}
                        ORDER BY created_at DESC LIMIT %s""",
                    args + [limit]
                )
                rows = cur.fetchall()
        return [
            {
                "id": r[0], "query": r[1], "engine": r[2],
                "results_count": r[3], "duration_ms": r[4],
                "created_at": r[5].isoformat() if r[5] else None,
            }
            for r in rows
        ]
    except Exception as e:
        logger.error(f"Error fetching search history: {e}")
        raise HTTPException(status_code=500, detail=str(e))

