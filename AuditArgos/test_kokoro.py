import time, sys, os

# Textes représentatifs du cas d'usage réel
TEXTS = [
    # Court — notification / alerte
    ("court_alerte", "Anthropic vient de publier Claude 3.7 avec une fenêtre de contexte de deux cents mille tokens."),
    # Moyen — résumé d'article technique
    ("moyen_technique", "La nouvelle architecture de Mistral utilise un mécanisme d'attention sparse qui réduit la complexité quadratique du transformeur classique. Cette approche permet de traiter des séquences de trente-deux mille tokens avec une consommation mémoire divisée par quatre, sans dégradation mesurable sur les benchmarks MMLU et HumanEval."),
    # Long — briefing complet
    ("long_briefing", "Voici le briefing du vingt-neuf juillet deux mille vingt-six. Cette semaine, trois événements majeurs ont marqué l'actualité de l'intelligence artificielle. Premièrement, Anthropic a annoncé la disponibilité générale de l'API Claude pour les applications d'entreprise, avec des garanties de conformité RGPD et un SLA de quatre-vingt-dix-neuf virgule neuf pourcent. Deuxièmement, Mistral AI a publié Mixtral-8x22B en open source sous licence Apache 2.0, surpassant GPT-4 sur plusieurs benchmarks de raisonnement mathématique. Troisièmement, la Commission Européenne a ouvert une consultation publique sur la réglementation des systèmes d'IA génératives utilisés dans des contextes critiques, notamment la santé et la finance."),
]

def test_kokoro():
    print("=== TEST KOKORO TTS ===\n")
    print(f"Python : {sys.version}")

    try:
        from kokoro import KPipeline
    except ImportError as e:
        print(f"ERREUR import : {e}")
        sys.exit(1)

    print("Import OK\n")

    # Init pipeline français
    t0 = time.time()
    try:
        pipeline = KPipeline(lang_code='f')  # fr-fr
        init_time = time.time() - t0
        print(f"Init pipeline : {init_time:.2f}s\n")
    except Exception as e:
        print(f"ERREUR init pipeline français : {e}")
        sys.exit(1)

    results = []

    for name, text in TEXTS:
        print(f"--- {name} ---")
        print(f"Texte ({len(text)} chars) : {text[:80]}...")

        t0 = time.time()
        try:
            audio_chunks = []
            for samples, sample_rate, _ in pipeline(text, voice='ff_siwis'):
                audio_chunks.append(samples)
            latency = time.time() - t0

            total_samples = sum(len(c) for c in audio_chunks)
            duration_audio = total_samples / 24000  # Kokoro output = 24kHz

            print(f"Latence synthèse : {latency:.2f}s")
            print(f"Durée audio généré : {duration_audio:.1f}s")
            print(f"Ratio temps réel : {latency/duration_audio:.2f}x (< 1.0 = plus rapide que temps réel)")
            results.append((name, latency, duration_audio, "OK"))
        except Exception as e:
            print(f"ERREUR synthèse : {e}")
            results.append((name, None, None, str(e)))
        print()

    print("=== SYNTHÈSE ===")
    for name, latency, duration, status in results:
        if latency:
            print(f"{name:20s} | {latency:.2f}s latence | {duration:.1f}s audio | ratio {latency/duration:.2f}x | {status}")
        else:
            print(f"{name:20s} | ECHEC : {status}")

if __name__ == "__main__":
    test_kokoro()
