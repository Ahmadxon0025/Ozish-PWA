FROM python:3.13-slim
WORKDIR /app
# fonts-dejavu-core → DejaVuSans.ttf so PDF exports render Uzbek/Cyrillic text.
RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# Hosts (Railway/Render) inject $PORT; default to 8001 locally.
ENV PORT=8001
CMD ["sh", "-c", "uvicorn reader:app --host 0.0.0.0 --port ${PORT}"]
