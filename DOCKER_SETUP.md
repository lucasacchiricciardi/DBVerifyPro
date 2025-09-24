# Docker Setup per DB-Verify

Questo documento spiega come costruire ed eseguire DB-Verify utilizzando Docker.

## File Docker Aggiornati

### 1. Dockerfile
Il Dockerfile è stato completamente rivisto per:
- ✅ Utilizzare la porta corretta (5000 invece di 3000)
- ✅ Costruire correttamente il progetto TypeScript full-stack
- ✅ Compilare sia frontend (Vite) che backend (esbuild)
- ✅ Ottimizzare per produzione rimuovendo le dipendenze dev dopo la build
- ✅ Implementare sicurezza con utente non-root
- ✅ Supportare variabili d'ambiente per configurazione

### 2. .dockerignore
Ottimizza la build escludendo file non necessari:
- File di sviluppo, log, cache
- Dipendenze Node.js (vengono reinstallate nel container)
- File di configurazione IDE

### 3. docker-compose.yml
Configurazione pronta all'uso con:
- Health check automatico
- Riavvio automatico in caso di errore
- Esempio di integrazione con PostgreSQL (opzionale)

## Come Utilizzare

### Opzione 1: Docker direttamente

```bash
# Costruisci l'immagine
docker build -t dbverify .

# Esegui il container
docker run -p 5000:5000 --name dbverify-app dbverify

# Con variabili d'ambiente personalizzate
docker run -p 5000:5000 -e PORT=8080 --name dbverify-app dbverify
```

### Opzione 2: Docker Compose (Raccomandato)

```bash
# Esegui con Docker Compose
docker-compose up -d

# Visualizza i log
docker-compose logs -f

# Ferma i servizi
docker-compose down
```

### Opzione 3: Con Database PostgreSQL

Se hai bisogno di un database PostgreSQL per i dati dell'applicazione:

1. Decommenta la sezione PostgreSQL in `docker-compose.yml`
2. Crea un file `.env` con le credenziali:

```bash
# .env
DATABASE_URL=postgresql://dbverify:your_secure_password@postgres:5432/dbverify
PGHOST=postgres
PGPORT=5432
PGUSER=dbverify
PGPASSWORD=your_secure_password
PGDATABASE=dbverify
```

3. Esegui: `docker-compose up -d`

## Configurazione

### Variabili d'Ambiente Supportate

- `PORT`: Porta del server (default: 5000)
- `NODE_ENV`: Ambiente di esecuzione (production per il container)
- `DATABASE_URL`: URL completo del database PostgreSQL (se utilizzato)
- `PG*`: Variabili specifiche per PostgreSQL

### Health Check

L'applicazione include un endpoint di health check:
- **URL**: `GET /api/health`
- **Risposta**: Status dell'applicazione, uptime, versione

Esempio di risposta:
```json
{
  "status": "healthy",
  "timestamp": "2025-09-23T10:30:00.000Z",
  "uptime": 123.456,
  "version": "1.0.0"
}
```

## Risoluzione Problemi

### Port Already in Use
```bash
# Controlla quale processo usa la porta 5000
netstat -ano | findstr :5000

# Cambia porta con variabile d'ambiente
docker run -p 8080:8080 -e PORT=8080 --name dbverify-app dbverify
```

### Container Non si Avvia
```bash
# Visualizza i log del container
docker logs dbverify-app

# Esegui in modalità interattiva per debug
docker run -it --entrypoint /bin/sh dbverify
```

### Build Fallisce
```bash
# Build con output completo per vedere gli errori
docker build --no-cache --progress=plain -t dbverify .

# Verifica che tutti i file necessari siano presenti
docker run --rm -it --entrypoint /bin/sh dbverify -c "ls -la /usr/src/app"
```

## Performance e Sicurezza

### Ottimizzazioni Implementate
- ✅ Multi-stage build con rimozione dipendenze dev
- ✅ Utente non-root per sicurezza
- ✅ .dockerignore per build più veloce
- ✅ Cache delle dipendenze Docker ottimizzata
- ✅ Health check per monitoring

### Monitoring
Il container supporta monitoring tramite:
- Health check endpoint (`/api/health`)
- Log strutturati con timestamp
- Process uptime tracking

### Sicurezza
- Container eseguito con utente non-root (`dbverify:nodejs`)
- Dipendenze di produzione minimali
- Nessuna credenziale hardcoded nel container