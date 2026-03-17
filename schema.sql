-- ============================================================
-- SpesaTrack — Schema Supabase
-- Esegui questo file nella SQL Editor di Supabase
-- ============================================================

-- Categorie
CREATE TABLE IF NOT EXISTS categorie (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  colore TEXT DEFAULT '#c8ff00',
  icona TEXT DEFAULT '📦',
  budget_mensile NUMERIC(10,2) DEFAULT 0,
  regole TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Spese
CREATE TABLE IF NOT EXISTS spese (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  descrizione TEXT NOT NULL,
  importo NUMERIC(10,2) NOT NULL,
  categoria_id UUID REFERENCES categorie(id) ON DELETE SET NULL,
  data DATE DEFAULT CURRENT_DATE,
  fonte TEXT DEFAULT 'web',
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Configurazione bot Telegram
CREATE TABLE IF NOT EXISTS bot_config (
  id INT DEFAULT 1 PRIMARY KEY,
  token TEXT DEFAULT '',
  chat_id TEXT DEFAULT '',
  notifica_giornaliera BOOLEAN DEFAULT TRUE,
  ora_giornaliera TIME DEFAULT '21:00',
  notifica_settimanale BOOLEAN DEFAULT TRUE,
  ora_settimanale TIME DEFAULT '09:00',
  alert_budget BOOLEAN DEFAULT TRUE,
  conferma_inserimento BOOLEAN DEFAULT TRUE,
  formato_riepilogo TEXT DEFAULT 'dettagliato'
);

-- Configurazione generale app
CREATE TABLE IF NOT EXISTS app_config (
  id INT DEFAULT 1 PRIMARY KEY,
  valuta TEXT DEFAULT 'EUR',
  simbolo_valuta TEXT DEFAULT '€',
  formato_data TEXT DEFAULT 'DD/MM/YYYY',
  budget_mensile_globale NUMERIC(10,2) DEFAULT 1500
);

-- Riga di config di default
INSERT INTO bot_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
INSERT INTO app_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ── Indici per performance ─────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_spese_data ON spese(data);
CREATE INDEX IF NOT EXISTS idx_spese_categoria ON spese(categoria_id);
CREATE INDEX IF NOT EXISTS idx_spese_fonte ON spese(fonte);

-- Entrate
CREATE TABLE IF NOT EXISTS entrate (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  descrizione TEXT NOT NULL,
  importo NUMERIC(10,2) NOT NULL,
  tipo TEXT DEFAULT 'altro',
  data DATE DEFAULT CURRENT_DATE,
  note TEXT DEFAULT '',
  fonte TEXT DEFAULT 'web',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_entrate_data ON entrate(data);

-- Abbonamenti e rate
CREATE TABLE IF NOT EXISTS abbonamenti (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  descrizione TEXT NOT NULL,
  importo NUMERIC(10,2) NOT NULL,
  categoria_id UUID REFERENCES categorie(id) ON DELETE SET NULL,
  tipo TEXT DEFAULT 'abbonamento',
  frequenza TEXT DEFAULT 'mensile',
  giorno_addebito INT DEFAULT 1,
  attivo BOOLEAN DEFAULT TRUE,
  data_inizio DATE DEFAULT CURRENT_DATE,
  data_fine DATE,
  n_rate_totali INT,
  n_rate_pagate INT DEFAULT 0,
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_abbonamenti_attivo ON abbonamenti(attivo);

-- ============================================================
-- Tabelle gestione utenti (admin Supabase — schema.sql utente NON include queste)
-- Eseguire SOLO nel progetto Supabase dell'admin
-- ============================================================

CREATE TABLE IF NOT EXISTS st_users (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email            TEXT NOT NULL UNIQUE,
  password_hash    TEXT NOT NULL,
  display_name     TEXT DEFAULT '',
  role             TEXT DEFAULT 'user',   -- 'admin' | 'user'
  supabase_url     TEXT NOT NULL,
  supabase_key     TEXT NOT NULL,
  telegram_token   TEXT DEFAULT '',
  telegram_chat_id TEXT DEFAULT '',
  is_active        BOOLEAN DEFAULT TRUE,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  last_login_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS st_invites (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  token        TEXT NOT NULL UNIQUE,
  email_hint   TEXT DEFAULT '',
  created_by   UUID REFERENCES st_users(id) ON DELETE SET NULL,
  used_by      UUID REFERENCES st_users(id) ON DELETE SET NULL,
  used_at      TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invites_token ON st_invites(token);
CREATE INDEX IF NOT EXISTS idx_users_email ON st_users(email);

-- ── Categorie di default ────────────────────────────────────────
INSERT INTO categorie (nome, colore, icona, budget_mensile, regole) VALUES
  ('Cibo',          '#c8ff00', '🍕', 400,  ARRAY['supermercato','lidl','esselunga','pane','caffè','pranzo','cena','ristorante','pizza','colazione','bar']),
  ('Trasporti',     '#ff6b35', '🚗', 150,  ARRAY['benzina','metro','atm','treno','taxi','uber','autobus','trenitalia','bus','parking','parcheggio']),
  ('Svago',         '#7c6dfa', '🎬', 200,  ARRAY['cinema','netflix','spotify','amazon','gioco','teatro','concerto','libro','fumetto','videogioco']),
  ('Casa',          '#2ed573', '🏠', 500,  ARRAY['affitto','bolletta','luce','gas','acqua','internet','condominio','pulizie','ikea','arredamento']),
  ('Salute',        '#ff4757', '💊', 100,  ARRAY['farmacia','medico','dentista','palestra','medicina','visita','analisi','ospedale']),
  ('Abbigliamento', '#ffa502', '👕', 150,  ARRAY['zara','h&m','scarpe','vestiti','abbigliamento','camicia','pantaloni','saldi'])
ON CONFLICT DO NOTHING;
