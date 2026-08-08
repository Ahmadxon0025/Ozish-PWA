FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# Hosts (Railway/Render) inject $PORT; default to 8001 locally.
ENV PORT=8001
CMD ["sh", "-c", "uvicorn reader:app --host 0.0.0.0 --port ${PORT}"]
