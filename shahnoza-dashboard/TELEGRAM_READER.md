# Alfred → Telegram reader (read any channel / bot)

Lets Alfred read + analyze **any** Telegram channel, group, or bot the account
follows. Because reading arbitrary chats means acting **as a user** (not a bot),
it uses the MTProto **user API** (Telethon), which needs a persistent login — so
it runs as a **separate long-running service**, not inside the serverless ERP.

```
Alfred (ERP)  ──POST /telegram/read {target, limit}──▶  Reader service (Telethon, your bot repo)
   read_telegram tool        x-reader-secret                logs in as your user account
        ▲                                                   getMessages(target, limit)
        └──────────────── messages (JSON) ◀─────────────────┘
   Claude summarizes
```

**The ERP side is already built** (this repo): the `read_telegram` Alfred tool +
`src/lib/telegram/reader-client.ts`. It's inert until the two env vars point at a
running reader. This doc is the spec for the reader service (build it in the bot
repo — it already runs Python + Docker, so Telethon fits).

---

## 1. Prerequisites (one-time, on your side)

1. **API credentials:** go to https://my.telegram.org → *API development tools* →
   create an app → copy `api_id` and `api_hash`.
2. **A user account** that already *follows the channels/bots* you want to read
   (your own account, or a dedicated "reader" account). A bot token will NOT
   work — bots can't read chats they aren't in.
3. **Log in once to create a session string** (so the service doesn't ask for a
   code every start). Run this locally, enter phone + the code Telegram sends
   (+ 2FA password if set):

   ```python
   # make_session.py  →  pip install telethon
   from telethon.sync import TelegramClient
   from telethon.sessions import StringSession
   api_id = int(input("api_id: ")); api_hash = input("api_hash: ")
   with TelegramClient(StringSession(), api_id, api_hash) as c:
       print("\nTELEGRAM_SESSION_STRING=\n" + c.session.save())
   ```
   Save the printed string as `TELEGRAM_SESSION_STRING` (secret — it's full
   account access).

---

## 2. The reader service (reference — FastAPI + Telethon)

```python
# reader.py
import os
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel
from telethon import TelegramClient
from telethon.sessions import StringSession

API_ID = int(os.environ["TELEGRAM_API_ID"])
API_HASH = os.environ["TELEGRAM_API_HASH"]
SESSION = os.environ["TELEGRAM_SESSION_STRING"]
SECRET = os.environ["TELEGRAM_READER_SECRET"]

app = FastAPI()
client = TelegramClient(StringSession(SESSION), API_ID, API_HASH)

class ReadReq(BaseModel):
    target: str          # @username | t.me/... link | numeric id
    limit: int = 30

@app.on_event("startup")
async def _start():
    await client.connect()

@app.post("/telegram/read")
async def read(req: ReadReq, x_reader_secret: str = Header(default="")):
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
                sender = getattr(s, "title", None) or getattr(s, "username", None) \
                         or getattr(s, "first_name", None)
            except Exception:
                pass
            out.append({
                "date": m.date.isoformat() if m.date else "",
                "sender": sender,
                "text": m.message,
            })
        return {"ok": True, "title": title, "messages": out}
    except Exception as e:
        return {"ok": False, "error": str(e)}
```

Run it (e.g. `uvicorn reader:app --host 0.0.0.0 --port 8001`) as another service in
your existing `docker-compose` next to the funnel bot.

---

## 3. Wire it to the ERP

Add to the **ERP** env (`.env` / Vercel):

```
TELEGRAM_READER_URL=http://host.docker.internal:8001   # local; or the deployed reader URL
TELEGRAM_READER_SECRET=<same secret as the reader service>
```

That's it. In Alfred: *"alfred @somechannel ni tahlil qil"* / *"summarize @competitor_bot"*
→ Alfred calls `read_telegram`, gets the latest messages, and summarizes them.

**Contract** (what the ERP sends / expects):
- Request: `POST {TELEGRAM_READER_URL}/telegram/read`, header `x-reader-secret: <SECRET>`,
  body `{ "target": "@channel", "limit": 30 }`.
- Response: `{ "ok": true, "title": "...", "messages": [ { "date": "ISO", "sender": "...", "text": "..." } ] }`
  or `{ "ok": false, "error": "..." }`.

---

## 4. Account-safety notes (read before going wide)

- The reader logs in as a **real user account** — treat the session string like a
  password. Prefer a **dedicated account** over your personal one.
- Keep read volume **reasonable**. Telethon respects Telegram's flood limits, but
  aggressive bulk scraping across hundreds of channels can get an account
  flagged. On-demand "read the last N of this channel" is fine; a 24/7 crawler of
  everything is not.
- Only analyze channels/bots you're **entitled** to read. Feeding private-chat
  content to an AI has privacy implications.
- The account can only read what it **follows/has joined** — subscribe it to the
  channels you want Alfred to be able to analyze.
