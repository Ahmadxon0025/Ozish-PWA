"""
One-time login: produces TELEGRAM_SESSION_STRING so the reader can log in
without asking for a code every start.

Run it once (locally, or in your host's web shell):
    pip install telethon
    python make_session.py

It asks for api_id + api_hash (from my.telegram.org), then your phone number,
then the login code Telegram sends you (and your 2FA password if you have one).
It prints TELEGRAM_SESSION_STRING — set that as an env var on the reader host.

Use the account that FOLLOWS the channels/bots you want Alfred to read.
The printed string is full account access — keep it secret.
"""

from telethon.sync import TelegramClient
from telethon.sessions import StringSession

api_id = int(input("api_id: ").strip())
api_hash = input("api_hash: ").strip()

with TelegramClient(StringSession(), api_id, api_hash) as client:
    print("\n=== COPY THIS (set as TELEGRAM_SESSION_STRING) ===\n")
    print(client.session.save())
    print("\n=== keep it secret — it is full account access ===")
