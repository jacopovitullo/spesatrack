# SpesaTrack

App web per il tracciamento delle spese personali con bot Telegram.

## Stack

- **Backend**: Python + Flask
- **Database**: Supabase (PostgreSQL)
- **Bot**: python-telegram-bot v21
- **Frontend**: HTML + CSS + JS vanilla + Chart.js

---

## Setup

### 1. Clona / scarica il progetto

```bash
cd ~/Documents
# oppure semplicemente apri la cartella spesatrack/
```

### 2. Crea il database su Supabase

1. Vai su [supabase.com](https://supabase.com) → crea un nuovo progetto
2. Apri **SQL Editor** e incolla il contenuto di `schema.sql`
3. Esegui lo script → crea tabelle e categorie di default

### 3. Configura le variabili d'ambiente

```bash
cp .env.example .env
```

Apri `.env` e compila:

```env
SUPABASE_URL=https://xxxxx.supabase.co        # Settings > API > Project URL
SUPABASE_KEY=eyJxxx...                         # Settings > API > anon public key
TELEGRAM_TOKEN=123456:ABCdef...                # Da @BotFather su Telegram
TELEGRAM_CHAT_ID=123456789                     # Il tuo chat ID (da @userinfobot)
FLASK_SECRET_KEY=una_stringa_casuale_sicura
FLASK_PORT=5000
FLASK_DEBUG=False
```

### 4. Installa le dipendenze Python

```bash
cd /Users/jacopovitullo/Documents/spesatrack
python3 -m pip install -r requirements.txt
```

### 5. Avvia l'app

```bash
python3 app.py
```

Output atteso:
```
🚀 SpesaTrack avviato!
   App web: http://localhost:5000
   Bot Telegram: @nome_bot ✅ connesso
```

Apri il browser su **http://localhost:5000**

---

## Bot Telegram

### Creazione bot

1. Apri Telegram → cerca **@BotFather**
2. Invia `/newbot` → segui le istruzioni → ottieni il TOKEN
3. Per il CHAT_ID: cerca **@userinfobot** → invia `/start` → ti risponde con il tuo ID

### Comandi disponibili

| Comando | Descrizione |
|---------|-------------|
| `/start` | Benvenuto e lista comandi |
| `/oggi` | Spese del giorno con totale |
| `/settimana` | Ultime 7 giorni per categoria |
| `/mese` | Riepilogo mese corrente |
| `/budget` | Stato budget con barre di avanzamento |
| `/lista` | Ultime 10 spese |
| `/cancella` | Annulla ultima spesa (con conferma) |
| `/cerca <testo>` | Ricerca nelle spese |

### Inserimento spesa libero

Scrivi direttamente nel bot senza comandi:

```
caffè 1.50
supermercato 45 cibo
taxi 18.50 nota: viaggio lavoro
benzina 60
```

La categoria viene assegnata automaticamente in base alle regole configurate.

---

## Struttura

```
spesatrack/
├── app.py              # Entry point
├── config.py           # Variabili d'ambiente
├── requirements.txt
├── .env                # Segreti (non committare!)
├── schema.sql          # Script SQL Supabase
├── bot/
│   ├── handlers.py     # Comandi e messaggi Telegram
│   └── formatter.py    # Formattazione messaggi
├── api/
│   ├── spese.py        # CRUD spese + statistiche
│   ├── categorie.py    # CRUD categorie
│   ├── config_api.py   # Config bot e app
│   └── export.py       # CSV, Excel, PDF
├── db/
│   └── client.py       # Client Supabase singleton
├── static/
│   ├── css/style.css
│   └── js/
│       ├── api.js      # Fetch wrapper
│       ├── charts.js   # Chart.js
│       └── main.js     # Logica SPA
└── templates/
    └── index.html      # SPA principale
```

---

## API Reference

Base URL: `http://localhost:5000/api`

### Spese
- `GET /spese` — lista con filtri (`mese`, `anno`, `q`, `categoria_id`, `fonte`, `importo_min`, `importo_max`, `data_da`, `data_a`, `order_by`, `order_dir`)
- `POST /spese` — crea spesa
- `PUT /spese/<id>` — modifica
- `DELETE /spese/<id>` — elimina
- `GET /statistiche?mese=&anno=` — KPI e dati grafici

### Categorie
- `GET /categorie`
- `POST /categorie`
- `PUT /categorie/<id>`
- `DELETE /categorie/<id>`

### Export
- `GET /export/csv?mese=&anno=`
- `GET /export/excel?mese=&anno=`
- `GET /export/pdf?mese=&anno=`
- Aggiungi `&tutto=true` per esportare tutto lo storico

### Config
- `GET/PUT /config/bot`
- `GET/PUT /config/app`

---

## Avvio automatico su Mac (opzionale)

Crea un file LaunchAgent per avviarlo al login:

```bash
cat > ~/Library/LaunchAgents/com.spesatrack.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.spesatrack</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Library/Frameworks/Python.framework/Versions/3.13/bin/python3</string>
    <string>/Users/jacopovitullo/Documents/spesatrack/app.py</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/Users/jacopovitullo/Documents/spesatrack</string>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/spesatrack.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/spesatrack.err</string>
</dict>
</plist>
EOF

launchctl load ~/Library/LaunchAgents/com.spesatrack.plist
```
