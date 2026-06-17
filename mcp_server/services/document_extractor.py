"""
Document extraction service for RAG attachment feature.

Supported formats:
  - PDF  — digital text via pdfplumber; scanned fallback via pdf2image + Tesseract OCR
  - Images (PNG, JPG, WEBP, TIFF, BMP) — Tesseract OCR
  - Plain text / Markdown — decoded as-is
  - DOCX — via python-docx when available

For complex diagrams / scanned documents, if a vision-capable Bedrock model is
configured (Nova Pro or Claude), it is used instead of Tesseract to produce a
structured description of the visual content.
"""

import logging
import io
import os
from typing import Optional

logger = logging.getLogger(__name__)

# Maximum characters extracted per document (avoids huge context windows)
MAX_CHARS = 12_000

# ── Helpers ────────────────────────────────────────────────────────────────

def _truncate(text: str) -> str:
    if len(text) <= MAX_CHARS:
        return text.strip()
    return text[:MAX_CHARS].strip() + f"\n\n[… document tronqué à {MAX_CHARS} caractères]"


def _is_mostly_empty(text: str, threshold: float = 0.3) -> bool:
    """Return True if extracted text is too sparse (likely scanned)."""
    chars = len(text.strip())
    return chars < 100 or (text.count('\n') > 0 and chars / max(text.count('\n'), 1) < threshold * 10)


# ── PDF extraction ─────────────────────────────────────────────────────────

def _extract_pdf_digital(pdf_bytes: bytes) -> str:
    """
    Extract text from a digital PDF using pdfplumber with adaptive spacing.
    Reconstructs word spacing from character positions to fix fused-word issues
    common in academic PDFs with complex fonts.
    """
    try:
        import pdfplumber

        def _page_to_text(page) -> str:
            """Reconstruct text from character positions with correct spacing."""
            chars = page.chars
            if not chars:
                return page.extract_text(x_tolerance=3, y_tolerance=3) or ""

            # Group by line (rounded y position)
            lines_dict: dict = {}
            for c in chars:
                y = round(float(c.get('top', 0)), 0)
                lines_dict.setdefault(y, []).append(c)

            result_lines = []
            for y in sorted(lines_dict.keys()):
                line_chars = sorted(lines_dict[y], key=lambda c: float(c.get('x0', 0)))
                text = ''
                prev_x1 = None
                for c in line_chars:
                    char = c.get('text', '')
                    if not char.strip() and char != ' ':
                        continue
                    x0 = float(c.get('x0', 0))
                    x1 = float(c.get('x1', x0 + 1))
                    char_w = max(x1 - x0, 1.0)
                    gap = (x0 - prev_x1) if prev_x1 is not None else 0
                    # Insert space if gap > 25% of current char width
                    if prev_x1 is not None and gap > char_w * 0.25:
                        text += ' '
                    text += char
                    prev_x1 = x1

                line = text.strip()
                if line:
                    result_lines.append(line)

            # Filter lines where >60% of "words" are single chars (broken font rendering)
            import re as _re
            clean_lines = []
            for line in result_lines:
                words = line.split()
                if not words:
                    continue
                single_char_ratio = sum(1 for w in words if len(w) == 1) / len(words)
                if single_char_ratio > 0.6 and len(words) > 3:
                    continue  # skip decorative/broken title lines
                clean_lines.append(line)

            return '\n'.join(clean_lines)

        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            pages = [_page_to_text(page) for page in pdf.pages]

        return "\n\n".join(p for p in pages if p.strip())

    except ImportError:
        logger.warning("pdfplumber not installed, skipping digital PDF extraction")
        return ""
    except Exception as e:
        logger.warning(f"pdfplumber extraction failed: {e}")
        return ""


def _extract_pdf_ocr(pdf_bytes: bytes) -> str:
    """OCR a scanned PDF via pdf2image + Tesseract."""
    try:
        from pdf2image import convert_from_bytes
        images = convert_from_bytes(pdf_bytes, dpi=200)
        pages = []
        for img in images:
            text = _ocr_image_pil(img)
            pages.append(text)
        return "\n\n".join(pages)
    except ImportError:
        logger.warning("pdf2image not installed, cannot OCR scanned PDF")
        return ""
    except Exception as e:
        logger.warning(f"pdf2image OCR failed: {e}")
        return ""


def extract_pdf(pdf_bytes: bytes) -> str:
    text = _extract_pdf_digital(pdf_bytes)
    if _is_mostly_empty(text):
        logger.info("PDF appears scanned — falling back to OCR")
        text = _extract_pdf_ocr(pdf_bytes)
    return _truncate(text)


# ── Image OCR ──────────────────────────────────────────────────────────────

def _ocr_image_pil(pil_image) -> str:
    """Run Tesseract OCR on a PIL Image (with basic preprocessing)."""
    try:
        import pytesseract
        from PIL import ImageFilter, ImageEnhance

        # Slight sharpening helps Tesseract on low-quality scans
        img = pil_image.convert("RGB")
        img = ImageEnhance.Contrast(img).enhance(1.5)
        img = img.filter(ImageFilter.SHARPEN)

        # Try French + English languages first; fall back to english only
        try:
            return pytesseract.image_to_string(img, lang="fra+eng", config="--psm 6")
        except Exception:
            return pytesseract.image_to_string(img, config="--psm 6")
    except ImportError:
        logger.warning("pytesseract not installed, cannot OCR image")
        return ""
    except Exception as e:
        logger.warning(f"Tesseract OCR failed: {e}")
        return ""


