"""
Telegram reader microservice — lets the dashboard's Alfred read, export, and
download media from any Telegram channel / group / bot the logged-in account
follows.

Endpoints:
  GET  /                  health
  POST /telegram/read     read recent / date-ranged messages (secret header) → JSON
  GET  /telegram/export   signed download: txt | csv | rtf(Word) | json,
                          optionally a zip that also bundles posted media

Auth:
  /telegram/read   → header  x-reader-secret: <TELEGRAM_READER_SECRET>
  /telegram/export → signed query token (so the browser can download directly,
                     bypassing the serverless dashboard's size/time limits)

Env vars (set on your host):
  TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_SESSION_STRING, TELEGRAM_READER_SECRET
"""

import base64
import csv
import hashlib
import hmac
import io
import os
import shutil
import tempfile
import time
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.responses import FileResponse, Response
from starlette.background import BackgroundTask
from pydantic import BaseModel
from telethon import TelegramClient
from telethon.sessions import StringSession

API_ID = int(os.environ.get("TELEGRAM_API_ID") or "0")
API_HASH = os.environ.get("TELEGRAM_API_HASH", "")
SESSION = os.environ.get("TELEGRAM_SESSION_STRING", "")
SECRET = os.environ.get("TELEGRAM_READER_SECRET", "")

# Safety caps so one export can't run away (flood limits / memory / disk).
MAX_MESSAGES = 5000
MAX_MEDIA_FILES = 500
MAX_MEDIA_BYTES = 200 * 1024 * 1024  # 200 MB

app = FastAPI(title="Telegram Reader")
client = TelegramClient(StringSession(SESSION), API_ID, API_HASH)


class ReadReq(BaseModel):
    target: str  # @username | t.me/... link | numeric id
    limit: int = 30
    from_date: str | None = None  # YYYY-MM-DD (inclusive)
    to_date: str | None = None    # YYYY-MM-DD (inclusive)


class ImagesReq(BaseModel):
    target: str
    limit: int = 6                # keep vision cost bounded
    from_date: str | None = None
    to_date: str | None = None


def _parse_day(s: str | None, end: bool = False) -> datetime | None:
    if not s:
        return None
    d = datetime.strptime(s.strip(), "%Y-%m-%d").replace(tzinfo=timezone.utc)
    # inclusive end-of-day → use the start of the next day as the upper bound
    return d + timedelta(days=1) if end else d


def _sender_name(m) -> str | None:
    s = getattr(m, "sender", None)
    if s is not None:
        return (
            getattr(s, "title", None)
            or getattr(s, "username", None)
            or getattr(s, "first_name", None)
        )
    return getattr(m, "post_author", None)  # channel post signature, if any


async def _fetch(target: str, from_date, to_date, limit: int):
    """Fetch messages, optionally bounded to [from_date, to_date). Chronological."""
    entity = await client.get_entity(target.strip())
    title = getattr(entity, "title", None) or getattr(entity, "username", None)
    kwargs = {}
    if to_date:
        kwargs["offset_date"] = to_date  # iter returns messages older than this
    cap = min(limit or MAX_MESSAGES, MAX_MESSAGES)
    msgs = []
    async for m in client.iter_messages(entity, limit=cap, **kwargs):
        if from_date and m.date and m.date < from_date:
            break
        msgs.append(m)
    msgs.reverse()  # oldest → newest
    return entity, title, msgs


def _to_dict(m) -> dict:
    return {
        "id": m.id,
        "date": m.date.isoformat() if m.date else "",
        "sender": _sender_name(m),
        "text": m.message or "",
        "has_media": bool(m.media),
        "media_type": type(m.media).__name__ if m.media else None,
        "views": getattr(m, "views", None),
    }


@app.on_event("startup")
async def _startup() -> None:
    # Boot even if not fully configured (health stays up + Railway shell is
    # reachable to run make_session.py). Reads just fail until env is set.
    try:
        await client.connect()
        if not await client.is_user_authorized():
            print("WARNING: session not set/authorized — run make_session.py "
                  "and set TELEGRAM_SESSION_STRING.")
    except Exception as e:  # noqa: BLE001
        print(f"startup connect failed (set the env vars): {e}")


@app.get("/")
async def health() -> dict:
    return {"ok": True, "service": "telegram-reader"}


