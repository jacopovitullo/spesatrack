# Usa Python 3.11 slim come base
FROM python:3.11-slim

# Imposta la working directory
WORKDIR /app

# Installa le dipendenze di sistema necessarie per reportlab e openpyxl
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copia prima solo requirements per sfruttare la cache Docker
COPY requirements.txt .

# Installa le dipendenze Python
RUN pip install --no-cache-dir -r requirements.txt

# Copia tutto il codice sorgente
COPY . .

# Espone la porta Flask
EXPOSE 5000

# Avvia l'app
CMD ["python", "app.py"]
