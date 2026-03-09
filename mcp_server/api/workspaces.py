"""
Workspaces API endpoints
Manage multi-domain knowledge organization
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
import logging
import re

from mcp_server.database import DatabaseManager
from mcp_server.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/workspaces", tags=["workspaces"])

# Database instance
db = DatabaseManager(settings.database_url)

# ============================================================
# Pydantic Models
# ============================================================

class WorkspaceCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    domain: Optional[str] = Field(None, max_length=50)
    icon: str = Field(default="folder", max_length=50)
    color: str = Field(default="#3B82F6", pattern=r"^#[0-9A-Fa-f]{6}$")

    def generate_slug(self) -> str:
        """Generate URL-safe slug from name"""
        slug = self.name.lower()
        slug = re.sub(r'[^a-z0-9]+', '-', slug)
        slug = slug.strip('-')
        return slug[:100]


class WorkspaceUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    domain: Optional[str] = Field(None, max_length=50)
    icon: Optional[str] = Field(None, max_length=50)
    color: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    is_active: Optional[bool] = None


class WorkspaceResponse(BaseModel):
    id: int
    name: str
    slug: str
    description: Optional[str]
    domain: Optional[str]
    icon: str
    color: str
    is_active: bool
    created_at: datetime
    updated_at: datetime
    stats: Optional[Dict[str, Any]] = None


class WorkspaceStats(BaseModel):
    sources_count: int = 0
    items_count: int = 0
    knowledge_items_count: int = 0
    latest_item_date: Optional[str] = None  # ISO format string


# ============================================================
# Endpoints
# ============================================================

@router.get("", response_model=List[WorkspaceResponse])
async def list_workspaces(
    include_stats: bool = Query(default=True),
    include_inactive: bool = Query(default=False)
):
    """
    List all workspaces with optional statistics
    """
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                # Build query
                query = """
                    SELECT 
                        w.id, w.name, w.slug, w.description, w.domain, 
                        w.icon, w.color, w.is_active, w.created_at, w.updated_at
                    FROM workspaces w
                """
                
                if not include_inactive:
                    query += " WHERE w.is_active = true"
                
                query += " ORDER BY w.created_at DESC"
                
                cur.execute(query)
                workspaces = []
                
                for row in cur.fetchall():
                    workspace = {
                        "id": row[0],
                        "name": row[1],
                        "slug": row[2],
                        "description": row[3],
                        "domain": row[4],
                        "icon": row[5],
                        "color": row[6],
                        "is_active": row[7],
                        "created_at": row[8],
                        "updated_at": row[9],
                        "stats": None
                    }
                    
                    # Get stats if requested
                    if include_stats:
                        cur.execute("""
                            SELECT 
                                (SELECT COUNT(*) FROM sources WHERE workspace_id = %s) as sources_count,
                                (SELECT COUNT(*) FROM items WHERE workspace_id = %s) as items_count,
                                (SELECT COUNT(*) FROM courses WHERE workspace_id = %s) as knowledge_items_count,
                                (SELECT MAX(created_at) FROM items WHERE workspace_id = %s) as latest_item_date
                        """, (row[0], row[0], row[0], row[0]))
                        
                        stats_row = cur.fetchone()
                        workspace["stats"] = {
                            "sources_count": stats_row[0] or 0,
                            "items_count": stats_row[1] or 0,
                            "knowledge_items_count": stats_row[2] or 0,
                            "latest_item_date": stats_row[3].isoformat() if stats_row[3] else None
                        }
                    
                    workspaces.append(workspace)
                
                return workspaces
                
    except Exception as e:
        logger.error(f"Error listing workspaces: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{workspace_id}", response_model=WorkspaceResponse)
async def get_workspace(workspace_id: int, include_stats: bool = Query(default=True)):
    """
    Get a specific workspace by ID
    """
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT 
                        id, name, slug, description, domain, 
                        icon, color, is_active, created_at, updated_at
                    FROM workspaces
                    WHERE id = %s
                """, (workspace_id,))
                
                row = cur.fetchone()
                if not row:
                    raise HTTPException(status_code=404, detail="Workspace not found")
                
                workspace = {
                    "id": row[0],
                    "name": row[1],
                    "slug": row[2],
                    "description": row[3],
                    "domain": row[4],
                    "icon": row[5],
                    "color": row[6],
                    "is_active": row[7],
                    "created_at": row[8],
                    "updated_at": row[9],
                    "stats": None
                }
                
                # Get stats if requested
                if include_stats:
                    cur.execute("""
                        SELECT 
                            (SELECT COUNT(*) FROM sources WHERE workspace_id = %s) as sources_count,
                            (SELECT COUNT(*) FROM items WHERE workspace_id = %s) as items_count,
                            (SELECT COUNT(*) FROM courses WHERE workspace_id = %s) as knowledge_items_count,
                            (SELECT MAX(created_at) FROM items WHERE workspace_id = %s) as latest_item_date
                    """, (workspace_id, workspace_id, workspace_id, workspace_id))
                    
                    stats_row = cur.fetchone()
                    workspace["stats"] = {
                        "sources_count": stats_row[0] or 0,
                        "items_count": stats_row[1] or 0,
                        "knowledge_items_count": stats_row[2] or 0,
                        "latest_item_date": stats_row[3].isoformat() if stats_row[3] else None
                    }
                
                return workspace
                
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting workspace {workspace_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("", response_model=WorkspaceResponse, status_code=201)
async def create_workspace(workspace: WorkspaceCreate):
    """
    Create a new workspace
    """
    slug = workspace.generate_slug()
    
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                # Check if slug already exists
                cur.execute("SELECT id FROM workspaces WHERE slug = %s", (slug,))
                if cur.fetchone():
                    # Append number to make it unique
                    counter = 1
                    new_slug = f"{slug}-{counter}"
                    while True:
                        cur.execute("SELECT id FROM workspaces WHERE slug = %s", (new_slug,))
                        if not cur.fetchone():
                            slug = new_slug
                            break
                        counter += 1
                        new_slug = f"{slug}-{counter}"
                
                # Insert workspace
                cur.execute("""
                    INSERT INTO workspaces (name, slug, description, domain, icon, color)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    RETURNING id, name, slug, description, domain, icon, color, is_active, created_at, updated_at
                """, (
                    workspace.name,
                    slug,
                    workspace.description,
                    workspace.domain,
                    workspace.icon,
                    workspace.color
                ))
                
                row = cur.fetchone()
                conn.commit()
                
                # Create default permission for public
                cur.execute("""
                    INSERT INTO workspace_permissions (workspace_id, user_identifier, role, can_read, can_write, can_delete, can_generate)
                    VALUES (%s, 'public', 'owner', true, true, true, true)
                """, (row[0],))
                conn.commit()
                
                logger.info(f"Created workspace: {workspace.name} (id={row[0]}, slug={slug})")
                
                return {
                    "id": row[0],
                    "name": row[1],
                    "slug": row[2],
                    "description": row[3],
                    "domain": row[4],
                    "icon": row[5],
                    "color": row[6],
                    "is_active": row[7],
                    "created_at": row[8],
                    "updated_at": row[9],
                    "stats": {
                        "sources_count": 0,
                        "items_count": 0,
                        "knowledge_items_count": 0,
                        "latest_item_date": None
                    }
                }
                
    except Exception as e:
        logger.error(f"Error creating workspace: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{workspace_id}", response_model=WorkspaceResponse)
async def update_workspace(workspace_id: int, update: WorkspaceUpdate):
    """
    Update a workspace
    """
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                # Check if workspace exists
                cur.execute("SELECT id FROM workspaces WHERE id = %s", (workspace_id,))
                if not cur.fetchone():
                    raise HTTPException(status_code=404, detail="Workspace not found")
                
                # Build update query dynamically
                updates = []
                values = []
                
                if update.name is not None:
                    updates.append("name = %s")
                    values.append(update.name)
                    # Regenerate slug
                    new_slug = re.sub(r'[^a-z0-9]+', '-', update.name.lower()).strip('-')[:100]
                    updates.append("slug = %s")
                    values.append(new_slug)
                
                if update.description is not None:
                    updates.append("description = %s")
                    values.append(update.description)
                
                if update.domain is not None:
                    updates.append("domain = %s")
                    values.append(update.domain)
                
                if update.icon is not None:
                    updates.append("icon = %s")
                    values.append(update.icon)
                
                if update.color is not None:
                    updates.append("color = %s")
                    values.append(update.color)
                
                if update.is_active is not None:
                    updates.append("is_active = %s")
                    values.append(update.is_active)
                
                if not updates:
                    raise HTTPException(status_code=400, detail="No fields to update")
                
                values.append(workspace_id)
                
                query = f"""
                    UPDATE workspaces
                    SET {', '.join(updates)}
                    WHERE id = %s
                    RETURNING id, name, slug, description, domain, icon, color, is_active, created_at, updated_at
                """
                
                cur.execute(query, values)
                row = cur.fetchone()
                conn.commit()
                
                logger.info(f"Updated workspace {workspace_id}")
                
                return {
                    "id": row[0],
                    "name": row[1],
                    "slug": row[2],
                    "description": row[3],
                    "domain": row[4],
                    "icon": row[5],
                    "color": row[6],
                    "is_active": row[7],
                    "created_at": row[8],
                    "updated_at": row[9],
                    "stats": None
                }
                
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating workspace {workspace_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{workspace_id}", status_code=204)
async def delete_workspace(workspace_id: int, force: bool = Query(default=False)):
    """
    Delete a workspace (soft delete by default, force=true for hard delete)
    """
    
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                # Check if workspace exists
                cur.execute("SELECT id, name FROM workspaces WHERE id = %s", (workspace_id,))
                workspace = cur.fetchone()
                if not workspace:
                    raise HTTPException(status_code=404, detail="Workspace not found")
                
                if force:
                    # Hard delete (CASCADE will delete related data)
                    cur.execute("DELETE FROM workspaces WHERE id = %s", (workspace_id,))
                    logger.warning(f"Hard deleted workspace {workspace_id} ({workspace[1]})")
                else:
                    # Soft delete
                    cur.execute("UPDATE workspaces SET is_active = false WHERE id = %s", (workspace_id,))
                    logger.info(f"Soft deleted workspace {workspace_id} ({workspace[1]})")
                
                conn.commit()
                return None
                
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting workspace {workspace_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{workspace_id}/templates", response_model=List[Dict[str, Any]])
async def get_workspace_templates(workspace_id: int):
    """
    Get available content templates for a workspace
    """
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                # Check if workspace exists
                cur.execute("SELECT id FROM workspaces WHERE id = %s", (workspace_id,))
                if not cur.fetchone():
                    raise HTTPException(status_code=404, detail="Workspace not found")
                
                # Get all active templates
                cur.execute("""
                    SELECT 
                        id, name, display_name, description, content_type,
                        default_duration_minutes, expected_sections, output_format
                    FROM content_templates
                    WHERE is_active = true
                    ORDER BY content_type, display_name
                """)
                
                templates = []
                for row in cur.fetchall():
                    templates.append({
                        "id": row[0],
                        "name": row[1],
                        "display_name": row[2],
                        "description": row[3],
                        "content_type": row[4],
                        "default_duration_minutes": row[5],
                        "expected_sections": row[6],
                        "output_format": row[7]
                    })
                
                return templates
                
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting templates for workspace {workspace_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# Members / Permissions endpoints
# ============================================================

class MemberCreate(BaseModel):
    user_identifier: str = Field(..., min_length=1, max_length=255)
    role: str = Field(default="viewer", pattern=r"^(owner|admin|editor|viewer)$")
    can_read: bool = True
    can_write: bool = False
    can_delete: bool = False
    can_generate: bool = False


class MemberResponse(BaseModel):
    id: int
    workspace_id: int
    user_identifier: str
    role: str
    can_read: bool
    can_write: bool
    can_delete: bool
    can_generate: bool
    created_at: datetime


@router.get("/{workspace_id}/members", response_model=List[MemberResponse])
async def list_members(workspace_id: int):
    """List workspace members (excluding the 'public' system entry)."""
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT id FROM workspaces WHERE id = %s", (workspace_id,))
                if not cur.fetchone():
                    raise HTTPException(status_code=404, detail="Workspace not found")

                cur.execute("""
                    SELECT id, workspace_id, user_identifier, role,
                           can_read, can_write, can_delete, can_generate, created_at
                    FROM workspace_permissions
                    WHERE workspace_id = %s AND user_identifier != 'public'
                    ORDER BY created_at ASC
                """, (workspace_id,))

                return [
                    {
                        "id": r[0], "workspace_id": r[1], "user_identifier": r[2],
                        "role": r[3], "can_read": r[4], "can_write": r[5],
                        "can_delete": r[6], "can_generate": r[7], "created_at": r[8]
                    }
                    for r in cur.fetchall()
                ]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing members for workspace {workspace_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{workspace_id}/members", response_model=MemberResponse, status_code=201)
async def add_member(workspace_id: int, member: MemberCreate):
    """Add a user to a workspace."""
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT id FROM workspaces WHERE id = %s", (workspace_id,))
                if not cur.fetchone():
                    raise HTTPException(status_code=404, detail="Workspace not found")

                cur.execute("""
                    INSERT INTO workspace_permissions
                        (workspace_id, user_identifier, role, can_read, can_write, can_delete, can_generate)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (workspace_id, user_identifier)
                    DO UPDATE SET
                        role = EXCLUDED.role,
                        can_read = EXCLUDED.can_read,
                        can_write = EXCLUDED.can_write,
                        can_delete = EXCLUDED.can_delete,
                        can_generate = EXCLUDED.can_generate
                    RETURNING id, workspace_id, user_identifier, role,
                              can_read, can_write, can_delete, can_generate, created_at
                """, (
                    workspace_id, member.user_identifier, member.role,
                    member.can_read, member.can_write, member.can_delete, member.can_generate
                ))
                r = cur.fetchone()
                conn.commit()
                logger.info(f"Added member {member.user_identifier} to workspace {workspace_id}")
                return {
                    "id": r[0], "workspace_id": r[1], "user_identifier": r[2],
                    "role": r[3], "can_read": r[4], "can_write": r[5],
                    "can_delete": r[6], "can_generate": r[7], "created_at": r[8]
                }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding member to workspace {workspace_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{workspace_id}/members/{user_identifier}", status_code=204)
async def remove_member(workspace_id: int, user_identifier: str):
    """Remove a user from a workspace."""
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    DELETE FROM workspace_permissions
                    WHERE workspace_id = %s AND user_identifier = %s AND user_identifier != 'public'
                    RETURNING id
                """, (workspace_id, user_identifier))
                if not cur.fetchone():
                    raise HTTPException(status_code=404, detail="Member not found")
                conn.commit()
                logger.info(f"Removed member {user_identifier} from workspace {workspace_id}")
                return None
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error removing member {user_identifier} from workspace {workspace_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

