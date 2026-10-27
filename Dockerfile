# ==========================================
# 1. Build Stage: Compilazione Expo Web App
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /app/expo-app

# Installa le dipendenze
COPY expo-app/package*.json ./
RUN npm install

# Copia i sorgenti ed esporta il bundle Web
COPY expo-app/ ./
RUN npx expo export -p web

# ==========================================
# 2. Production Stage: Python Server & Static Host
# ==========================================
FROM python:3.11-slim

WORKDIR /app

# Installa curl per gli health check di Render
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Copia il server Python
COPY server.py ./

# Copia la web app compilata con React Native / Expo
COPY --from=builder /app/expo-app/dist ./expo-app/dist

# Variabili di ambiente per Render
ENV PYTHONUNBUFFERED=1
ENV PORT=8080

EXPOSE 8080

# Avvio del server Python
CMD ["python", "server.py"]
