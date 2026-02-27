"""
PDF Generation Service - Background PDF conversion for courses
"""

import asyncio
import logging
import markdown
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# PDF storage directory (persistent Docker volume)
PDF_STORAGE_DIR = Path("/data/lancedb/pdfs")


async def generate_pdf_background(
    course_id: int,
    title: str,
    content: str,
    force: bool = False
) -> Optional[str]:
    """
    Generate PDF for a course in background and store it.
    
    Args:
        course_id: Course ID
        title: Course title
        content: Markdown content
        force: Regenerate even if PDF exists
    
    Returns:
        Path to PDF file if successful, None otherwise
    """
    try:
        # Ensure storage directory exists
        PDF_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
        
        pdf_path = PDF_STORAGE_DIR / f"course_{course_id}.pdf"
        
        # Skip if already exists (unless forced)
        if pdf_path.exists() and not force:
            logger.info(f"PDF already exists for course {course_id}: {pdf_path}")
            return str(pdf_path)
        
        logger.info(f"🎨 Generating PDF for course {course_id} in background...")
        
        # Convert markdown to HTML
        html_body = markdown.markdown(
            content,
            extensions=['extra', 'codehilite', 'tables', 'fenced_code']
        )
        
        html_content = _generate_html_template(title, html_body)
        
        # Try WeasyPrint conversion
        from weasyprint import HTML
        
        # Run in thread to avoid blocking
        await asyncio.to_thread(
            lambda: HTML(string=html_content).write_pdf(str(pdf_path))
        )
        
        logger.info(f"✅ PDF generated successfully: {pdf_path}")
        return str(pdf_path)
        
    except ImportError as e:
        logger.warning(f"WeasyPrint not available for course {course_id}: {e}")
        return None
    except Exception as e:
        logger.error(f"❌ Failed to generate PDF for course {course_id}: {e}", exc_info=True)
        return None


def get_pdf_path(course_id: int) -> Optional[Path]:
    """
    Check if PDF exists for a course.
    
    Args:
        course_id: Course ID
    
    Returns:
        Path to PDF if exists, None otherwise
    """
    pdf_path = PDF_STORAGE_DIR / f"course_{course_id}.pdf"
    return pdf_path if pdf_path.exists() else None


def generate_html_export(title: str, content: str) -> str:
    """
    Generate standalone HTML for export/fallback.
    
    Args:
        title: Course title
        content: Markdown content
    
    Returns:
        Complete HTML document
    """
    html_body = markdown.markdown(
        content,
        extensions=['extra', 'codehilite', 'tables', 'fenced_code']
    )
    return _generate_html_template(title, html_body)


def _generate_html_template(title: str, html_body: str) -> str:
    """Generate styled HTML template for PDF/export."""
    return f"""<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <style>
        @page {{
            size: A4;
            margin: 2cm;
        }}
        body {{ 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            line-height: 1.7;
            color: #1f2937;
            max-width: 100%;
            padding: 20px;
            margin: 0 auto;
            background: white;
        }}
        h1 {{ 
            color: #2563eb; 
            border-bottom: 3px solid #2563eb; 
            padding-bottom: 10px;
            margin-top: 0;
            page-break-after: avoid;
            font-size: 2.2em;
        }}
        h2 {{ 
            color: #1e40af; 
            border-left: 4px solid #2563eb; 
            padding-left: 15px; 
            margin-top: 30px;
            page-break-after: avoid;
            font-size: 1.8em;
        }}
        h3 {{ 
            color: #1e3a8a; 
            margin-top: 20px;
            page-break-after: avoid;
            font-size: 1.4em;
        }}
        p {{
            margin: 12px 0;
            orphans: 3;
            widows: 3;
            text-align: justify;
        }}
        code {{ 
            background: #f3f4f6; 
            padding: 3px 8px; 
            border-radius: 4px; 
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
            font-size: 0.9em;
            color: #d97706;
        }}
        pre {{ 
            background: #1f2937; 
            color: #f9fafb; 
            padding: 16px; 
            border-radius: 6px; 
            overflow-x: auto;
            page-break-inside: avoid;
            margin: 20px 0;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }}
        pre code {{
            background: none;
            padding: 0;
            color: #f9fafb;
        }}
        ul, ol {{
            margin: 12px 0;
            padding-left: 35px;
        }}
        li {{
            margin: 6px 0;
        }}
        blockquote {{
            border-left: 4px solid #3b82f6;
            padding-left: 20px;
            margin: 20px 0;
            color: #6b7280;
            font-style: italic;
            background: #f9fafb;
            padding: 15px 20px;
            border-radius: 4px;
        }}
        table {{
            border-collapse: collapse;
            width: 100%;
            margin: 20px 0;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }}
        th, td {{
            border: 1px solid #e5e7eb;
            padding: 10px 14px;
            text-align: left;
        }}
        th {{
            background: #f3f4f6;
            font-weight: 600;
            color: #1f2937;
        }}
        tr:nth-child(even) {{
            background: #f9fafb;
        }}
        .page-break {{
            page-break-before: always;
        }}
        @media print {{
            body {{
                padding: 0;
            }}
            pre {{
                page-break-inside: avoid;
            }}
        }}
    </style>
</head>
<body>
    <h1>{title}</h1>
    {html_body}
</body>
</html>"""
