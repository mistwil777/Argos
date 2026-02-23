"""
Collector MCP Tools

Exposes collection functionality via Model Context Protocol (JSON-RPC).
"""

import logging
from typing import Dict, Optional

from mcp_server.config import settings
from mcp_server.database import DatabaseManager
from mcp_server.services.collector import CollectorService

logger = logging.getLogger(__name__)

# ============================================
# Singleton Instances
# ============================================

_db_manager = None
_collector_service = None


def _get_db_manager() -> DatabaseManager:
    """Get or create DatabaseManager singleton."""
    global _db_manager
    if _db_manager is None:
        _db_manager = DatabaseManager(settings.database_url)
    return _db_manager


def _get_collector_service() -> CollectorService:
    """Get or create CollectorService singleton."""
    global _collector_service
    if _collector_service is None:
        db = _get_db_manager()
        _collector_service = CollectorService(
            db_manager=db,
            config_path="config/veille_sources.yaml"
        )
    return _collector_service


# ============================================
# MCP Tool Functions
# ============================================

async def fetch_rss(feed_name: Optional[str] = None) -> Dict:
    """
    Fetch items from RSS feeds.
    
    Args:
        feed_name: Optional specific feed name to fetch. If None, fetches all.
        
    Returns:
        {
            "success": bool,
            "fetched": int,
            "inserted": int,
            "duplicates": int,
            "errors": int,
            "message": str
        }
    """
    try:
        service = _get_collector_service()
        
        if feed_name:
            # Fetch specific feed
            feed_config = None
            for feed in service.config.get("rss_feeds", []):
                if feed.get("name") == feed_name:
                    feed_config = feed
                    break
            
            if not feed_config:
                return {
                    "success": False,
                    "message": f"Feed '{feed_name}' not found in configuration"
                }
            
            items = service.fetch_rss_feed(feed_config)
            inserted, duplicates = service.insert_items(items)
            
            return {
                "success": True,
                "fetched": len(items),
                "inserted": inserted,
                "duplicates": duplicates,
                "errors": 0,
                "message": f"Fetched {len(items)} items from {feed_name}"
            }
        else:
            # Fetch all feeds
            inserted = service.fetch_all_rss()
            stats = service.get_stats()
            
            return {
                "success": True,
                "fetched": stats["fetched"],
                "inserted": stats["inserted"],
                "duplicates": stats["duplicates"],
                "errors": stats["errors"],
                "message": f"Fetched from all RSS feeds"
            }
            
    except Exception as e:
        logger.error(f"RSS fetch failed: {e}", exc_info=True)
        return {
            "success": False,
            "message": f"Failed to fetch RSS: {str(e)}"
        }


async def fetch_apis(api_name: Optional[str] = None) -> Dict:
    """
    Fetch items from API sources (GitHub, ArXiv).
    
    Args:
        api_name: Optional specific API name to fetch. If None, fetches all.
        
    Returns:
        {
            "success": bool,
            "fetched": int,
            "inserted": int,
            "duplicates": int,
            "errors": int,
            "message": str
        }
    """
    try:
        service = _get_collector_service()
        
        if api_name:
            # Fetch specific API
            api_config = None
            for api in service.config.get("apis", []):
                if api.get("name") == api_name:
                    api_config = api
                    break
            
            if not api_config:
                return {
                    "success": False,
                    "message": f"API '{api_name}' not found in configuration"
                }
            
            api_type = api_config.get("type", "unknown")
            
            if api_type == "github":
                items = service.fetch_github_repos(api_config)
            elif api_type == "arxiv":
                items = service.fetch_arxiv_papers(api_config)
            else:
                return {
                    "success": False,
                    "message": f"Unsupported API type: {api_type}"
                }
            
            inserted, duplicates = service.insert_items(items)
            
            return {
                "success": True,
                "fetched": len(items),
                "inserted": inserted,
                "duplicates": duplicates,
                "errors": 0,
                "message": f"Fetched {len(items)} items from {api_name}"
            }
        else:
            # Fetch all APIs
            inserted = service.fetch_all_apis()
            stats = service.get_stats()
            
            return {
                "success": True,
                "fetched": stats["fetched"],
                "inserted": stats["inserted"],
                "duplicates": stats["duplicates"],
                "errors": stats["errors"],
                "message": f"Fetched from all API sources"
            }
            
    except Exception as e:
        logger.error(f"API fetch failed: {e}", exc_info=True)
        return {
            "success": False,
            "message": f"Failed to fetch from APIs: {str(e)}"
        }


