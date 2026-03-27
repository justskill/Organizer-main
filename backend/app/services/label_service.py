"""Label service — QR code generation, PDF label rendering, code resolution."""

import io
import uuid
from pathlib import Path

import qrcode
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import mm, inch
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.item import Item
from app.models.label import LabelRecord
from app.models.location import Location


def generate_qr_code(payload: str, box_size: int = 10) -> bytes:
    """Generate a QR code image as PNG bytes."""
    qr = qrcode.QRCode(version=1, box_size=box_size, border=2)
    qr.add_data(payload)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Avery 5260 layout constants (1" x 2-5/8", 30 labels, 3x10 on US Letter)
# ---------------------------------------------------------------------------
AVERY5260_PAGE_W, AVERY5260_PAGE_H = letter  # 8.5" x 11"
AVERY5260_LABEL_W = 2.625 * inch
AVERY5260_LABEL_H = 1.0 * inch
AVERY5260_COLS = 3
AVERY5260_ROWS = 10
AVERY5260_TOP_MARGIN = 0.5 * inch
AVERY5260_LEFT_MARGIN = 0.1875 * inch  # 3/16"
AVERY5260_COL_GAP = 0.125 * inch  # 1/8" horizontal gutter


def _draw_avery5260_label(c: canvas.Canvas, x: float, y: float, entity_type: str, name: str, short_code: str, qr_payload: str, text_scale: float = 1.0):
    """Draw a single label at position (x, y) = bottom-left of label cell."""
    qr_bytes = generate_qr_code(qr_payload, box_size=6)
    qr_img = ImageReader(io.BytesIO(qr_bytes))

    padding = 3
    qr_size = AVERY5260_LABEL_H - 2 * padding

    # QR code on the left
    c.drawImage(qr_img, x + padding, y + padding, width=qr_size, height=qr_size)

    # Text to the right of QR
    text_x = x + padding + qr_size + 4
    text_max_w = AVERY5260_LABEL_W - qr_size - padding * 2 - 8

    # Entity type
    type_size = 6 * text_scale
    c.setFont("Helvetica-Bold", type_size)
    c.drawString(text_x, y + AVERY5260_LABEL_H - 12, entity_type.upper())

    # Name (truncate to fit)
    name_size = 7 * text_scale
    c.setFont("Helvetica", name_size)
    display_name = name
    while c.stringWidth(display_name, "Helvetica", name_size) > text_max_w and len(display_name) > 3:
        display_name = display_name[:-4] + "..."
    c.drawString(text_x, y + AVERY5260_LABEL_H - 24, display_name)

    # Short code
    code_size = 7 * text_scale
    c.setFont("Courier", code_size)
    c.drawString(text_x, y + AVERY5260_LABEL_H - 36, short_code)


def render_avery5260_sheet(labels: list[dict], start_cell: int = 1, text_scale: float = 1.0) -> bytes:
    """Render labels onto Avery 5260 sheet(s).

    labels: list of {entity_type, name, short_code, qr_payload}
    start_cell: 1-based cell number to start at (1-30), skipping earlier cells.
    text_scale: multiplier for text size (e.g. 0.8 = small, 1.0 = normal, 1.2 = large).
    """
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(AVERY5260_PAGE_W, AVERY5260_PAGE_H))

    cell_idx = start_cell - 1  # 0-based
    label_idx = 0

    while label_idx < len(labels):
        # Start new page if needed
        if cell_idx >= AVERY5260_COLS * AVERY5260_ROWS:
            c.showPage()
            cell_idx = 0

        row = cell_idx // AVERY5260_COLS
        col = cell_idx % AVERY5260_COLS

        x = AVERY5260_LEFT_MARGIN + col * (AVERY5260_LABEL_W + AVERY5260_COL_GAP)
        # y from top: row 0 is at top
        y = AVERY5260_PAGE_H - AVERY5260_TOP_MARGIN - (row + 1) * AVERY5260_LABEL_H

        lbl = labels[label_idx]
        _draw_avery5260_label(
            c, x, y,
            entity_type=lbl["entity_type"],
            name=lbl["name"],
            short_code=lbl["short_code"],
            qr_payload=lbl["qr_payload"],
            text_scale=text_scale,
        )

        cell_idx += 1
        label_idx += 1

    c.showPage()
    c.save()
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Avery 18163 layout constants (2" x 4", 10 labels, 2x5 on US Letter)
# ---------------------------------------------------------------------------
AVERY18163_PAGE_W, AVERY18163_PAGE_H = letter
AVERY18163_LABEL_W = 4.0 * inch
AVERY18163_LABEL_H = 2.0 * inch
AVERY18163_COLS = 2
AVERY18163_ROWS = 5
AVERY18163_TOP_MARGIN = 0.5 * inch
AVERY18163_LEFT_MARGIN = 0.15 * inch
AVERY18163_COL_GAP = 0.18 * inch


