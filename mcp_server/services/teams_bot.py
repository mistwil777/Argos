"""
Microsoft Teams Bot Service for AcademiaOps
Sends notifications via Incoming Webhooks with Adaptive Cards
Corporate-friendly alternative to Telegram (works with Zscaler)
"""

import httpx
import logging
from typing import List, Dict, Optional, Any
from datetime import datetime

logger = logging.getLogger(__name__)


class TeamsBot:
    """
    Microsoft Teams notification bot using Incoming Webhooks.
    
    Setup:
    1. Open Teams channel
    2. Click "..." → Connectors → Incoming Webhook
    3. Configure webhook, copy URL
    4. Add to .env: TEAMS_WEBHOOK_URL=https://...
    
    Features:
    - Adaptive Cards for rich formatting
    - Action buttons (Action.OpenUrl)
    - Color-coded messages (success, warning, error)
    - No bot registration required
    - Works behind corporate proxies (Zscaler)
    """
    
    def __init__(self, webhook_url: str):
        """
        Initialize Teams bot with webhook URL.
        
        Args:
            webhook_url: Teams Incoming Webhook URL from connector
        """
        self.webhook_url = webhook_url
        self.client = httpx.AsyncClient(timeout=30.0)
        logger.info("Teams bot initialized")
    
    async def send_notification(
        self,
        title: str,
        message: str,
        color: str = "0078D4",  # Microsoft Blue
        facts: Optional[List[Dict[str, str]]] = None,
        actions: Optional[List[Dict[str, str]]] = None
    ) -> bool:
        """
        Send Adaptive Card notification to Teams channel.
        
        Args:
            title: Card title (bold, large text)
            message: Card body message (supports markdown)
            color: Hex color for accent (without #)
                - 0078D4: Microsoft Blue (default)
                - 28A745: Success Green
                - FFC107: Warning Amber
                - DC3545: Error Red
            facts: Optional list of key-value pairs
                Example: [{"title": "Items", "value": "5"}]
            actions: Optional list of button actions
                Example: [{"title": "Open", "url": "http://..."}]
        
        Returns:
            True if sent successfully, False otherwise
        """
        try:
            card = self._create_adaptive_card(
                title=title,
                message=message,
                color=color,
                facts=facts,
                actions=actions
            )
            
            response = await self.client.post(
                self.webhook_url,
                json=card,
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code == 200:
                logger.info(f"Teams notification sent: {title}")
                return True
            else:
                logger.error(
                    f"Teams API error {response.status_code}: {response.text}"
                )
                return False
                
        except Exception as e:
            logger.error(f"Failed to send Teams notification: {e}")
            return False
    
    async def send_classification_complete(
        self,
        item_count: int,
        success_count: int,
        cost: float
    ) -> bool:
        """
        Send classification completion notification.
        
        Args:
            item_count: Total items classified
            success_count: Successfully classified items
            cost: API cost in USD
        
        Returns:
            True if sent successfully
        """
        title = "🤖 Classification Terminée"
        message = f"{success_count}/{item_count} items classifiés automatiquement"
        
        facts = [
            {"title": "Total", "value": str(item_count)},
            {"title": "Réussis", "value": str(success_count)},
            {"title": "Coût", "value": f"${cost:.4f}"}
        ]
        
        actions = [
            {
                "title": "📋 Voir les items",
                "url": "http://localhost:3000/items"
            }
        ]
        
        color = "28A745" if success_count == item_count else "FFC107"
        
        return await self.send_notification(
            title=title,
            message=message,
            color=color,
            facts=facts,
            actions=actions
        )
    
    async def send_course_generated(
        self,
        course_title: str,
        course_id: int,
        topic: str,
        duration: int
    ) -> bool:
        """
        Send course generation notification.
        
        Args:
            course_title: Generated course title
            course_id: Course database ID
            topic: Course topic/subject
            duration: Estimated duration in minutes
        
        Returns:
            True if sent successfully
        """
        title = "📚 Nouveau Cours Généré"
        message = f"**{course_title}**\n\nPrêt pour validation"
        
        facts = [
            {"title": "Sujet", "value": topic},
            {"title": "Durée", "value": f"{duration} min"},
            {"title": "ID", "value": str(course_id)}
        ]
        
        actions = [
            {
                "title": "✏️ Modifier le cours",
                "url": f"http://localhost:3000/courses/{course_id}"
            },
            {
                "title": "📋 Voir tous les cours",
                "url": "http://localhost:3000/courses"
            }
        ]
        
        return await self.send_notification(
            title=title,
            message=message,
            color="0078D4",  # Blue
            facts=facts,
            actions=actions
        )
    
    async def send_hitl_request(
        self,
        item_id: int,
        item_title: str,
        decision_type: str,
        details: Dict[str, Any]
    ) -> bool:
        """
        Send Human-in-the-Loop decision request.
        
        Args:
            item_id: Item requiring decision
            item_title: Item title
            decision_type: Type of decision (classification, course_validation, etc.)
            details: Additional context information
        
        Returns:
            True if sent successfully
        """
        title = "👤 Décision Requise (HITL)"
        message = f"**{item_title}**\n\n{decision_type}"
        
        facts = [
            {"title": "ID", "value": str(item_id)},
            {"title": "Type", "value": decision_type}
        ]
        
        # Add extra details to facts
        for key, value in details.items():
            if isinstance(value, (str, int, float)):
                facts.append({"title": key.capitalize(), "value": str(value)})
        
        actions = [
            {
                "title": "✅ Approuver",
                "url": f"http://localhost:3000/hitl?action=approve&id={item_id}"
            },
            {
                "title": "❌ Rejeter",
                "url": f"http://localhost:3000/hitl?action=reject&id={item_id}"
            },
            {
                "title": "📋 Voir HITL",
                "url": "http://localhost:3000/hitl"
            }
        ]
        
        return await self.send_notification(
            title=title,
            message=message,
            color="FFC107",  # Warning Amber
            facts=facts,
            actions=actions
        )
    
    async def send_error(
        self,
        error_message: str,
        component: str,
        details: Optional[str] = None
    ) -> bool:
        """
        Send error notification.
        
        Args:
            error_message: Brief error description
            component: System component that failed
            details: Optional detailed error information
        
        Returns:
            True if sent successfully
        """
        title = "⚠️ Erreur Système"
        message = f"**{component}**\n\n{error_message}"
        
        if details:
            message += f"\n\n```\n{details}\n```"
        
        facts = [
            {"title": "Composant", "value": component},
            {"title": "Horodatage", "value": datetime.now().strftime("%H:%M:%S")}
        ]
        
        return await self.send_notification(
            title=title,
            message=message,
            color="DC3545",  # Error Red
            facts=facts
        )
    
    async def send_new_content_detected(
        self,
        source_name: str,
        source_url: str,
        snippet: str,
        item_id: Optional[int],
        dashboard_url: str = "http://localhost:3000",
    ) -> bool:
        """
        Notify that new content has been detected on a monitored website.

        Args:
            source_name: Human-readable name of the monitored source
            source_url: URL of the page that changed
            snippet: Short excerpt of the new/changed content
            item_id: ID of the pending item created in DB (or None)
            dashboard_url: Base URL of the AcademiaOps dashboard

        Returns:
            True if sent successfully
        """
        title = "🔍 Nouveau Contenu Détecté"
        message = (
            f"Une mise à jour a été détectée sur **{source_name}**.\n\n"
            f"> {snippet}"
        )

        facts = [
            {"title": "Source", "value": source_name},
            {"title": "URL", "value": source_url},
            {"title": "Heure", "value": datetime.now().strftime("%d/%m/%Y %H:%M")},
        ]
        if item_id:
            facts.append({"title": "Item ID", "value": str(item_id)})

        actions = [
            {
                "title": "📋 Valider dans l'interface",
                "url": f"{dashboard_url}/hitl",
            },
            {
                "title": "🌐 Voir la page source",
                "url": source_url,
            },
        ]

        return await self.send_notification(
            title=title,
            message=message,
            color="6f42c1",  # Purple — distinct des autres notifs
            facts=facts,
            actions=actions,
        )

    def _create_adaptive_card(
        self,
        title: str,
        message: str,
        color: str,
        facts: Optional[List[Dict[str, str]]] = None,
        actions: Optional[List[Dict[str, str]]] = None
    ) -> Dict[str, Any]:
        """
        Create Adaptive Card JSON structure.
        
        Args:
            title: Card title
            message: Card message body
            color: Accent color (hex without #)
            facts: Optional key-value pairs
            actions: Optional button actions
        
        Returns:
            Adaptive Card JSON dict for Teams webhook
        """
        card_body = [
            {
                "type": "TextBlock",
                "text": title,
                "size": "Large",
                "weight": "Bolder",
                "color": "Accent"
            },
            {
                "type": "TextBlock",
                "text": message,
                "wrap": True,
                "spacing": "Medium"
            }
        ]
        
        # Add facts section if provided
        if facts:
            card_body.append({
                "type": "FactSet",
                "facts": facts,
                "spacing": "Medium"
            })
        
        # Build card structure
        adaptive_card = {
            "type": "AdaptiveCard",
            "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
            "version": "1.2",
            "body": card_body
        }
        
        # Add accent color stripe
        if color:
            adaptive_card["accentColor"] = color
        
        # Add action buttons if provided
        if actions:
            adaptive_card["actions"] = [
                {
                    "type": "Action.OpenUrl",
                    "title": action["title"],
                    "url": action["url"]
                }
                for action in actions
            ]
        
        # Wrap in message container for webhook
        return {
            "type": "message",
            "attachments": [
                {
                    "contentType": "application/vnd.microsoft.card.adaptive",
                    "content": adaptive_card
                }
            ]
        }
    
    async def close(self):
        """Close HTTP client connection."""
        await self.client.aclose()
        logger.info("Teams bot closed")


# Singleton instance
_teams_bot_instance: Optional[TeamsBot] = None


def get_teams_bot(webhook_url: Optional[str] = None) -> Optional[TeamsBot]:
    """
    Get or create singleton Teams bot instance.
    
    Args:
        webhook_url: Teams webhook URL (required on first call)
    
    Returns:
        TeamsBot instance or None if not configured
    """
    global _teams_bot_instance
    
    if _teams_bot_instance is None and webhook_url:
        _teams_bot_instance = TeamsBot(webhook_url)
        logger.info("Teams bot singleton created")
    
    return _teams_bot_instance


async def reset_teams_bot():
    """Reset singleton instance (for testing)."""
    global _teams_bot_instance
    if _teams_bot_instance:
        await _teams_bot_instance.close()
        _teams_bot_instance = None
        logger.info("Teams bot singleton reset")