@app.post("/telegram/read")
async def read(req: ReadReq, x_reader_secret: str = Header(default="")) -> dict:
    if not hmac.compare_digest(x_reader_secret, SECRET):
        raise HTTPException(status_code=401, detail="unauthorized")
    try:
        frm = _parse_day(req.from_date)
        to = _parse_day(req.to_date, end=True)
        limit = max(1, min(int(req.limit or 30), MAX_MESSAGES))
        _, title, msgs = await _fetch(req.target, frm, to, limit)
        rows = [_to_dict(m) for m in msgs if (m.message or m.media)]
        return {"ok": True, "title": title, "count": len(rows), "messages": rows}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)}


# --------------------------- export (signed link) ---------------------------


def _verify(target, frm, to, fmt, media, exp, sig) -> None:
    canonical = f"{target}|{frm or ''}|{to or ''}|{fmt}|{media}|{exp}"
    expected = hmac.new(SECRET.encode(), canonical.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig or ""):
        raise HTTPException(status_code=401, detail="bad signature")
    if int(exp) < int(time.time()):
        raise HTTPException(status_code=410, detail="link expired")


def _rtf_escape(text: str) -> str:
    out = []
    for ch in text:
        if ch in "\\{}":
            out.append("\\" + ch)
        elif ord(ch) > 127:
            out.append(f"\\u{ord(ch)}?")
        elif ch == "\n":
            out.append("\\par\n")
        else:
            out.append(ch)
    return "".join(out)


def _render(msgs, fmt: str) -> tuple[bytes, str, str]:
    """Return (bytes, media_type, filename) for a text export format."""
    if fmt == "csv":
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["date", "sender", "text", "views"])
        for m in msgs:
            d = _to_dict(m)
            w.writerow([d["date"], d["sender"] or "", d["text"], d["views"] or ""])
        return buf.getvalue().encode("utf-8-sig"), "text/csv", "telegram_export.csv"
    if fmt == "json":
        import json
        data = json.dumps([_to_dict(m) for m in msgs], ensure_ascii=False, indent=2)
        return data.encode("utf-8"), "application/json", "telegram_export.json"
    if fmt == "rtf":  # opens natively in Word
        body = []
        for m in msgs:
            d = _to_dict(m)
            head = f"[{d['date'][:16]}] {d['sender'] or ''}: "
            body.append("\\b " + _rtf_escape(head) + "\\b0 " + _rtf_escape(d["text"]) + "\\par\\par")
        rtf = "{\\rtf1\\ansi\\deff0 " + "\n".join(body) + "}"
        return rtf.encode("utf-8"), "application/rtf", "telegram_export.rtf"
    # default: txt
    lines = []
    for m in msgs:
        d = _to_dict(m)
        lines.append(f"[{d['date'][:16]}] {d['sender'] or ''}: {d['text']}")
    return ("\n".join(lines)).encode("utf-8"), "text/plain; charset=utf-8", "telegram_export.txt"


# ------------------------ PDF (faithful copy w/ images) ---------------------

DEJAVU_REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
DEJAVU_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def _pdf_text(s: str, unicode_ok: bool) -> str:
    """Guard the text for the active font. With the DejaVu unicode font we pass
    text through untouched (Uzbek/Cyrillic render fine). Without it, drop to a
    latin-1-safe fallback so a core font never raises on non-latin glyphs."""
    s = s or ""
    if unicode_ok:
        return s
    return s.encode("latin-1", "replace").decode("latin-1")


def _normalize_jpeg(path: str, maxdim: int = 1400) -> str | None:
    """Re-encode any downloaded image to a bounded RGB JPEG that fpdf embeds
    cleanly (avoids CMYK/alpha/huge-file surprises). Returns the new path."""
    try:
        from PIL import Image

        img = Image.open(path).convert("RGB")
        if max(img.size) > maxdim:
            r = maxdim / float(max(img.size))
            img = img.resize((int(img.size[0] * r), int(img.size[1] * r)))
        out = path + ".jpg"
        img.save(out, format="JPEG", quality=82)
        return out
    except Exception:
        return None


