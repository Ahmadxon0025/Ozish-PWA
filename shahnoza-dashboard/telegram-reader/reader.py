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
# When set (e.g. https://shahnoza-dashboard.vercel.app), this always-on service
# pings the dashboard's funnel-bot cron every 5 min so drip delays resume on
# time — Vercel Hobby crons only run daily. Auth = the shared reader secret.
DASHBOARD_URL = os.environ.get("DASHBOARD_URL", "").rstrip("/")

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


async def _ensure_connected() -> None:
    if not client.is_connected():
        await client.connect()
    if not await client.is_user_authorized():
        raise RuntimeError("Telegram session not authorized — re-run make_session.py and update TELEGRAM_SESSION_STRING.")


async def _fetch(target: str, from_date, to_date, limit: int):
    """Fetch messages, optionally bounded to [from_date, to_date). Chronological.
    Retries once on ConnectionError: is_connected() can report True on a socket
    the server already dropped, so force a fresh connection and try again."""
    await _ensure_connected()
    try:
        return await _fetch_inner(target, from_date, to_date, limit)
    except ConnectionError:
        print("telegram: stale connection — reconnecting and retrying once")
        await client.disconnect()
        await client.connect()
        return await _fetch_inner(target, from_date, to_date, limit)


async def _fetch_inner(target: str, from_date, to_date, limit: int):
    t = target.strip()
    try:
        entity = await client.get_entity(t)
    except ValueError:
        # Entity not in local cache — account may have been recently added to
        # a private group. Refresh dialogs so Telethon learns the access hash.
        print(f"telegram: entity '{t}' not cached — refreshing dialogs")
        await client.get_dialogs()
        entity = await client.get_entity(t)
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


def _ping_funnel_cron() -> None:
    """One tick: ask the dashboard to resume due funnel-bot drip steps."""
    import urllib.request

    req = urllib.request.Request(
        f"{DASHBOARD_URL}/api/cron/funnel-bot",
        headers={"x-reader-secret": SECRET},
    )
    with urllib.request.urlopen(req, timeout=30) as res:
        res.read()


async def _funnel_cron_loop() -> None:
    import asyncio

    while True:
        try:
            await asyncio.get_event_loop().run_in_executor(None, _ping_funnel_cron)
        except Exception as e:  # noqa: BLE001
            print(f"funnel cron ping failed: {e}")
        await asyncio.sleep(300)


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
    if DASHBOARD_URL and SECRET:
        import asyncio

        asyncio.get_event_loop().create_task(_funnel_cron_loop())
        print(f"funnel cron pinger active → {DASHBOARD_URL}/api/cron/funnel-bot every 5 min")


# Railway injects the deployed commit; surfacing it lets anyone confirm which
# build is live by opening the service URL in a browser.
COMMIT = (os.environ.get("RAILWAY_GIT_COMMIT_SHA") or "")[:7] or "unknown"


@app.get("/")
async def health() -> dict:
    return {
        "ok": True,
        "service": "telegram-reader",
        "commit": COMMIT,
        "telegram_connected": client.is_connected(),
    }


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


# ------------------ HTML (looks like an exported Telegram chat) --------------

