"""
Telegram reader microservice — lets the dashboard's Alfred read + analyze any
Telegram channel / group / bot the logged-in account follows.

Runs as a small always-on service (Vercel can't host a live Telegram
connection). The dashboard POSTs to /telegram/read; this returns the latest
messages, which Alfred (Claude) then summarizes.

Env vars (set on your host):
  TELEGRAM_API_ID          from my.telegram.org
  TELEGRAM_API_HASH        from my.telegram.org
  TELEGRAM_SESSION_STRING  produced once by make_session.py (full account access — secret)
  TELEGRAM_READER_SECRET   shared secret; must match the dashboard's env
"""

import os
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel
from telethon import TelegramClient
from telethon.sessions import StringSession

API_ID = int(os.environ["TELEGRAM_API_ID"])
API_HASH = os.environ["TELEGRAM_API_HASH"]
SESSION = os.environ["TELEGRAM_SESSION_STRING"]
SECRET = os.environ["TELEGRAM_READER_SECRET"]

app = FastAPI(title="Telegram Reader")
client = TelegramClient(StringSession(SESSION), API_ID, API_HASH)


class ReadReq(BaseModel):
    target: str  # @username | t.me/... link | numeric id
    limit: int = 30


@app.on_event("startup")
async def _startup() -> None:
    await client.connect()
    if not await client.is_user_authorized():
        print("WARNING: session not authorized — re-run make_session.py and "
              "update TELEGRAM_SESSION_STRING.")


@app.get("/")
async def health() -> dict:
    return {"ok": True, "service": "telegram-reader"}


@app.post("/telegram/read")
async def read(req: ReadReq, x_reader_secret: str = Header(default="")) -> dict:
    if x_reader_secret != SECRET:
        raise HTTPException(status_code=401, detail="unauthorized")
    limit = max(1, min(int(req.limit or 30), 100))
    try:
        entity = await client.get_entity(req.target.strip())
        title = getattr(entity, "title", None) or getattr(entity, "username", None)
        out = []
        async for m in client.iter_messages(entity, limit=limit):
            if not m.message:
                continue
            sender = None
            try:
                s = await m.get_sender()
                sender = (
                    getattr(s, "title", None)
                    or getattr(s, "username", None)
                    or getattr(s, "first_name", None)
                )
            except Exception:
                pass
            out.append(
                {
                    "date": m.date.isoformat() if m.date else "",
                    "sender": sender,
                    "text": m.message,
                }
            )
        return {"ok": True, "title": title, "messages": out}
    except Exception as e:  # noqa: BLE001 — surface any read error to the caller
        return {"ok": False, "error": str(e)}