async def _render_pdf(msgs, title: str | None) -> bytes:
    """Build a single PDF that reproduces the channel: each post's date/sender +
    text, with its photos embedded INLINE (a faithful copy). Non-image media
    (video/file) is noted as a line. Chronological. Bounded by MAX_MEDIA_*."""
    from fpdf import FPDF

    pdf = FPDF(format="A4")
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.set_margins(15, 15, 15)
    pdf.add_page()

    unicode_ok = os.path.exists(DEJAVU_REG)
    if unicode_ok:
        pdf.add_font("DejaVu", "", DEJAVU_REG)
        pdf.add_font("DejaVu", "B", DEJAVU_BOLD if os.path.exists(DEJAVU_BOLD) else DEJAVU_REG)
        family = "DejaVu"
    else:
        family = "Helvetica"

    usable = pdf.w - pdf.l_margin - pdf.r_margin

    if title:
        pdf.set_font(family, "B", 15)
        pdf.multi_cell(usable, 8, _pdf_text(str(title), unicode_ok))
        pdf.ln(2)

    tmpdir = tempfile.mkdtemp()
    imgs = 0
    total = 0
    try:
        for m in msgs:
            d = _to_dict(m)
            pdf.set_font(family, "B", 10)
            pdf.set_text_color(90, 90, 90)
            head = f"[{d['date'][:16]}] {d['sender'] or ''}".strip()
            pdf.multi_cell(usable, 5, _pdf_text(head, unicode_ok))
            pdf.set_text_color(0, 0, 0)

            if d["text"]:
                pdf.set_font(family, "", 11)
                pdf.multi_cell(usable, 6, _pdf_text(d["text"], unicode_ok))

            if m.media:
                is_img = bool(getattr(m, "photo", None)) or (
                    getattr(m, "file", None)
                    and (m.file.mime_type or "").startswith("image/")
                )
                if is_img and imgs < MAX_MEDIA_FILES and total < MAX_MEDIA_BYTES:
                    try:
                        raw = await client.download_media(m, file=os.path.join(tmpdir, str(m.id)))
                        jpg = _normalize_jpeg(raw) if raw and os.path.exists(raw) else None
                        if jpg:
                            pdf.ln(1)
                            pdf.image(jpg, w=min(usable, 120))  # keep within one page
                            total += os.path.getsize(jpg)
                            imgs += 1
                        for p in (raw, jpg):
                            if p and os.path.exists(p):
                                os.remove(p)
                    except Exception:
                        pass
                elif not is_img:
                    label = getattr(getattr(m, "file", None), "name", None) or (
                        type(m.media).__name__
                    )
                    pdf.set_font(family, "", 9)
                    pdf.set_text_color(120, 120, 120)
                    pdf.multi_cell(usable, 5, _pdf_text(f"[media: {label}]", unicode_ok))
                    pdf.set_text_color(0, 0, 0)

            pdf.ln(3)
        return bytes(pdf.output())
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


