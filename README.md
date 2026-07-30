# Kästli Variantenvergleich

Öffentliche Webanwendung für den Preis- und CO₂-Vergleich einer
Bauherrenvariante mit einer frei wählbaren Kästli-Alternative. Der Rechner
berücksichtigt Herstellungsemissionen A1–A3 und weist den Transport separat aus.

## Architektur

- Next.js-Oberfläche auf Basis von Vinext
- Cloudflare Worker für Rechner, API und Word-Export
- Cloudflare D1 für versionierte Produkt- und Transportstammdaten
- Cloudflare Access für `/admin*` und `/api/admin*`
- GitHub Actions für kontrollierte manuelle Veröffentlichungen

Der öffentliche Rechner unter `/` benötigt keine Anmeldung. Schreibzugriffe
bleiben serverseitig gesperrt, solange keine gültige Cloudflare-Access-Identität
mit einer in `ADMIN_EMAILS` freigegebenen E-Mail-Adresse vorliegt.

Die Cloudflare-Fassung vertraut ausschliesslich auf kryptografisch geprüfte
Cloudflare-Access-Tokens. Frei gesetzte Browser-Header verleihen keine
Adminrechte.

## Lokal prüfen

Voraussetzung ist Node.js ab Version 22.13.

```bash
npm run install:ci
npm run lint
npm test
```

## Eigenständige Cloudflare-Einrichtung

Für den Variantenvergleich ist ein separates GitHub-Repository und ein
separater Cloudflare Worker mit eigener D1-Datenbank vorgesehen. Das bestehende
Nachhaltigkeitsdashboard wird weder als Quellziel noch als Laufzeitressource
verwendet.

1. Im GitHub-Repository unter **Settings → Secrets and variables → Actions**
   folgende Repository-Secrets hinterlegen:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
2. Für den API-Token werden Rechte zum Veröffentlichen von Workers und zum
   Schreiben von D1-Datenbanken benötigt. Token und Konto-ID gehören
   ausschliesslich in GitHub Secrets, nie in den Quellcode.
3. Folgende Repository-Variablen können hinterlegt werden:
   - `CLOUDFLARE_D1_DATABASE_NAME` (Standard:
     `kaestli-variantenvergleich`)
   - `CLOUDFLARE_WORKER_NAME` (Standard:
     `kaestli-variantenvergleich`)
   - `ADMIN_EMAILS` (kommagetrennte freigegebene E-Mail-Adressen)
   - `CLOUDFLARE_ACCESS_ISSUER`
   - `CLOUDFLARE_ACCESS_AUD`
4. In Cloudflare Zero Trust eine Access-Anwendung für die eigene Domain oder
   Subdomain erstellen und nur die Pfade `/admin*` und `/api/admin*` schützen.
5. Unter **Actions → Cloudflare veröffentlichen** den Workflow manuell starten.

Der Workflow legt die eigene D1-Datenbank bei Bedarf automatisch in Westeuropa
an, prüft den Quellcode, führt D1-Migrationen aus und veröffentlicht den
eigenständigen Worker. `workers_dev` bleibt aktiv, damit der Rechner auch ohne
eigene Domain öffentlich erreichbar ist. Für den geschützten Adminbereich ist
eine über Cloudflare verwaltete Domain oder Subdomain erforderlich. Solange
Cloudflare Access nicht vollständig konfiguriert ist, bleibt der Rechner
öffentlich nutzbar, während der Adminbereich keine Schreibzugriffe akzeptiert.
