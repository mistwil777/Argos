"""
Telegram Bot Service for HITL (Human-in-the-Loop)

Handles:
- Sending notifications to admin
- Interactive buttons (Approve/Reject)
- Forwarding decisions back to system
"""

import logging
from typing import Dict, Optional, List
from datetime import datetime

from telegram import Bot, InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, ContextTypes
from telegram.constants import ParseMode

from mcp_server.config import settings
from mcp_server.database import DatabaseManager

logger = logging.getLogger(__name__)


class TelegramBotService:
    """Service for Telegram bot interactions."""
    
    def __init__(
        self,
        bot_token: str,
        admin_chat_id: str,
        db_manager: DatabaseManager
    ):
        """
        Initialize Telegram bot service.
        
        Args:
            bot_token: Telegram bot token from @BotFather
            admin_chat_id: Admin's Telegram chat ID
            db_manager: Database manager instance
        """
        self.bot_token = bot_token
        self.admin_chat_id = admin_chat_id
        self.db = db_manager
        
        # Initialize bot
        self.bot = Bot(token=bot_token)
        self.application = None  # Will be initialized when starting polling
        
        logger.info(
            f"TelegramBotService initialized",
            extra={"admin_chat_id": admin_chat_id}
        )
    
    # ============================================
    # Notification Methods
    # ============================================
    
    async def notify_new_item(self, item: Dict) -> bool:
        """
        Send notification for newly collected item.
        
        Args:
            item: Item dict with id, title, summary, url
        
        Returns:
            True if notification sent successfully
        """
        item_id = item["id"]
        title = item["title"]
        summary = item.get("summary", "")[:300]  # Truncate
        url = item.get("url", "")
        source = item.get("source_name", "Unknown")
        
        message = f"""
🆕 <b>Nouvel Item Collecté</b>

<b>Titre:</b> {title}

<b>Source:</b> {source}

<b>Résumé:</b>
{summary}...

<b>URL:</b> {url}

<i>Item #{item_id} - En attente de classification</i>
"""
        
        try:
            await self.bot.send_message(
                chat_id=self.admin_chat_id,
                text=message,
                parse_mode=ParseMode.HTML,
                disable_web_page_preview=True
            )
            logger.info(f"Sent new item notification for item {item_id}")
            return True
        
        except Exception as e:
            logger.error(f"Failed to send new item notification: {e}", exc_info=True)
            return False
    
    async def notify_classification_complete(
        self,
        item_id: int,
        topics: List[str],
        importance: str,
        item_type: str
    ) -> bool:
        """
        Send notification after item classification with validation buttons.
        
        Args:
            item_id: Item identifier
            topics: Classified topics
            importance: Importance level
            item_type: Type of content
        
        Returns:
            True if notification sent successfully
        """
        # Get item details
        item = self.db.get_item_by_id(item_id)
        if not item:
            logger.warning(f"Item {item_id} not found")
            return False
        
        topics_text = ", ".join(topics)
        
        message = f"""
✅ <b>Classification Complétée</b>

<b>Item:</b> {item['title']}

<b>Topics:</b> {topics_text}
<b>Importance:</b> {importance.upper()} 
<b>Type:</b> {item_type}

<b>URL:</b> {item.get('url', 'N/A')}

<i>Validez ou rejetez cette classification:</i>
"""
        
        # Create inline keyboard with Approve/Reject buttons
        keyboard = [
            [
                InlineKeyboardButton("✅ Approuver", callback_data=f"approve_class_{item_id}"),
                InlineKeyboardButton("❌ Rejeter", callback_data=f"reject_class_{item_id}")
            ]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        try:
            await self.bot.send_message(
                chat_id=self.admin_chat_id,
                text=message,
                parse_mode=ParseMode.HTML,
                reply_markup=reply_markup,
                disable_web_page_preview=True
            )
            logger.info(f"Sent classification notification for item {item_id}")
            return True
        
        except Exception as e:
            logger.error(f"Failed to send classification notification: {e}", exc_info=True)
            return False
    
    async def notify_course_generated(self, course_id: int, qa_score: Optional[float] = None) -> bool:
        """
        Send notification after course generation with review buttons.
        
        Args:
            course_id: Course identifier
            qa_score: Optional QA score
        
        Returns:
            True if notification sent successfully
        """
        # Get course details
        course = self.db.get_course_by_id(course_id)
        if not course:
            logger.warning(f"Course {course_id} not found")
            return False
        
        qa_text = f"QA Score: {qa_score}/10" if qa_score else "Non évalué"
        
        message = f"""
📚 <b>Nouveau Cours Généré</b>

<b>Titre:</b> {course['title']}

<b>Sujet:</b> {course['subject']}
<b>Niveau:</b> {course['level']}
<b>Durée estimée:</b> {course['estimated_duration_minutes']} min

<b>Qualité:</b> {qa_text}

<i>Voulez-vous publier ce cours ?</i>
"""
        
        # Create inline keyboard
        keyboard = [
            [
                InlineKeyboardButton("📖 Voir le cours", callback_data=f"view_course_{course_id}"),
            ],
            [
                InlineKeyboardButton("✅ Publier", callback_data=f"publish_course_{course_id}"),
                InlineKeyboardButton("📝 Revoir", callback_data=f"review_course_{course_id}"),
                InlineKeyboardButton("🗑 Rejeter", callback_data=f"reject_course_{course_id}")
            ]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        try:
            await self.bot.send_message(
                chat_id=self.admin_chat_id,
                text=message,
                parse_mode=ParseMode.HTML,
                reply_markup=reply_markup
            )
            logger.info(f"Sent course notification for course {course_id}")
            return True
        
        except Exception as e:
            logger.error(f"Failed to send course notification: {e}", exc_info=True)
            return False
    
    async def notify_rag_query(
        self,
        query: str,
        answer: str,
        confidence: float,
        sources_count: int
    ) -> bool:
        """
        Send RAG query result to admin for feedback.
        
        Args:
            query: User's question
            answer: Generated answer
            confidence: Confidence score
            sources_count: Number of sources used
        
        Returns:
            True if notification sent successfully
        """
        answer_preview = answer[:500] + "..." if len(answer) > 500 else answer
        
        message = f"""
🤖 <b>Question RAG</b>

<b>Question:</b> {query}

<b>Réponse:</b>
{answer_preview}

<b>Confiance:</b> {confidence:.2f}/1.0
<b>Sources:</b> {sources_count} chunks

<i>Cette réponse est-elle satisfaisante ?</i>
"""
        
        # Create feedback buttons
        keyboard = [
            [
                InlineKeyboardButton("👍 Bonne réponse", callback_data=f"rag_good_{hash(query)%10000}"),
                InlineKeyboardButton("👎 Mauvaise réponse", callback_data=f"rag_bad_{hash(query)%10000}")
            ]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        try:
            await self.bot.send_message(
                chat_id=self.admin_chat_id,
                text=message,
                parse_mode=ParseMode.HTML,
                reply_markup=reply_markup
            )
            logger.info(f"Sent RAG query notification")
            return True
        
        except Exception as e:
            logger.error(f"Failed to send RAG notification: {e}", exc_info=True)
            return False
    
    # ============================================
    # Callback Handlers
    # ============================================
    
    async def handle_callback(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """
        Handle button callbacks from Telegram.
        
        Callback data format:
        - approve_class_{item_id}
        - reject_class_{item_id}
        - publish_course_{course_id}
        - review_course_{course_id}
        - reject_course_{course_id}
        - view_course_{course_id}
        - rag_good_{query_hash}
        - rag_bad_{query_hash}
        """
        query = update.callback_query
        await query.answer()
        
        callback_data = query.data
        logger.info(f"Received callback: {callback_data}")
        
        try:
            # Parse callback data
            if callback_data.startswith("approve_class_"):
                item_id = int(callback_data.replace("approve_class_", ""))
                await self._handle_approve_classification(query, item_id)
            
            elif callback_data.startswith("reject_class_"):
                item_id = int(callback_data.replace("reject_class_", ""))
                await self._handle_reject_classification(query, item_id)
            
            elif callback_data.startswith("publish_course_"):
                course_id = int(callback_data.replace("publish_course_", ""))
                await self._handle_publish_course(query, course_id)
            
            elif callback_data.startswith("review_course_"):
                course_id = int(callback_data.replace("review_course_", ""))
                await self._handle_review_course(query, course_id)
            
            elif callback_data.startswith("reject_course_"):
                course_id = int(callback_data.replace("reject_course_", ""))
                await self._handle_reject_course(query, course_id)
            
            elif callback_data.startswith("view_course_"):
                course_id = int(callback_data.replace("view_course_", ""))
                await self._handle_view_course(query, course_id)
            
            elif callback_data.startswith("rag_good_") or callback_data.startswith("rag_bad_"):
                feedback = "positive" if "good" in callback_data else "negative"
                await self._handle_rag_feedback(query, feedback)
            
            else:
                logger.warning(f"Unknown callback data: {callback_data}")
                await query.edit_message_text("⚠️ Action inconnue")
        
        except Exception as e:
            logger.error(f"Error handling callback: {e}", exc_info=True)
            await query.edit_message_text("❌ Erreur lors du traitement")
    
    async def _handle_approve_classification(self, query, item_id: int):
        """Approve item classification."""
        # Update item status in database
        decision_sql = """
            INSERT INTO decisions (
                item_id, decision_type, decision, decided_by, decided_at
            )
            VALUES (%s, 'item_validation', 'approved', 'telegram_admin', NOW())
        """
        
        with self.db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(decision_sql, (item_id,))
        
        await query.edit_message_text(
            f"✅ Classification approuvée pour l'item #{item_id}\n\n"
            f"L'item peut maintenant être utilisé pour générer des cours."
        )
        logger.info(f"Classification approved for item {item_id}")
    
    async def _handle_reject_classification(self, query, item_id: int):
        """Reject item classification."""
        # Update item status
        decision_sql = """
            INSERT INTO decisions (
                item_id, decision_type, decision, decided_by, decided_at
            )
            VALUES (%s, 'item_validation', 'rejected', 'telegram_admin', NOW())
        """
        
        with self.db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(decision_sql, (item_id,))
        
        await query.edit_message_text(
            f"❌ Classification rejetée pour l'item #{item_id}\n\n"
            f"L'item sera ignoré."
        )
        logger.info(f"Classification rejected for item {item_id}")
    
    async def _handle_publish_course(self, query, course_id: int):
        """Publish course."""
        # Update course status to published
        update_sql = """
            UPDATE courses
            SET status = 'published', updated_at = NOW()
            WHERE id = %s
        """
        
        with self.db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(update_sql, (course_id,))
        
        # Log decision
        decision_sql = """
            INSERT INTO decisions (
                course_id, decision_type, decision, decided_by, decided_at
            )
            VALUES (%s, 'course_generation', 'published', 'telegram_admin', NOW())
        """
        
        with self.db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(decision_sql, (course_id,))
        
        await query.edit_message_text(
            f"✅ Cours #{course_id} publié !\n\n"
            f"Le cours est maintenant disponible."
        )
        logger.info(f"Course {course_id} published")
    
    async def _handle_review_course(self, query, course_id: int):
        """Mark course for review."""
        update_sql = """
            UPDATE courses
            SET status = 'review', updated_at = NOW()
            WHERE id = %s
        """
        
        with self.db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(update_sql, (course_id,))
        
        await query.edit_message_text(
            f"📝 Cours #{course_id} marqué pour révision\n\n"
            f"Statut: En révision"
        )
        logger.info(f"Course {course_id} marked for review")
    
    async def _handle_reject_course(self, query, course_id: int):
        """Reject course."""
        update_sql = """
            UPDATE courses
            SET status = 'archived', updated_at = NOW()
            WHERE id = %s
        """
        
        with self.db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(update_sql, (course_id,))
        
        decision_sql = """
            INSERT INTO decisions (
                course_id, decision_type, decision, decided_by, decided_at
            )
            VALUES (%s, 'course_generation', 'rejected', 'telegram_admin', NOW())
        """
        
        with self.db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(decision_sql, (course_id,))
        
        await query.edit_message_text(
            f"❌ Cours #{course_id} rejeté\n\n"
            f"Le cours a été archivé."
        )
        logger.info(f"Course {course_id} rejected")
    
    async def _handle_view_course(self, query, course_id: int):
        """Send course preview."""
        course = self.db.get_course_by_id(course_id)
        
        if not course:
            await query.edit_message_text(f"❌ Cours #{course_id} introuvable")
            return
        
        # Send course preview (first 500 chars of content)
        content_preview = course['content'][:500] + "..."
        
        message = f"""
📚 <b>Aperçu du Cours #{course_id}</b>

<b>Titre:</b> {course['title']}
<b>Sujet:</b> {course['subject']}
<b>Niveau:</b> {course['level']}

<b>Contenu (extrait):</b>
{content_preview}

<i>Utilisez les boutons pour publier/réviser/rejeter</i>
"""
        
        await query.message.reply_text(
            text=message,
            parse_mode=ParseMode.HTML
        )
    
    async def _handle_rag_feedback(self, query, feedback: str):
        """Log RAG feedback."""
        await query.edit_message_text(
            f"{'👍' if feedback == 'positive' else '👎'} Merci pour votre retour !\n\n"
            f"Feedback enregistré: {feedback}"
        )
        logger.info(f"RAG feedback received: {feedback}")
    
    # ============================================
    # Command Handlers
    # ============================================
    
    async def cmd_start(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /start command."""
        await update.message.reply_text(
            "🤖 <b>AcademiaOps Bot</b>\n\n"
            "Je vous notifie des nouveaux items, classifications et cours générés.\n\n"
            "<b>Commandes:</b>\n"
            "/status - Statut du système\n"
            "/stats - Statistiques\n"
            "/help - Aide",
            parse_mode=ParseMode.HTML
        )
    
    async def cmd_status(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /status command."""
        # Get system stats from database
        stats_sql = """
            SELECT
                (SELECT COUNT(*) FROM items WHERE classification_status = 'pending') as pending_items,
                (SELECT COUNT(*) FROM items WHERE classification_status = 'classified') as classified_items,
                (SELECT COUNT(*) FROM courses WHERE status = 'draft') as draft_courses,
                (SELECT COUNT(*) FROM courses WHERE status = 'published') as published_courses
        """
        
        with self.db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(stats_sql)
                row = cur.fetchone()
        
        message = f"""
📊 <b>Statut du Système</b>

<b>Items:</b>
- En attente: {row[0]}
- Classifiés: {row[1]}

<b>Cours:</b>
- Brouillon: {row[2]}
- Publiés: {row[3]}
"""
        
        await update.message.reply_text(message, parse_mode=ParseMode.HTML)
    
    async def cmd_help(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /help command."""
        await update.message.reply_text(
            "<b>Aide AcademiaOps Bot</b>\n\n"
            "Ce bot vous envoie des notifications pour:\n"
            "• Nouveaux items collectés\n"
            "• Classifications complétées\n"
            "• Cours générés\n"
            "• Questions RAG\n\n"
            "Utilisez les boutons pour approuver/rejeter.",
            parse_mode=ParseMode.HTML
        )
    
    # ============================================
    # Bot Lifecycle
    # ============================================
    
    async def start_polling(self):
        """Start bot in polling mode (for development)."""
        if self.application is not None:
            logger.warning("Bot already running")
            return
        
        # Build application
        self.application = (
            Application.builder()
            .token(self.bot_token)
            .build()
        )
        
        # Register handlers
        self.application.add_handler(CommandHandler("start", self.cmd_start))
        self.application.add_handler(CommandHandler("status", self.cmd_status))
        self.application.add_handler(CommandHandler("help", self.cmd_help))
        self.application.add_handler(CallbackQueryHandler(self.handle_callback))
        
        # Start polling
        await self.application.initialize()
        await self.application.start()
        await self.application.updater.start_polling()
        
        logger.info("Telegram bot started in polling mode")
    
    async def stop_polling(self):
        """Stop bot polling."""
        if self.application is None:
            return
        
        await self.application.updater.stop()
        await self.application.stop()
        await self.application.shutdown()
        
        self.application = None
        logger.info("Telegram bot stopped")


# ============================================
# Singleton Instance
# ============================================

_telegram_bot: Optional[TelegramBotService] = None


def get_telegram_bot() -> Optional[TelegramBotService]:
    """Get Telegram bot instance (if configured)."""
    global _telegram_bot
    
    if _telegram_bot is not None:
        return _telegram_bot
    
    # Check if Telegram is configured
    if not settings.telegram_bot_token or not settings.telegram_admin_chat_id:
        logger.warning("Telegram not configured (missing bot_token or admin_chat_id)")
        return None
    
    # Initialize bot
    db = DatabaseManager(settings.database_url)
    _telegram_bot = TelegramBotService(
        bot_token=settings.telegram_bot_token,
        admin_chat_id=settings.telegram_admin_chat_id,
        db_manager=db
    )
    
    logger.info("Telegram bot service initialized")
    return _telegram_bot