@app.get("/telegram/export")
async def export(
    target: str = Query(...),
    frm: str | None = Query(default=None, alias="from"),
    to: str | None = Query(default=None, alias="to"),
    fmt: str = Query(default="csv", alias="format"),
    media: str = Query(default="0"),
    exp: int = Query(...),
    sig: str = Query(...),
):
    _verify(target, frm, to, fmt, media, exp, sig)
    fmt = fmt if fmt in ("txt", "csv", "rtf", "json", "pdf") else "csv"
    from_d = _parse_day(frm)
    to_d = _parse_day(to, end=True)
    _, title, msgs = await _fetch(target, from_d, to_d, MAX_MESSAGES)
    msgs = [m for m in msgs if (m.message or m.media)]

    # PDF: a faithful copy — each post's text with its photos embedded inline.
    if fmt == "pdf":
        pdf_bytes = await _render_pdf(msgs, title)
        if media != "1":
            return Response(
                content=pdf_bytes,
                media_type="application/pdf",
                headers={"Content-Disposition": 'attachment; filename="telegram_export.pdf"'},
            )
        # media=1 → ZIP: the PDF + every raw file (incl. videos/docs that can't embed)
        import zipfile

        tmpdir = tempfile.mkdtemp()
        zip_path = os.path.join(tmpdir, "telegram_export.zip")
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr("telegram_export.pdf", pdf_bytes)
            count = 0
            total = 0
            for m in msgs:
                if not m.media or count >= MAX_MEDIA_FILES or total >= MAX_MEDIA_BYTES:
                    continue
                try:
                    path = await client.download_media(m, file=os.path.join(tmpdir, str(m.id)))
                    if path and os.path.exists(path):
                        z.write(path, arcname=f"media/{os.path.basename(path)}")
                        total += os.path.getsize(path)
                        count += 1
                        os.remove(path)
                except Exception:
                    pass
        return FileResponse(
            zip_path,
            filename="telegram_export.zip",
            media_type="application/zip",
            background=BackgroundTask(lambda: shutil.rmtree(tmpdir, ignore_errors=True)),
        )

    if media != "1":
        content, mtype, fname = _render(msgs, fmt)
        return Response(
            content=content,
            media_type=mtype,
            headers={"Content-Disposition": f'attachment; filename="{fname}"'},
        )

    # media=1 → zip the text export + downloaded attachments
    import zipfile

    tmpdir = tempfile.mkdtemp()
    zip_path = os.path.join(tmpdir, "telegram_export.zip")
    content, _mtype, fname = _render(msgs, fmt)
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr(fname, content)
        count = 0
        total = 0
        for m in msgs:
            if not m.media or count >= MAX_MEDIA_FILES or total >= MAX_MEDIA_BYTES:
                continue
            try:
                path = await client.download_media(m, file=os.path.join(tmpdir, str(m.id)))
                if path and os.path.exists(path):
                    z.write(path, arcname=f"media/{os.path.basename(path)}")
                    total += os.path.getsize(path)
                    count += 1
                    os.remove(path)
            except Exception:
                pass
    return FileResponse(
        zip_path,
        filename="telegram_export.zip",
        media_type="application/zip",
        background=BackgroundTask(lambda: shutil.rmtree(tmpdir, ignore_errors=True)),
    )


# --------------------------- images (for OCR) -------------------------------


def _resize_b64(path: str) -> tuple[str, str] | None:
    """Open an image, downscale to <=1568px (Anthropic's optimal), JPEG+base64."""
    try:
        from PIL import Image

        img = Image.open(path).convert("RGB")
        maxdim = 1568
        if max(img.size) > maxdim:
            ratio = maxdim / float(max(img.size))
            img = img.resize((int(img.size[0] * ratio), int(img.size[1] * ratio)))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        return base64.b64encode(buf.getvalue()).decode(), "image/jpeg"
    except Exception:
        return None


@app.post("/telegram/images")
async def images(req: ImagesReq, x_reader_secret: str = Header(default="")) -> dict:
    """Return recent images (base64, resized) so Claude can READ what's inside
    them — price lists, offers, flyers that channels post as pictures."""
    if not hmac.compare_digest(x_reader_secret, SECRET):
        raise HTTPException(status_code=401, detail="unauthorized")
    try:
        limit = max(1, min(int(req.limit or 6), 12))
        frm = _parse_day(req.from_date)
        to = _parse_day(req.to_date, end=True)
        entity = await client.get_entity(req.target.strip())
        title = getattr(entity, "title", None) or getattr(entity, "username", None)
        kwargs = {}
        if to:
            kwargs["offset_date"] = to
        out = []
        tmpdir = tempfile.mkdtemp()
        try:
            async for m in client.iter_messages(entity, limit=500, **kwargs):
                if frm and m.date and m.date < frm:
                    break
                if len(out) >= limit:
                    break
                is_img = bool(getattr(m, "photo", None)) or (
                    getattr(m, "file", None)
                    and (m.file.mime_type or "").startswith("image/")
                )
                if not is_img:
                    continue
                path = await client.download_media(m, file=os.path.join(tmpdir, str(m.id)))
                if not path or not os.path.exists(path):
                    continue
                enc = _resize_b64(path)
                try:
                    os.remove(path)
                except OSError:
                    pass
                if enc:
                    data, mt = enc
                    out.append(
                        {
                            "id": m.id,
                            "date": m.date.isoformat() if m.date else "",
                            "caption": m.message or "",
                            "media_type": mt,
                            "data": data,
                        }
                    )
        finally:
            shutil.rmtree(tmpdir, ignore_errors=True)
        return {"ok": True, "title": title, "images": out}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)}
