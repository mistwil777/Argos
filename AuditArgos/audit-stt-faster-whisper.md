# Audit — faster-whisper (STT)

**Licence** : MIT. Compatible commercial.  
**Activité** : 24 600 stars, v1.2.1 (oct. 2024), 3 mainteneurs actifs. Pas de release 2025 — à surveiller.

## Dépendances
- **ctranslate2** (MIT, 4 600 stars, actif) — aucune CVE connue
- **PyAV** (FFmpeg bundlé) — pas de dépendance système FFmpeg
- **torch** : uniquement si VAD activé — peut être évité avec `vad_filter=False`

## Qualité français (WER, Common Voice FR)

| Modèle | WER FR | RAM INT8 | Latence CPU ~30s audio |
|---|---|---|---|
| tiny | ~62% | ~200 MB | ~1-2s | 
| small | ~22% | ~500 MB | ~4-6s |
| **medium** | **~13%** | **~1 GB** | **~12-18s** |
| large-v3 | ~8% | ~2 GB | ~40-60s |

**Recommandation MVP** : `small` + `int8` pour démarrer, `medium` si la précision est insuffisante.

## Intégration FastAPI

```python
from faster_whisper import WhisperModel

# Singleton au démarrage — ne JAMAIS recharger par requête
model = WhisperModel("small", device="cpu", compute_type="int8")

@app.post("/transcribe")
async def transcribe(file: UploadFile):
    segments, info = model.transcribe(tmp_path, beam_size=5, language="fr", vad_filter=True)
    return {"text": " ".join(seg.text for seg in segments)}
```

`language="fr"` obligatoire sur audios courts (évite erreurs de détection).  
`vad_filter=True` réduit les hallucinations sur les silences.

## Issues connues à surveiller
- Fuite mémoire sur transcriptions parallèles (#1055) → **ne pas paralléliser sur CPU**
- Process tué dans Docker sur petits fichiers audio (#1266) → tester en container

## Alternatives

| Outil | Verdict |
|---|---|
| **faster-whisper** | Recommandé — API Python native, INT8, PyAV bundlé |
| whisper.cpp | Plus rapide CPU pur, mais binding Python moins mature |
| insanely-fast-whisper | GPU uniquement, inutilisable |
| openai/whisper | 3-4× plus lent, maintenance mode |

## Verdict
**Intégrer.** Meilleur rapport qualité/simplicité pour FastAPI Python. `small` + `int8` + singleton + `language="fr"`.