def _draw_avery18163_label(
    c: canvas.Canvas, x: float, y: float,
    entity_type: str, name: str, short_code: str, qr_payload: str,
    text_scale: float = 1.0,
):
    """Draw a single Avery 18163 label at position (x, y) = bottom-left."""
    qr_bytes = generate_qr_code(qr_payload, box_size=8)
    qr_img = ImageReader(io.BytesIO(qr_bytes))

    padding = 6
    qr_size = AVERY18163_LABEL_H - 2 * padding

    # QR code on the left
    c.drawImage(qr_img, x + padding, y + padding, width=qr_size, height=qr_size)

    # Text to the right of QR
    text_x = x + padding + qr_size + 8
    text_max_w = AVERY18163_LABEL_W - qr_size - padding * 2 - 16

    # Entity type
    type_size = 9 * text_scale
    c.setFont("Helvetica-Bold", type_size)
    c.drawString(text_x, y + AVERY18163_LABEL_H - 20, entity_type.upper())

    # Name (truncate to fit)
    name_size = 11 * text_scale
    c.setFont("Helvetica", name_size)
    display_name = name
    while c.stringWidth(display_name, "Helvetica", name_size) > text_max_w and len(display_name) > 3:
        display_name = display_name[:-4] + "..."
    c.drawString(text_x, y + AVERY18163_LABEL_H - 40, display_name)

    # Short code
    code_size = 10 * text_scale
    c.setFont("Courier", code_size)
    c.drawString(text_x, y + AVERY18163_LABEL_H - 58, short_code)


def render_avery18163_sheet(labels: list[dict], start_cell: int = 1, text_scale: float = 1.0) -> bytes:
    """Render labels onto Avery 18163 sheet(s).

    labels: list of {entity_type, name, short_code, qr_payload}
    start_cell: 1-based cell number to start at (1-10), skipping earlier cells.
    text_scale: multiplier for text size.
    """
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(AVERY18163_PAGE_W, AVERY18163_PAGE_H))

    cell_idx = start_cell - 1
    label_idx = 0

    while label_idx < len(labels):
        if cell_idx >= AVERY18163_COLS * AVERY18163_ROWS:
            c.showPage()
            cell_idx = 0

        row = cell_idx // AVERY18163_COLS
        col = cell_idx % AVERY18163_COLS

        x = AVERY18163_LEFT_MARGIN + col * (AVERY18163_LABEL_W + AVERY18163_COL_GAP)
        y = AVERY18163_PAGE_H - AVERY18163_TOP_MARGIN - (row + 1) * AVERY18163_LABEL_H

        lbl = labels[label_idx]
        _draw_avery18163_label(
            c, x, y,
            entity_type=lbl["entity_type"],
            name=lbl["name"],
            short_code=lbl["short_code"],
            qr_payload=lbl["qr_payload"],
            text_scale=text_scale,
        )

        cell_idx += 1
        label_idx += 1

    c.showPage()
    c.save()
    return buf.getvalue()


def render_label_pdf(
    entity_type: str,
    name: str,
    short_code: str,
    qr_payload: str,
    label_format: str = "adhesive",
) -> bytes:
    """Render a printable label PDF with QR code, name, and short code.

    Supports 'adhesive' (small label) and 'sheet' (standard paper) formats.
    """
    qr_bytes = generate_qr_code(qr_payload)

    buf = io.BytesIO()
    if label_format == "adhesive":
        page_w, page_h = 62 * mm, 29 * mm
    else:
        page_w, page_h = letter

    c = canvas.Canvas(buf, pagesize=(page_w, page_h))

    from reportlab.lib.utils import ImageReader
    qr_img = ImageReader(io.BytesIO(qr_bytes))

    if label_format == "adhesive":
        qr_size = 22 * mm
        c.drawImage(qr_img, 3 * mm, 3 * mm, width=qr_size, height=qr_size)
        c.setFont("Helvetica-Bold", 7)
        c.drawString(27 * mm, 20 * mm, f"{entity_type.upper()}")
        c.setFont("Helvetica", 6)
        c.drawString(27 * mm, 15 * mm, name[:25])
        c.setFont("Courier", 7)
        c.drawString(27 * mm, 10 * mm, short_code)
    else:
        # Standard sheet — centered label
        qr_size = 50 * mm
        x_center = page_w / 2
        c.drawImage(qr_img, x_center - qr_size / 2, page_h - 80 * mm, width=qr_size, height=qr_size)
        c.setFont("Helvetica-Bold", 14)
        c.drawCentredString(x_center, page_h - 90 * mm, f"{entity_type.upper()}")
        c.setFont("Helvetica", 12)
        c.drawCentredString(x_center, page_h - 100 * mm, name[:60])
        c.setFont("Courier", 12)
        c.drawCentredString(x_center, page_h - 110 * mm, short_code)

    c.showPage()
    c.save()
    return buf.getvalue()


async def resolve_code(db: AsyncSession, code: str) -> dict | None:
    """Resolve a short code to its entity type, ID, and archived status."""
    # Try item
    result = await db.execute(select(Item).where(Item.code == code))
    item = result.scalar_one_or_none()
    if item:
        return {
            "entity_type": "item",
            "entity_id": str(item.id),
            "name": item.name,
            "code": item.code,
            "archived": item.archived_at is not None,
        }

    # Try location
    result = await db.execute(select(Location).where(Location.code == code))
    location = result.scalar_one_or_none()
    if location:
        return {
            "entity_type": "location",
            "entity_id": str(location.id),
            "name": location.name,
            "code": location.code,
            "archived": location.archived_at is not None,
        }

    return None


async def record_label(
    db: AsyncSession,
    *,
    entity_type: str,
    entity_id: uuid.UUID,
    label_code: str,
    qr_payload: str,
    label_format: str = "adhesive",
) -> LabelRecord:
    """Record a label generation event."""
    record = LabelRecord(
        entity_type=entity_type,
        entity_id=entity_id,
        label_code=label_code,
        qr_payload=qr_payload,
        format=label_format,
    )
    db.add(record)
    await db.flush()
    return record