_TG_MONTHS = [
    "", "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]

_HTML_HEAD = """<!doctype html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>{{TITLE}}</title>
<style>
  * { box-sizing: border-box; }
  body { margin:0; background:#0e1621;
    font-family:-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; color:#e9edf0; }
  .chat { max-width:640px; margin:0 auto; padding:16px 12px 48px; }
  .title { text-align:center; color:#7d8e9e; font-weight:600; padding:8px 0 18px; font-size:16px; }
  .daysep { text-align:center; margin:16px 0 10px; }
  .daysep span { background:rgba(0,0,0,.35); color:#c9d6e2; font-size:13px; padding:4px 12px; border-radius:12px; }
  .msg { display:flex; flex-direction:column; align-items:flex-start; margin:3px 0; }
  .bubble { background:#182533; border-radius:12px; padding:8px 10px 6px; max-width:480px;
    box-shadow:0 1px 1px rgba(0,0,0,.2); overflow:hidden; }
  .text { white-space:pre-wrap; overflow-wrap:anywhere; font-size:15px; line-height:1.35; }
  .text a { color:#62bcf9; }
  .text b, .text strong { font-weight:700; }
  .text blockquote { border-left:3px solid #62bcf9; margin:6px 0; padding:2px 0 2px 10px; color:#cdd8e2; }
  .text code, .text pre { background:rgba(0,0,0,.3); border-radius:4px; padding:0 4px; font-family:monospace; }
  .photo { display:block; max-width:480px; width:100%; border-radius:10px; margin-bottom:6px; }
  .media { background:rgba(255,255,255,.06); border-radius:8px; padding:10px; margin-bottom:6px;
    color:#c9d6e2; font-size:14px; }
  .time { text-align:right; color:#6d7d8c; font-size:12px; margin-top:2px; }
  .buttons { max-width:480px; margin:2px 0 8px; display:flex; flex-direction:column; gap:2px; }
  .brow { display:flex; gap:2px; }
  .btn { flex:1; text-align:center; background:rgba(24,37,51,.9); color:#62bcf9; text-decoration:none;
    padding:9px 8px; border-radius:8px; font-size:14px; font-weight:500;
    border:1px solid rgba(98,188,249,.18); }
</style></head><body><div class="chat">"""


async def _render_html(msgs, title: str | None) -> bytes:
    """Reproduce the chat as a Telegram-styled HTML page: bubbles, inline photos,
    real inline buttons, bold/links/quotes (via entities), and day separators."""
    import html as _h
    from telethon.extensions import html as tg_html

    def esc(s: object) -> str:
        return _h.escape(str(s) if s is not None else "")

    parts = [_HTML_HEAD.replace("{{TITLE}}", esc(title or "Telegram"))]
    if title:
        parts.append(f'<div class="title">{esc(title)}</div>')

    tmpdir = tempfile.mkdtemp()
    imgs = 0
    total = 0
    last_day = None
    try:
        for m in msgs:
            if m.date:
                dkey = m.date.strftime("%Y-%m-%d")
                if dkey != last_day:
                    last_day = dkey
                    sep = f"{_TG_MONTHS[m.date.month]} {m.date.day}"
                    parts.append(f'<div class="daysep"><span>{esc(sep)}</span></div>')

            try:
                body = tg_html.unparse(m.message or "", m.entities or [])
            except Exception:
                body = esc(m.message or "")

            media_html = ""
            if m.media and imgs < MAX_MEDIA_FILES and total < MAX_MEDIA_BYTES:
                is_img = bool(getattr(m, "photo", None)) or (
                    getattr(m, "file", None)
                    and (m.file.mime_type or "").startswith("image/")
                )
                if is_img:
                    try:
                        raw = await client.download_media(m, file=os.path.join(tmpdir, str(m.id)))
                        if raw and os.path.exists(raw):
                            enc = _resize_b64(raw)
                            if enc:
                                data, mt = enc
                                media_html = f'<img class="photo" src="data:{mt};base64,{data}"/>'
                                total += os.path.getsize(raw)
                                imgs += 1
                            os.remove(raw)
                    except Exception:
                        pass
                else:
                    label = getattr(getattr(m, "file", None), "name", None) or type(m.media).__name__
                    media_html = f'<div class="media">📎 {esc(label)}</div>'

            time_s = m.date.strftime("%H:%M") if m.date else ""
            bubble = '<div class="bubble">' + media_html
            if body.strip():
                bubble += f'<div class="text">{body}</div>'
            bubble += f'<div class="time">{esc(time_s)}</div></div>'

            btn_html = ""
            try:
                rows = m.buttons or []
            except Exception:
                rows = []
            if rows:
                brows = []
                for row in rows:
                    cells = []
                    for b in row:
                        label = esc(getattr(b, "text", "") or "")
                        url = getattr(b, "url", None)
                        if url:
                            cells.append(f'<a class="btn" href="{esc(url)}" target="_blank" rel="noopener">{label}</a>')
                        else:
                            cells.append(f'<div class="btn">{label}</div>')
                    brows.append('<div class="brow">' + "".join(cells) + "</div>")
                btn_html = '<div class="buttons">' + "".join(brows) + "</div>"

            parts.append(f'<div class="msg">{bubble}{btn_html}</div>')

        parts.append("</div></body></html>")
        return "".join(parts).encode("utf-8")
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
    try:
        return await _export(target, frm, to, fmt, media)
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        # Surface the real cause instead of a bare "Internal Server Error":
        # full traceback to the Railway log, type + message to the browser.
        import traceback

        traceback.print_exc()
        return Response(
            content=f"export failed: {type(e).__name__}: {e}",
            status_code=500,
            media_type="text/plain; charset=utf-8",
        )


async def _export(target: str, frm: str | None, to: str | None, fmt: str, media: str):
    fmt = fmt if fmt in ("txt", "csv", "rtf", "json", "pdf", "html") else "csv"
    from_d = _parse_day(frm)
    to_d = _parse_day(to, end=True)
    _, title, msgs = await _fetch(target, from_d, to_d, MAX_MESSAGES)
    msgs = [m for m in msgs if (m.message or m.media)]

    # Rich formats reproduce the chat with inline media:
    #   html = styled like an exported Telegram chat (bubbles, buttons, photos)
    #   pdf  = a print-friendly document with photos inline
    if fmt in ("html", "pdf"):
        if fmt == "html":
            rendered = await _render_html(msgs, title)
            rtype, rname = "text/html; charset=utf-8", "telegram_export.html"
        else:
            rendered = await _render_pdf(msgs, title)
            rtype, rname = "application/pdf", "telegram_export.pdf"
        if media != "1":
            return Response(
                content=rendered,
                media_type=rtype,
                headers={"Content-Disposition": f'attachment; filename="{rname}"'},
            )
        # media=1 → ZIP: the rendered file + every raw file (incl. videos/docs)
        import zipfile

        tmpdir = tempfile.mkdtemp()
        zip_path = os.path.join(tmpdir, "telegram_export.zip")
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr(rname, rendered)
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
        await _ensure_connected()
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
