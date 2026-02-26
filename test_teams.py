"""
Script de test pour l'intégration Microsoft Teams
Execute: python test_teams.py
"""

import asyncio
import os
import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

from dotenv import load_dotenv
from mcp_server.services.teams_bot import TeamsBot

# Load environment variables
load_dotenv()


async def test_teams_integration():
    """Test complet de l'intégration Microsoft Teams."""
    
    print("=" * 60)
    print("🧪 TEST D'INTÉGRATION MICROSOFT TEAMS - ACADEMIAOPS")
    print("=" * 60)
    print()
    
    # Check webhook URL configuration
    webhook_url = os.getenv("TEAMS_WEBHOOK_URL")
    
    if not webhook_url:
        print("❌ ERREUR: TEAMS_WEBHOOK_URL n'est pas configuré dans .env")
        print()
        print("Pour configurer Teams:")
        print("1. Ouvrez Teams → Canal → ... → Connecteurs")
        print("2. Recherchez 'Incoming Webhook' → Configurer")
        print("3. Copiez l'URL générée")
        print("4. Ajoutez dans .env:")
        print("   TEAMS_WEBHOOK_URL=https://votre-webhook-url")
        print()
        return False
    
    print(f"✅ Webhook URL configuré: {webhook_url[:50]}...")
    print()
    
    # Initialize Teams bot
    print("📡 Initialisation du bot Teams...")
    bot = TeamsBot(webhook_url)
    print("✅ Bot initialisé")
    print()
    
    # Test 1: Simple notification
    print("-" * 60)
    print("TEST 1: Notification simple")
    print("-" * 60)
    
    try:
        success = await bot.send_notification(
            title="🧪 Test AcademiaOps",
            message="Si vous voyez ce message, l'intégration Teams fonctionne correctement ! 🎉",
            color="28A745"  # Success Green
        )
        
        if success:
            print("✅ Notification simple envoyée avec succès")
        else:
            print("❌ Échec de l'envoi de la notification simple")
            return False
    except Exception as e:
        print(f"❌ Erreur lors de l'envoi: {e}")
        return False
    
    print()
    await asyncio.sleep(1)  # Pause entre les tests
    
    # Test 2: Notification avec facts et actions
    print("-" * 60)
    print("TEST 2: Notification avec détails (Facts + Actions)")
    print("-" * 60)
    
    try:
        success = await bot.send_notification(
            title="📊 Rapport de Classification",
            message="5 items ont été classifiés automatiquement par le système.\n\nLe coût total est très faible grâce à AWS Bedrock Nova Pro.",
            color="0078D4",  # Microsoft Blue
            facts=[
                {"title": "Items total", "value": "5"},
                {"title": "Réussis", "value": "5"},
                {"title": "Échecs", "value": "0"},
                {"title": "Coût API", "value": "$0.003"}
            ],
            actions=[
                {"title": "📋 Voir les items", "url": "http://localhost:3000/items"},
                {"title": "🤖 Classifier d'autres items", "url": "http://localhost:3000/items"}
            ]
        )
        
        if success:
            print("✅ Notification avec détails envoyée avec succès")
        else:
            print("❌ Échec de l'envoi de la notification détaillée")
            return False
    except Exception as e:
        print(f"❌ Erreur lors de l'envoi: {e}")
        return False
    
    print()
    await asyncio.sleep(1)
    
    # Test 3: Notification de cours généré
    print("-" * 60)
    print("TEST 3: Notification de cours généré")
    print("-" * 60)
    
    try:
        success = await bot.send_course_generated(
            course_title="Introduction to Machine Learning with Python",
            course_id=123,
            topic="AI/ML",
            duration=180
        )
        
        if success:
            print("✅ Notification de cours envoyée avec succès")
        else:
            print("❌ Échec de l'envoi de la notification de cours")
            return False
    except Exception as e:
        print(f"❌ Erreur lors de l'envoi: {e}")
        return False
    
    print()
    await asyncio.sleep(1)
    
    # Test 4: Notification HITL (décision requise)
    print("-" * 60)
    print("TEST 4: Notification HITL (Human-in-the-Loop)")
    print("-" * 60)
    
    try:
        success = await bot.send_hitl_request(
            item_id=456,
            item_title="GPT-5 Release Date Announced by OpenAI",
            decision_type="classification",
            details={
                "confidence": "0.72",
                "suggested_subject": "AI News",
                "source": "TechCrunch"
            }
        )
        
        if success:
            print("✅ Notification HITL envoyée avec succès")
        else:
            print("❌ Échec de l'envoi de la notification HITL")
            return False
    except Exception as e:
        print(f"❌ Erreur lors de l'envoi: {e}")
        return False
    
    print()
    await asyncio.sleep(1)
    
    # Test 5: Notification d'erreur
    print("-" * 60)
    print("TEST 5: Notification d'erreur système")
    print("-" * 60)
    
    try:
        success = await bot.send_error(
            error_message="Impossible de se connecter à l'API AWS Bedrock",
            component="Classification Module",
            details="ConnectionError: Timeout after 30s\nEndpoint: bedrock-runtime.us-east-1.amazonaws.com"
        )
        
        if success:
            print("✅ Notification d'erreur envoyée avec succès")
        else:
            print("❌ Échec de l'envoi de la notification d'erreur")
            return False
    except Exception as e:
        print(f"❌ Erreur lors de l'envoi: {e}")
        return False
    
    print()
    
    # Close bot
    await bot.close()
    
    # Final summary
    print("=" * 60)
    print("✅ TOUS LES TESTS RÉUSSIS !")
    print("=" * 60)
    print()
    print("Vérifiez votre canal Teams, vous devriez avoir reçu 5 messages:")
    print("  1. ✅ Notification simple (verte)")
    print("  2. 📊 Rapport de classification (bleue, avec facts et boutons)")
    print("  3. 📚 Cours généré (bleue)")
    print("  4. 👤 Décision HITL requise (orange)")
    print("  5. ⚠️  Erreur système (rouge)")
    print()
    print("Prochaines étapes:")
    print("  • Configurez les workflows n8n (voir TEAMS_SETUP.md)")
    print("  • Importez les workflows dans n8n (localhost:5678)")
    print("  • Activez les workflows automatiques")
    print()
    
    return True


async def main():
    """Entry point."""
    try:
        success = await test_teams_integration()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n⚠️  Test interrompu par l'utilisateur")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ ERREUR INATTENDUE: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