def extract_image(image_bytes: bytes, mime_type: str = "image/png") -> str:
    try:
        from PIL import Image
        img = Image.open(io.BytesIO(image_bytes))
        text = _ocr_image_pil(img)
        return _truncate(text)
    except ImportError:
        logger.warning("Pillow not installed")
        return ""
    except Exception as e:
        logger.warning(f"Image OCR failed: {e}")
        return ""


# ── Vision LLM for complex diagrams ───────────────────────────────────────

async def describe_image_with_vision(image_bytes: bytes, mime_type: str = "image/png") -> Optional[str]:
    """
    Use a vision-capable LLM (Claude via Bedrock or Anthropic SDK) to describe
    the content of an image — ideal for diagrams, flowcharts, technical schemas.

    Returns a structured text description, or None if no vision model is available.
    """
    try:
        import base64
        from mcp_server.config import settings

        b64 = base64.standard_b64encode(image_bytes).decode()

        if settings.llm_provider == "aws" and "claude" in (settings.aws_bedrock_model or "").lower():
            import boto3, json, asyncio

            client = boto3.client(
                "bedrock-runtime",
                region_name=settings.aws_region,
                aws_access_key_id=settings.aws_access_key_id,
                aws_secret_access_key=settings.aws_secret_access_key,
            )
            body = {
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 1500,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {"type": "base64", "media_type": mime_type, "data": b64},
                            },
                            {
                                "type": "text",
                                "text": (
                                    "Décris le contenu de cette image de manière structurée et exhaustive. "
                                    "Si c'est un schéma, un diagramme ou un tableau, extrais et explique "
                                    "toutes les informations visibles. Réponds en français."
                                ),
                            },
                        ],
                    }
                ],
            }
            response = await asyncio.to_thread(
                client.invoke_model,
                modelId=settings.aws_bedrock_model,
                body=json.dumps(body),
            )
            result = json.loads(response["body"].read())
            return result["content"][0]["text"]

        if settings.anthropic_api_key:
            import anthropic
            client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
            msg = client.messages.create(
                model="claude-3-5-sonnet-20241022",
                max_tokens=1500,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {"type": "base64", "media_type": mime_type, "data": b64},
                            },
                            {
                                "type": "text",
                                "text": (
                                    "Décris le contenu de cette image de manière structurée et exhaustive. "
                                    "Si c'est un schéma, un diagramme ou un tableau, extrais et explique "
                                    "toutes les informations visibles. Réponds en français."
                                ),
                            },
                        ],
                    }
                ],
            )
            return msg.content[0].text

    except Exception as e:
        logger.warning(f"Vision LLM description failed: {e}")

    return None


# ── DOCX ───────────────────────────────────────────────────────────────────

def extract_docx(docx_bytes: bytes) -> str:
    try:
        import docx
        doc = docx.Document(io.BytesIO(docx_bytes))
        paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
        return _truncate("\n\n".join(paragraphs))
    except ImportError:
        logger.warning("python-docx not installed")
        return ""
    except Exception as e:
        logger.warning(f"DOCX extraction failed: {e}")
        return ""


# ── Main dispatcher ────────────────────────────────────────────────────────

SUPPORTED_MIME_TYPES = {
    "application/pdf",
    "image/png", "image/jpeg", "image/jpg", "image/webp",
    "image/tiff", "image/bmp",
    "text/plain", "text/markdown",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

IMAGE_MIME_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/webp", "image/tiff", "image/bmp"}


async def extract_document(
    file_bytes: bytes,
    mime_type: str,
    filename: str = "",
    use_vision_for_images: bool = True,
) -> dict:
    """
    Extract text from a document and return a dict with:
      - text: str — extracted/OCR'd text
      - method: str — which extraction path was used
      - truncated: bool
    """
    mime_type = mime_type.lower().split(";")[0].strip()

    if mime_type == "application/pdf":
        text = extract_pdf(file_bytes)
        method = "pdf"

    elif mime_type in IMAGE_MIME_TYPES:
        text = ""
        method = "ocr"
        if use_vision_for_images:
            vision_text = await describe_image_with_vision(file_bytes, mime_type)
            if vision_text:
                text = _truncate(vision_text)
                method = "vision-llm"
        if not text:
            text = extract_image(file_bytes, mime_type)
            method = "ocr"

    elif mime_type in ("text/plain", "text/markdown"):
        try:
            text = _truncate(file_bytes.decode("utf-8", errors="replace"))
        except Exception:
            text = ""
        method = "plaintext"

    elif "wordprocessingml" in mime_type or filename.endswith(".docx"):
        text = extract_docx(file_bytes)
        method = "docx"

    else:
        # Try plain text as last resort
        try:
            text = _truncate(file_bytes.decode("utf-8", errors="replace"))
        except Exception:
            text = ""
        method = "fallback-text"

    return {
        "text": text,
        "method": method,
        "truncated": len(text) >= MAX_CHARS,
        "char_count": len(text),
    }
