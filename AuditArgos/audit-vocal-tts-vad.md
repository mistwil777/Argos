# Audit — Kokoro TTS + Silero VAD

## Kokoro TTS

**Licence** : Apache 2.0. Compatible commercial.  
**Activité** : 8 200 stars. 10 releases entre janvier et avril 2025, puis **silence depuis avril 2025**. Risque non négligeable.

### Français
- Supporté via code langue `'f'` (fr-fr), 54 voix, 8 langues
- Dépendance système obligatoire : `espeak-ng`
- Issue #223 (juin 2025) signale que le français ne fonctionnait pas correctement côté JS — à vérifier côté Python
- **Aucun score MOS publié pour le français. Test manuel obligatoire avant engagement.**

### Latence et modèle
- Architecture StyleTTS 2 + ISTFTNet (pas de diffusion) — rapide par design
- **Aucun benchmark de latence publié.** Estimation modèle : ~300-400 MB (float32)
- Python 3.10–3.12 uniquement. 3.13+ non supporté.

### Alternatives comparées

| Lib | Stars | Statut |
|---|---|---|
| **Kokoro** | 8 200 | Actif mais silence post-avril 2025 |
| Coqui TTS | 45 800 | Abandonné (dernier commit fév. 2024) |
| Piper | 11 300 | Archivé oct. 2025, migré GPL |

Piper migré sous licence GPL — incompatible avec un usage SaaS permissif.  
**Kokoro est la seule option OSS viable, mais avec des risques à valider.**

---

## Silero VAD

**Licence** : MIT. Compatible commercial.  
**Activité** : 9 800 stars, dernier commit juillet 2026. **Activement maintenu.**

### Précision (bruit léger — ESC-50)

| Outil | Accuracy ESC-50 | ROC-AUC |
|---|---|---|
| **Silero v6** | **0.87** | 0.97 |
| FireRed VAD | 0.60 | 0.94 |
| WebRTC VAD | — | 0.73 |

Chiffres auto-rapportés par l'équipe Silero — direction fiable, non audités indépendamment.

### Overhead
- < 1 ms par chunk de 30 ms (déclaré README)
- Modèle JIT : ~2 MB
- Prérequis CPU : AVX/AVX2 obligatoire — machines sans AVX = échec

```python
from silero_vad import load_silero_vad, read_audio, get_speech_timestamps
model = load_silero_vad()
wav = read_audio('audio.wav')
timestamps = get_speech_timestamps(wav, model, return_seconds=True)
```

---

## Risques à lever AVANT intégration

1. **Kokoro français** : tester manuellement sur 5 textes représentatifs (techniques, 300-500 chars)
2. **Kokoro latence** : benchmark local CPU à 500 chars avant de valider pour du synchrone
3. **Kokoro activité** : inspecter le log git HuggingFace — développement actif hors PyPI ?
4. **Silero benchmarks** : auto-rapportés, fiables en direction relative mais non audités

## Verdict

- **Silero VAD** : intégrer. Stable, maintenu, meilleur de sa catégorie.
- **Kokoro TTS** : **ne pas intégrer sans test local d'abord.** Si le français est de mauvaise qualité ou la latence inacceptable sur CPU → fallback OpenAI TTS (payant mais qualité garantie).
