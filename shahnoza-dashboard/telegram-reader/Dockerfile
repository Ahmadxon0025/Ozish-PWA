FROM python:3.13-alpine AS builder
RUN apk add --no-cache \
    gcc musl-dev python3-dev \
    jpeg-dev zlib-dev freetype-dev
WORKDIR /app
RUN python -m venv /venv
COPY requirements.txt .
RUN /venv/bin/pip install --no-cache-dir -r requirements.txt

FROM python:3.13-alpine
# ttf-dejavu → DejaVuSans.ttf so PDF exports render Uzbek/Cyrillic text.
RUN apk add --no-cache ttf-dejavu libjpeg-turbo freetype
COPY --from=builder /venv /venv
WORKDIR /app
COPY . .
ENV PORT=8001
ENV PATH="/venv/bin:$PATH"
CMD ["sh", "-c", "uvicorn reader:app --host 0.0.0.0 --port ${PORT}"]
