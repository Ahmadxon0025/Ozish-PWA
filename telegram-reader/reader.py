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

API_ID = int(os.environ["TELEGRAM_API_ID"])
API_HASH = os.environ["TELEGRAM_API_HASH"]
SESSION = os.environ["TELEGRAM_SESSION_STRING"]
SECRET = os.environ["TELEGRAM_READER_SECRET"]

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
    await client.connect()
    if not await client.is_user_authorized():
        print("WARNING: session not authorized — re-run make_session.py.")


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
    fmt = fmt if fmt in ("txt", "csv", "rtf", "json") else "csv"
    from_d = _parse_day(frm)
    to_d = _parse_day(to, end=True)
    _, _title, msgs = await _fetch(target, from_d, to_d, MAX_MESSAGES)
    msgs = [m for m in msgs if (m.message or m.media)]

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
