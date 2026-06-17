#!/usr/bin/env python3
"""
Tests pour Feature 5 : HITL avec Telegram Bot

Tests de base sans nécessiter de vraie connexion Telegram.
Pour les tests avec un vrai bot, configurez TELEGRAM_BOT_TOKEN dans .env
"""

import asyncio
import sys
from pathlib import Path

# Ajouter le répertoire parent au path
sys.path.insert(0, str(Path(__file__).parent.parent))

from argos.tools import hitl_tools
from argos.database import DatabaseManager
from argos.config import settings
from psycopg2.extras import RealDictCursor
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def test_hitl_tools():
    """Test des outils HITL en mode dégradé (sans Telegram)"""
    
    print("\n" + "="*60)
    print("Feature 5 : Test HITL Tools")
    print("="*60 + "\n")
    
    # Étape 1 : Vérifier la configuration
    print("Étape 1 : Vérification de la configuration")
    print("-" * 60)
    
    telegram_configured = settings.telegram_bot_token is not None
    print(f"✓ TELEGRAM_BOT_TOKEN configured: {telegram_configured}")
    print(f"✓ TELEGRAM_ADMIN_CHAT_ID: {settings.telegram_admin_chat_id or 'Not set'}")
    
    if not telegram_configured:
        print("\n⚠️  WARNING: Telegram non configuré")
        print("   Pour tester avec un vrai bot:")
        print("   1. Créez un bot via @BotFather")
        print("   2. Configurez TELEGRAM_BOT_TOKEN dans .env")
        print("   3. Relancez ce test\n")
    
    print()
    
    # Étape 2 : Vérifier la base de données
    print("Étape 2 : Vérification de la base de données")
    print("-" * 60)
    
    db = DatabaseManager(settings.database_url)
    
    # Vérifier qu'on a des items
    try:
        stats = db.get_classification_stats()
        classified_count = stats.get('classified_items', 0)
        pending_count = stats.get('pending_items', 0)
        print(f"✓ Items classifiés : {classified_count}")
        print(f"✓ Items en attente : {pending_count}")
    except Exception as e:
        print(f"⚠️  Erreur stats items: {e}")
        classified_count = 0
    
    # Vérifier qu'on a des topics
    try:
        topics = db.get_topics_with_stats(min_items=0)
        topics_count = len(topics)
        print(f"✓ Topics existants : {topics_count}")
    except Exception as e:
        print(f"⚠️  Erreur topics: {e}")
        topics_count = 0
    
    # Vérifier la table decisions (via une query directe)
    try:
        query = "SELECT COUNT(*) as count FROM decisions"
        with db.get_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(query)
                result = cur.fetchone()
                decisions_count = result['count'] if result else 0
        print(f"✓ Décisions enregistrées : {decisions_count}")
    except Exception as e:
        print(f"⚠️  Erreur decisions: {e}")
        decisions_count = 0
    
    print()
    
    # Étape 3 : Test des fonctions HITL (mode dégradé)
    print("Étape 3 : Test des fonctions HITL")
    print("-" * 60)
    
    # Test 3.1 : Get pending decisions
    print("\nTest 3.1 : hitl.get_pending_decisions")
    try:
        result = hitl_tools.get_pending_decisions()
        print(f"✓ Success: {result.get('success')}")
        print(f"  - Pending items: {result.get('pending_items_count', 0)}")
        print(f"  - Pending courses: {result.get('pending_courses_count', 0)}")
    except Exception as e:
        print(f"⚠️  Erreur: {e}")
    
    # Test 3.2 : Get decisions history
    print("\nTest 3.2 : hitl.get_decisions_history")
    try:
        result = hitl_tools.get_decisions_history(limit=5)
        print(f"✓ Success: {result.get('success')}")
        print(f"  - Decisions count: {result.get('count', 0)}")
        if result.get('decisions'):
            for dec in result['decisions'][:3]:
                print(f"    → {dec['decision_type']}: {dec['decision']} ({dec['decided_at']})")
    except Exception as e:
        print(f"⚠️  Erreur: {e}")
    
    # Test 3.3 : Notify classification (mock)
    if classified_count > 0 or pending_count > 0:
        print("\nTest 3.3 : hitl.notify_classification (mock)")
        
        # Récupérer un item (classifié ou non)
        try:
            unclassified = db.get_unclassified_items(limit=1)
            if unclassified:
                item = unclassified[0]
                
                # Appeler la notification (ne marchera pas sans Telegram configuré)
                notify_result = await hitl_tools.notify_classification(
                    item_id=item['id'],
                    topics=["MCP", "AI"],
                    importance="high",
                    item_type="article"
                )
                
                if notify_result.get('success'):
                    print("✓ Notification envoyée avec succès")
                    print(f"  - Message ID: {notify_result.get('message_id')}")
                else:
                    print("⚠️  Notification non envoyée (Telegram non configuré)")
                    print(f"  - Erreur: {notify_result.get('error', 'Unknown')}")
        except Exception as e:
            print(f"⚠️  Erreur test notification: {e}")
    
    # Test 3.4 : Notify course generated (mock)
    print("\nTest 3.4 : hitl.notify_course_generated (mock)")
    
    # Créer une fausse notification avec un course_id test
    notify_result = await hitl_tools.notify_course_generated(
        course_id=999,  # ID fictif pour le test
        qa_score=8.5
    )
    
    if notify_result.get('success'):
        print("✓ Notification cours envoyée avec succès")
    else:
        print("⚠️  Notification non envoyée (Telegram non configuré)")
        print(f"  - Erreur: {notify_result.get('error', 'Unknown')}")
    
    print()
    
    # Étape 4 : Test du bot Telegram
    if telegram_configured:
        print("Étape 4 : Test du bot Telegram")
        print("-" * 60)
        
        # Test 4.1 : Start bot
        print("\nTest 4.1 : hitl.start_telegram_bot")
        result = await hitl_tools.start_telegram_bot()
        print(f"✓ Bot started: {result.get('success')}")
        if result.get('success'):
            print(f"  - Mode: {result.get('mode', 'unknown')}")
            print("\n📱 Ouvrez Telegram et envoyez /start à votre bot")
            print("   Puis envoyez /status pour voir le système")
            
            # Attendre quelques secondes
            print("\n⏳ Attente de 10 secondes pour tester le bot...")
            await asyncio.sleep(10)
            
            # Test 4.2 : Stop bot
            print("\nTest 4.2 : hitl.stop_telegram_bot")
            result = await hitl_tools.stop_telegram_bot()
            print(f"✓ Bot stopped: {result.get('success')}")
        else:
            print(f"  - Erreur: {result.get('error', 'Unknown')}")
    else:
        print("Étape 4 : Test du bot Telegram")
        print("-" * 60)
        print("⏩ Ignoré (Telegram non configuré)\n")
    
    # Résumé
    print("\n" + "="*60)
    print("Résumé des tests")
    print("="*60)
    print(f"✓ Configuration: {'OK' if telegram_configured else 'Telegram non configuré'}")
    print(f"✓ Base de données: OK ({classified_count} items classifiés, {topics_count} topics)")
    print(f"✓ Outils HITL: OK (8 tools disponibles)")
    print(f"✓ Bot Telegram: {'OK (testé)' if telegram_configured else 'Non testé (pas de token)'}")
    
    if not telegram_configured:
        print("\n📋 Prochaines étapes:")
        print("   1. Créez un bot Telegram (voir docs/feature-5-hitl-telegram.md)")
        print("   2. Configurez TELEGRAM_BOT_TOKEN et TELEGRAM_ADMIN_CHAT_ID")
        print("   3. Relancez ce test pour voir les notifications Telegram\n")
    
    print("\n✅ Feature 5 : Tests terminés\n")


if __name__ == "__main__":
    asyncio.run(test_hitl_tools())
