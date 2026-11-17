# Lagershop

Der Lagershop ist die Lager- und Webshop-Verwaltung für Schulen mit Werkstätten
und Laboren:

- **Shop:** Schüler und Lehrkräfte stöbern im Katalog, füllen den Warenkorb und
  bestellen Material.
- **Freigaben:** Bestellungen werden je nach Regel von Lehrkräften genehmigt.
- **Verleih:** Geräte ausleihen, Rückgaben verfolgen, Erinnerungen per Mail.
- **Verwaltung:** Katalog, Lagerräume, Kostenstellen, Stücklisten, Nachbestellungen.

Entwickelt und betrieben von der HTL Braunau. Diese Seite beschreibt, wie eine
Schule den Lagershop **auf dem eigenen Server** betreibt. Hinweise für die
Entwicklung stehen in [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md).

**Inhalt:**
[1. Voraussetzungen](#1-voraussetzungen) ·
[2. Microsoft Entra ID](#2-microsoft-entra-id) ·
[3. Installation](#3-installation) ·
[4. Erste Anmeldung](#4-erste-anmeldung) ·
[5. Automatische Updates](#5-automatische-updates) ·
[6. Backups](#6-backups-und-wiederherstellung) ·
[7. Betrieb](#7-betrieb-und-häufige-probleme)

Der Lagershop wird als fertiges Docker-Image ausgeliefert. Du baust nichts selbst:
Dein Server holt neue Versionen aus der GitHub Container Registry und spielt sie
ein, inklusive Datenbank-Migrationen.

---

## 1. Voraussetzungen

| | |
|---|---|
| Server | Linux-VM oder LXC (bei LXC: `nesting=1,keyctl=1`), 2 Kerne, 4 GB RAM, 20 GB Speicher reichen für eine Schule |
| Software | Docker Engine ≥ 24 mit Compose-Plugin (`docker compose version`), `curl` |
| Netzwerk ausgehend | `ghcr.io`, `raw.githubusercontent.com`, `api.github.com`, `login.microsoftonline.com`, `graph.microsoft.com` |
| Netzwerk eingehend | HTTPS über deinen Reverse Proxy (nginx, Traefik, Caddy …). Die App selbst spricht nur HTTP auf Port 3000. |
| DNS + Zertifikat | z. B. `lager.deine-schule.at` |
| Microsoft 365 | Entra-ID-Tenant, in dem du App-Registrierungen anlegen und Admin-Consent erteilen darfst |

---

## 2. Microsoft Entra ID

Leg in **deinem** Tenant eine eigene App-Registrierung an.

### 2.1 App-Registrierung „Lagershop“

Entra Admin Center → *Anwendungen* → *App-Registrierungen* → *Neue Registrierung*

- **Unterstützte Kontotypen:** *Nur Konten in diesem Organisationsverzeichnis* (Single Tenant)
- **Umleitungs-URI:** Plattform *Web*,
  `https://lager.deine-schule.at/api/auth/callback/azure-ad`
  (Der Pfad muss exakt so lauten. Die Domain muss mit `AUTH_URL` übereinstimmen.)

Danach:

- **Zertifikate & Geheimnisse:** neuen geheimen Clientschlüssel anlegen. Den *Wert*
  trägst du als `AZURE_AD_CLIENT_SECRET` ein. **Notier dir das Ablaufdatum.** Läuft
  der Schlüssel ab, kann sich niemand mehr anmelden und es gehen keine Mails mehr raus.
- **Übersicht:** *Anwendungs-ID (Client)* → `AZURE_AD_CLIENT_ID`,
  *Verzeichnis-ID (Mandant)* → `AZURE_AD_TENANT_ID`.
- **Token-Konfiguration** → *Gruppenanspruch hinzufügen* → *Sicherheitsgruppen*
  (im ID-Token). Dann ermittelt die App die Rolle direkt beim Login. Fehlt der
  Anspruch, fragt sie Microsoft Graph.

### 2.2 API-Berechtigungen

| Typ | Berechtigung | Wofür |
|---|---|---|
| Delegiert | `openid`, `profile`, `email`, `offline_access`, `User.Read` | Anmeldung |
| **Anwendung** | `GroupMember.Read.All` | Rolle über Gruppenmitgliedschaft, Lehrkräfte-Liste für Freigaben |
| **Anwendung** | `User.Read.All` | Kürzel und Personalnummer in der Lehrkräfte-Liste |
| **Anwendung** | `Mail.Send` | Nur bei Mailversand, siehe 2.4 |

Anschließend **„Administratorzustimmung für … erteilen“** klicken. Ohne Admin-Consent
schlagen Rollenermittlung und Lehrkräfte-Liste fehl.

Weitere Berechtigungen sind nicht nötig, insbesondere kein `Group.Read.All`,
`Directory.Read.All` oder irgendein Schreibrecht.

### 2.3 Gruppen

Drei Sicherheitsgruppen; die Objekt-IDs kommen in die `.env`:

| Gruppe | Variable | Rolle |
|---|---|---|
| Lager-Admins | `ROLE_ADMIN_GROUP_ID` | Katalog, Lager, Benutzer, Einstellungen |
| Lehrkräfte | `ROLE_TEACHER_GROUP_ID` | Freigaben, Verleih; Mitglieder erscheinen als genehmigende Lehrkräfte |
| Schüler | `ROLE_STUDENT_GROUP_ID` | Shop |

Ist jemand in mehreren Gruppen, gilt die höchste Rolle (Admin > Lehrkraft > Schüler).
Verschachtelte Gruppen werden aufgelöst.

### 2.4 Optional: E-Mail-Versand

Der Lagershop verschickt Mails zu Freigaben, Bestellungen und Leihfristen über ein
freigegebenes Postfach (Shared Mailbox).

- Anwendungsberechtigung `Mail.Send` mit Admin-Consent (siehe 2.2)
- **Unbedingt einschränken:** `Mail.Send` als Anwendungsberechtigung darf sonst im
  Namen *jedes* Postfachs deines Tenants senden. Beschränke die App per
  *RBAC for Applications* in Exchange Online (oder per Application Access Policy)
  auf das eine Absender-Postfach.
- Werte: `MAIL_FROM_ADDRESS` (Absender-Postfach), optional `MAIL_OPS_BCC_ADDRESS`
  (Kopie aller Mails)

Ohne `MAIL_FROM_ADDRESS` funktioniert alles, nur ohne Mails.

---

## 3. Installation

Alle Befehle als root. Die benötigten Dateien liegen in diesem Repository und
werden direkt von GitHub geladen.

### 3.1 Dateien holen

```bash
REPO=https://raw.githubusercontent.com/HTL-Braunau-IT/lagerverwaltung/main
mkdir -p /srv/lagershop/{postgres,uploads,backups}
chmod 700 /srv/lagershop/backups
cd /srv/lagershop
curl -fsSL "$REPO/docker-compose.yaml"       -o docker-compose.yaml
curl -fsSL "$REPO/self-hosting/env.example"  -o .env
chmod 600 .env
```

| Datei im Repository | Zweck |
|---|---|
| [`docker-compose.yaml`](docker-compose.yaml) | Der Stack (siehe unten) |
| [`self-hosting/env.example`](self-hosting/env.example) | Vorlage für `.env`, kommentiert |
| [`self-hosting/lagershop-update.sh`](self-hosting/lagershop-update.sh) | Update-Skript (Abschnitt 5) |
| [`self-hosting/lagershop-backup.sh`](self-hosting/lagershop-backup.sh) | Backup-Skript (Abschnitt 6) |
| [`self-hosting/systemd/`](self-hosting/systemd) | Zeitsteuerung für Update und Backup |

Der Stack besteht aus vier Containern:

| Container | Aufgabe |
|---|---|
| `db` | PostgreSQL 17, deutsche Sortierung (ICU `de-AT`) |
| `migrate` | Läuft einmal pro Start, spielt Datenbank-Migrationen ein und beendet sich |
| `web` | Die Anwendung. Startet erst, wenn `migrate` fehlerfrei beendet wurde. |
| `scheduler` | Löst täglich um 07:00 die Erinnerungs-Mails aus (Leihfristen, offene Freigaben) |

### 3.2 Konfiguration (`.env`)

Füll `/srv/lagershop/.env` aus. Die Vorlage erklärt jeden Wert. Zufallswerte
erzeugst du so:

```bash
openssl rand -hex 32
```

**Pflicht:**

| Variable | Inhalt |
|---|---|
| `AUTH_URL` | Öffentliche Adresse, z. B. `https://lager.deine-schule.at` |
| `AUTH_SECRET` | Zufallswert. Ändern meldet alle Benutzer ab. |
| `POSTGRES_PASSWORD` | Zufallswert, nur Buchstaben und Ziffern |
| `AZURE_AD_TENANT_ID`, `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET` | Aus Abschnitt 2.1 |
| `ROLE_ADMIN_GROUP_ID`, `ROLE_TEACHER_GROUP_ID`, `ROLE_STUDENT_GROUP_ID` | Aus Abschnitt 2.3 |
| `CRON_SECRET` | Zufallswert; schützt die Erinnerungs-Aufrufe |

**Optional:**

| Variable | Inhalt |
|---|---|
| `SCHOOL_NAME` | Name im Kopfbereich, Seitentitel und in Abrechnungs-PDFs |
| `MAIL_FROM_ADDRESS`, `MAIL_OPS_BCC_ADDRESS` | E-Mail-Versand (2.4) |
| `HTTP_BIND`, `HTTP_PORT` | Wo die App lauscht (Standard `127.0.0.1:3000`) |

Fehlt ein Pflichtwert, verweigert `docker compose` den Start und nennt die fehlende
Variable. Setz Werte nicht in Anführungszeichen.

### 3.3 Erster Start

Uploads (Produktbilder, Dokumente) landen in `/srv/lagershop/uploads`. Der Ordner muss
dem Benutzer gehören, unter dem die App im Container läuft:

```bash
cd /srv/lagershop
IMG=$(grep ^APP_IMAGE= .env | cut -d= -f2-)
docker pull "$IMG"
chown "$(docker run --rm --entrypoint id "$IMG" -u):$(docker run --rm --entrypoint id "$IMG" -g)" uploads
```

Dann starten:

```bash
docker compose pull
docker compose up -d
docker compose logs -f migrate web
curl -fsS http://127.0.0.1:3000/api/health
```

### 3.4 Reverse Proxy

Leite HTTPS auf `http://127.0.0.1:3000` weiter und setz die üblichen
`X-Forwarded-*`-Header. Beispiel nginx:

```nginx
location / {
    proxy_pass         http://127.0.0.1:3000;
    proxy_set_header   Host $host;
    proxy_set_header   X-Forwarded-Proto $scheme;
    proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
    client_max_body_size 25m;   # Bild- und Dokument-Uploads
}
```

Oder Caddy:

```
lager.deine-schule.at {
    reverse_proxy 127.0.0.1:3000
}
```

Läuft der Proxy auf einem anderen Server, setz `HTTP_BIND=0.0.0.0` und sperr
Port 3000 per Firewall für alle außer dem Proxy, damit die App nicht unverschlüsselt
im LAN erreichbar ist.

### 3.5 Eigenes Login-Hintergrundbild und Favicon

`docker-compose.yaml` wird vom Update-Skript ersetzt. Eigene Ergänzungen gehören
deshalb in `docker-compose.override.yaml` im selben Ordner. Docker Compose liest sie
automatisch mit:

```yaml
services:
  web:
    volumes:
      - ./branding/login-background.jpg:/app/public/images/htl-login-background.jpg:ro
      - ./branding/favicon.ico:/app/public/favicon.ico:ro
```

Danach `docker compose up -d`.

---

## 4. Erste Anmeldung

1. Mit einem Konto aus der Admin-Gruppe unter `AUTH_URL` anmelden.
2. *Administration*: Lagerräume, Kategorien, Kostenstellen und Einstellungen
   anlegen (u. a. Lager-Postfach und Freigaberegeln).
3. Produkte anlegen oder importieren.

---

## 5. Automatische Updates

Dein Server holt sich Updates selbst (Pull-Prinzip). Die HTL Braunau braucht keinen
Zugang zu deinem Netz.

### 5.1 Update-Kanäle

| Tag | Inhalt | Empfehlung |
|---|---|---|
| `stable` | nur veröffentlichte Releases | **für Schulbetrieb empfohlen** |
| `latest` | jeder Build auf `main` | nur nach Absprache, häufige Updates |
| `v1.2.0` o. ä. | genau ein Release | zum Festnageln |
| `sha-<commit>` | genau ein bestimmter Stand | zum Festnageln oder Zurückrollen |

Den Kanal legst du über `APP_IMAGE` in der `.env` fest, z. B.
`APP_IMAGE=ghcr.io/htl-braunau-it/lagerverwaltung:stable`.

### 5.2 Was das Update-Skript tut

[`self-hosting/lagershop-update.sh`](self-hosting/lagershop-update.sh):

1. Holt die **zum Kanal passende** `docker-compose.yaml` aus diesem Repository.
   Bei `stable` ist das der Stand des neuesten Releases, bei `latest` der Stand
   von `main`. Die neue Datei wird nur übernommen, wenn sie mit deiner `.env`
   funktioniert. Braucht sie eine neue Pflichtvariable, bricht das Skript ab,
   ohne etwas zu ändern, und legt die neue Datei als `docker-compose.yaml.new` ab.
2. Holt das neue Image. Gibt es nichts Neues, endet es hier.
3. Sichert die Datenbank (`backups/pre-update-*.dump`, 14 Tage aufbewahrt).
4. Startet den Stack neu. `migrate` spielt die Migrationen ein, erst dann startet
   `web`.
5. Prüft `/api/health` bis zu 150 Sekunden lang. Schlägt das fehl, rollt es auf
   das vorherige Image und die vorherige Compose-Datei zurück.

Hast du `docker-compose.yaml` selbst angepasst, setz
`LAGERSHOP_SYNC_COMPOSE=false` in der `.env`. Dann ersetzt das Skript die Datei
nie; Änderungen übernimmst du anhand der Release-Hinweise selbst. Besser: lass sie
unverändert und nutz `docker-compose.override.yaml` (3.5).

### 5.3 Einrichten

```bash
REPO=https://raw.githubusercontent.com/HTL-Braunau-IT/lagerverwaltung/main
curl -fsSL "$REPO/self-hosting/lagershop-update.sh" -o /usr/local/bin/lagershop-update
chmod 755 /usr/local/bin/lagershop-update
for u in lagershop-update.service lagershop-update.timer; do
  curl -fsSL "$REPO/self-hosting/systemd/$u" -o "/etc/systemd/system/$u"
done
systemctl daemon-reload
systemctl enable --now lagershop-update.timer
```

Das Update läuft dann jede Nacht um 03:45, nach dem Backup (01:30). Liegt dein
Stack nicht unter `/srv/lagershop`, pass den Pfad in `lagershop-update.service` an.

Verlauf ansehen:

```bash
journalctl -u lagershop-update.service
```

Sofort aktualisieren:

```bash
systemctl start lagershop-update.service
```

Willst du Updates lieber von Hand freigeben, lass den Timer weg und starte
den Service bei Bedarf selbst.

> **Kein Watchtower o. Ä. verwenden.** Solche Werkzeuge starten nur Container neu,
> deren Image sich geändert hat. Sie sichern die Datenbank nicht vorher und rollen
> bei einer fehlgeschlagenen Migration nicht zurück.

### 5.4 Bestimmte Version festhalten

In der `.env`:

```dotenv
APP_IMAGE=ghcr.io/htl-braunau-it/lagerverwaltung:v1.2.0
```

Dann `systemctl start lagershop-update.service`. Zurück zum normalen Kanal kommst
du, indem du wieder `:stable` einträgst.

---

## 6. Backups und Wiederherstellung

### 6.1 Nächtliches Backup

Zusätzlich zum Backup vor jedem Update sichert ein nächtlicher Dump um 01:30. Die
Dumps werden 30 Tage aufbewahrt und sind nur für root lesbar.

```bash
REPO=https://raw.githubusercontent.com/HTL-Braunau-IT/lagerverwaltung/main
curl -fsSL "$REPO/self-hosting/lagershop-backup.sh" -o /usr/local/bin/lagershop-backup
chmod 755 /usr/local/bin/lagershop-backup
for u in lagershop-backup.service lagershop-backup.timer; do
  curl -fsSL "$REPO/self-hosting/systemd/$u" -o "/etc/systemd/system/$u"
done
systemctl daemon-reload
systemctl enable --now lagershop-backup.timer
```

**Außerhalb des Servers sichern:** `/srv/lagershop/backups`, `/srv/lagershop/uploads`
(Produktbilder und Dokumente sind nicht in der Datenbank) und die `.env`.

### 6.2 Wiederherstellen

```bash
cd /srv/lagershop
docker compose stop web scheduler
docker compose exec -T db psql -U lager -d postgres \
  -c 'DROP DATABASE lagerverwaltung;' -c 'CREATE DATABASE lagerverwaltung;'
docker compose exec -T db pg_restore -U lager -d lagerverwaltung --no-owner \
  < backups/<datei>.dump
docker compose up -d
```

Ist eine **Migration** der Grund für die Wiederherstellung, geh so vor:

1. Das `pre-update-*`-Backup dieses Updates einspielen.
2. Die vorherige Version festhalten (5.4).
3. Die HTL Braunau informieren.

Der automatische Rollback im Update-Skript fasst die Datenbank bewusst nicht an.
Sonst gingen alle Eingaben seit dem Backup verloren.

---

## 7. Betrieb und häufige Probleme

```bash
cd /srv/lagershop
docker compose ps                          # Zustand aller Container
docker compose logs -f web                 # App-Log
docker compose logs migrate                # warum ein Update fehlschlug
docker compose logs scheduler              # Erinnerungs-Mails
curl -s 127.0.0.1:3000/api/health          # App + Datenbank erreichbar? Welcher Stand?
```

Nach Änderungen an der `.env`:

```bash
docker compose up -d
```

| Symptom | Ursache |
|---|---|
| `docker compose` meldet „… fehlt“ | Pflichtwert in `.env` fehlt (3.2) |
| Login: Fehler `AADSTS50011` | Umleitungs-URI in Entra stimmt nicht mit `AUTH_URL` überein |
| Login geht, aber falsche Rolle | Person in keiner der drei Gruppen, Gruppen-ID falsch oder Admin-Consent fehlt |
| Lehrkräfte-Liste bei Freigaben leer | `GroupMember.Read.All` ohne Admin-Consent oder `ROLE_TEACHER_GROUP_ID` falsch |
| Plötzlich kein Login mehr | Client-Secret abgelaufen (2.1) |
| Keine Mails | `MAIL_FROM_ADDRESS` leer, `Mail.Send` ohne Consent oder Postfach nicht freigegeben |
| Bild-Upload schlägt fehl | `uploads` gehört nicht dem App-Benutzer (3.3) |
| `docker compose pull` schlägt fehl | Kein ausgehender Zugriff auf `ghcr.io` (Firewall/Proxy) |
| Update bricht ab: „neue docker-compose.yaml passt nicht zur .env“ | Neue Pflichtvariable, siehe Release-Hinweise; dann Update erneut starten |
| `web` startet nach Update nicht | `docker compose logs migrate`, dann HTL Braunau kontaktieren |

### Kontakt

Fragen, Fehler und Wünsche bitte als
[Issue auf GitHub](https://github.com/HTL-Braunau-IT/lagerverwaltung/issues). Bei
fehlgeschlagenen Updates bitte die Ausgabe von `docker compose logs migrate web`
und den verwendeten Image-Tag mitschicken.

## Lizenz

[MIT](LICENSE) – du darfst den Lagershop frei verwenden, anpassen und
weitergeben, solange der Lizenzhinweis erhalten bleibt. Keine Gewährleistung.
