# 1. Utilizza un'immagine di base leggera e ufficiale di Node.js con Alpine Linux
FROM node:20-alpine AS builder

# 2. Installa Python e strumenti di build necessari per alcune dipendenze native
RUN apk add --no-cache python3 make g++

# 3. Imposta la directory di lavoro all'interno del container
WORKDIR /usr/src/app

# 4. Copia i file di configurazione delle dipendenze per sfruttare la cache Docker
COPY package*.json ./
COPY tsconfig.json ./
COPY vite.config.ts ./
COPY tailwind.config.ts ./
COPY postcss.config.js ./
COPY components.json ./

# 5. Installa tutte le dipendenze (necessarie per la build)
RUN npm ci

# 6. Copia tutto il codice sorgente
COPY . .

# 7. Esegui la build del progetto (frontend + backend)
RUN npm run build

# === PRODUCTION STAGE ===
FROM node:20-alpine AS production

# 8. Installa solo le dipendenze native necessarie per la produzione
RUN apk add --no-cache python3

# 9. Imposta la directory di lavoro
WORKDIR /usr/src/app

# 10. Copia i file di configurazione delle dipendenze
COPY package*.json ./

# 11. Installa SOLO le dipendenze di produzione
RUN npm ci --only=production && npm cache clean --force

# 12. Copia i file build dalla fase builder
COPY --from=builder /usr/src/app/dist ./dist

# 13. Crea un utente non-root per eseguire l'applicazione (sicurezza)
RUN addgroup -g 1001 -S nodejs && \
    adduser -S dbverify -u 1001

# 14. Cambia proprietario dei file all'utente non-root
RUN chown -R dbverify:nodejs /usr/src/app
USER dbverify

# 15. Esponi la porta su cui l'applicazione è in ascolto (default: 5000)
EXPOSE 5000

# 16. Imposta le variabili d'ambiente per la produzione
ENV NODE_ENV=production

# 17. Comando per avviare l'applicazione
CMD [ "npm", "start" ]