async def fetch_all() -> Dict:
    """
    Fetch items from all enabled sources (RSS + APIs).
    
    Returns:
        {
            "success": bool,
            "fetched": int,
            "inserted": int,
            "duplicates": int,
            "errors": int,
            "sources": {
                "rss_feeds": int,
                "apis": int
            },
            "message": str
        }
    """
    try:
        service = _get_collector_service()
        
        # Fetch from all sources
        stats = service.fetch_all()
        
        return {
            "success": True,
            "fetched": stats["fetched"],
            "inserted": stats["inserted"],
            "duplicates": stats["duplicates"],
            "errors": stats["errors"],
            "message": f"Collected from all sources: {stats['inserted']} new items"
        }
        
    except Exception as e:
        logger.error(f"Collection failed: {e}", exc_info=True)
        return {
            "success": False,
            "message": f"Failed to collect: {str(e)}"
        }


async def get_collection_stats() -> Dict:
    """
    Get statistics about data collection.
    
    Returns:
        {
            "success": bool,
            "stats": {
                "total_items": int,
                "unclassified_items": int,
                "sources": {
                    "rss": int,
                    "github": int,
                    "arxiv": int
                },
                "last_collection": {
                    "fetched": int,
                    "inserted": int,
                    "duplicates": int,
                    "errors": int
                }
            }
        }
    """
    try:
        db = _get_db_manager()
        service = _get_collector_service()
        
        # Get database statistics
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                # Total items
                cur.execute("SELECT COUNT(*) FROM items")
                total_items = cur.fetchone()[0]
                
                # Unclassified items
                cur.execute("SELECT COUNT(*) FROM items WHERE classification_status = 'pending'")
                unclassified = cur.fetchone()[0]
                
                # By source type
                cur.execute("""
                    SELECT source_type, COUNT(*) 
                    FROM items 
                    GROUP BY source_type
                """)
                sources = dict(cur.fetchall())
        
        return {
            "success": True,
            "stats": {
                "total_items": total_items,
                "unclassified_items": unclassified,
                "classified_items": total_items - unclassified,
                "sources": sources,
                "last_collection": service.get_stats()
            }
        }
        
    except Exception as e:
        logger.error(f"Failed to get stats: {e}", exc_info=True)
        return {
            "success": False,
            "message": f"Failed to get statistics: {str(e)}"
        }


async def list_sources() -> Dict:
    """
    List all configured sources.
    
    Returns:
        {
            "success": bool,
            "sources": {
                "rss_feeds": List[Dict],
                "apis": List[Dict]
            }
        }
    """
    try:
        service = _get_collector_service()
        config = service.config
        
        # Extract essential info from sources
        rss_feeds = []
        for feed in config.get("rss_feeds", []):
            rss_feeds.append({
                "name": feed.get("name"),
                "category": feed.get("category"),
                "enabled": feed.get("enabled", True),
                "priority": feed.get("priority", "medium")
            })
        
        apis = []
        for api in config.get("apis", []):
            apis.append({
                "name": api.get("name"),
                "type": api.get("type"),
                "enabled": api.get("enabled", True)
            })
        
        return {
            "success": True,
            "sources": {
                "rss_feeds": rss_feeds,
                "apis": apis
            },
            "total_sources": len(rss_feeds) + len(apis)
        }
        
    except Exception as e:
        logger.error(f"Failed to list sources: {e}", exc_info=True)
        return {
            "success": False,
            "message": f"Failed to list sources: {str(e)}"
        }


# ============================================
# Tool Registry
# ============================================

COLLECTOR_TOOLS = {
    "collector.fetch_rss": fetch_rss,
    "collector.fetch_apis": fetch_apis,
    "collector.fetch_all": fetch_all,
    "collector.get_stats": get_collection_stats,
    "collector.list_sources": list_sources,
}
