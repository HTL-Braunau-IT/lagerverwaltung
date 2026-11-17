# Lagershop selbst betreiben

Anleitung für Schulen, die den Lagershop auf eigenen Servern betreiben. Jede Installation
hat ihre eigene Datenbank und ihre eigene Entra-ID-App-Registrierung; Updates kommen als
Docker-Image aus `ghcr.io/htl-braunau-it/lagerverwaltung`.

## Voraussetzungen

- Linux-Server mit Docker + Docker Compose Plugin
- Öffentlicher DNS-Name mit TLS (Reverse Proxy, z. B. Caddy, nginx, Traefik)
- Microsoft 365 / Entra ID Tenant mit Rechten für App-Registrierungen und Admin Consent
- Ein freigegebenes Postfach (Shared Mailbox) für den Mailversand (optional)

## 1. Entra-ID-App-Registrierung

1. **App-Registrierung anlegen** (Single tenant).
2. **Redirect URI** (Plattform „Web“): `https://<ihre-domain>/api/auth/callback/azure-ad`
3. **Client Secret** erstellen → `AZURE_AD_CLIENT_SECRET`. Ablaufdatum notieren und rechtzeitig erneuern.
4. **API-Berechtigungen** (Microsoft Graph) und danach **Administratorzustimmung erteilen**:

   | Typ | Berechtigung | Wofür |
   |---|---|---|
   | Delegiert | `openid`, `profile`, `email`, `offline_access`, `User.Read` | Anmeldung |
   | Anwendung | `GroupMember.Read.All` | Rollen-Ermittlung über Gruppen, Lehrkräfte-Verzeichnis |
   | Anwendung | `User.Read.All` | Zusätzliche Felder im Lehrkräfte-Verzeichnis (`employeeId`, Kürzel) |
   | Anwendung | `Mail.Send` | Mailversand über das freigegebene Postfach (nur bei Mailversand) |

5. **Token-Konfiguration → Gruppenanspruch hinzufügen** → „Sicherheitsgruppen“ für das ID-Token.
   Dann wird die Rolle meist ohne Graph-Aufruf ermittelt.
6. **Drei Sicherheitsgruppen** (Admin, Lehrkraft, Schüler) anlegen bzw. bestehende verwenden und
   deren Objekt-IDs notieren. Rolle mit Priorität Admin > Lehrkraft > Schüler.

> **Empfehlung:** `Mail.Send` als Anwendungsberechtigung erlaubt das Senden als *jeder* Benutzer.
> Mit einer Exchange *Application Access Policy* bzw. *RBAC for Applications* auf das
> freigegebene Postfach einschränken.

## 2. Installation

```sh
sudo mkdir -p /opt/lagershop && cd /opt/lagershop
# docker-compose.yml, .env.example und update.sh aus dem Ordner deploy/ hierher kopieren
cp .env.example .env
chmod 600 .env
chmod +x update.sh
```

`.env` ausfüllen (siehe Kommentare in der Datei):

| Variable | Pflicht | Hinweis |
|---|---|---|
| `POSTGRES_PASSWORD` | ja | Nur Buchstaben/Ziffern verwenden (wird in die Datenbank-URL eingesetzt) |
| `SCHOOL_NAME` | empfohlen | Name im Kopfbereich, Seitentitel und Abrechnungs-PDF |
| `AUTH_SECRET` | ja | `openssl rand -base64 32` |
| `AUTH_URL` | ja | Öffentliche URL, z. B. `https://lager.ihre-schule.at` |
| `AZURE_AD_TENANT_ID`, `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET` | ja | Aus der App-Registrierung |
| `ROLE_ADMIN_GROUP_ID`, `ROLE_TEACHER_GROUP_ID`, `ROLE_STUDENT_GROUP_ID` | ja | Objekt-IDs der Gruppen |
| `MAIL_FROM_ADDRESS` | optional | Freigegebenes Postfach; ohne Wert werden keine Mails versendet |
| `MAIL_OPS_BCC_ADDRESS` | optional | Kopie aller Mails (auch in der Administration einstellbar) |
| `CRON_SECRET`, `LOAN_REMINDER_CRON_SECRET` | **ja** | Ohne Wert sind die Cron-Endpunkte ungeschützt |
| `APP_TAG` | optional | `main` (jeder Stand) oder `stable` (nur Releases) |

Starten:

```sh
docker compose up -d
docker compose logs -f app
```

Beim Start werden die Datenbank-Migrationen automatisch ausgeführt. Die App lauscht auf
`127.0.0.1:3000`; der Reverse Proxy leitet die öffentliche Domain dorthin weiter. Beispiel Caddy:

```
lager.ihre-schule.at {
    reverse_proxy 127.0.0.1:3000
}
```

Der erste Benutzer in der Admin-Gruppe kann sich anmelden und unter *Administration* Lager,
Kategorien und Einstellungen anlegen.

**Eigenes Login-Hintergrundbild / Favicon:** liegen im Volume `app-public`
(`/app/public/images/htl-login-background.jpg`, `/app/public/favicon.ico`) und können dort ersetzt werden:

```sh
docker compose cp ./hintergrund.jpg app:/app/public/images/htl-login-background.jpg
```

## 3. Erinnerungs-Jobs (Cron)

Täglich aufrufen, z. B. per `crontab -e`:

```
0 7 * * *  curl -fsS -X POST -H "x-cron-secret: <LOAN_REMINDER_CRON_SECRET>" http://127.0.0.1:3000/api/backend/loans/reminders
5 7 * * *  curl -fsS -X POST -H "x-cron-secret: <CRON_SECRET>" http://127.0.0.1:3000/api/backend/orders/approval-reminders
```

## 4. Updates

Jeder Push auf `main` im Haupt-Repository erzeugt ein neues Image `:main`. Releases (Git-Tag `vX.Y.Z`)
erzeugen zusätzlich `:stable`. `update.sh` sichert die Datenbank, lädt das neue Image und startet die App
neu (Migrationen laufen dabei automatisch):

```
30 3 * * *  /opt/lagershop/update.sh >> /var/log/lagershop-update.log 2>&1
```

Sicherungen landen in `/opt/lagershop/backups` (14 Tage). Wiederherstellen:

```sh
docker compose stop app
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' < backups/lager-<stamp>.dump
docker compose start app
```

**Auf eine bestimmte Version zurück:** `APP_TAG=sha-<commit>` in `.env` setzen und
`docker compose up -d app`. Achtung: bereits ausgeführte Migrationen werden dabei *nicht*
zurückgenommen – ggf. vorher das Backup von vor dem Update einspielen.

Ist das Image privat, einmalig anmelden (Token mit `read:packages`):

```sh
echo <TOKEN> | docker login ghcr.io -u <github-benutzer> --password-stdin
```
