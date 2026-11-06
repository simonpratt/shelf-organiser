# An optional login with a signed cookie, its key kept in the database

The app was LAN-only with no login; now it can ask for one username and password, set by `APP_USERNAME` and `APP_PASSWORD`, so it can sit behind a reverse proxy. With neither set there is still no login (and the server logs a warning), so dev, the e2e suite and existing installs carry on unchanged. A session is a stateless HMAC-signed cookie (username and expiry, 90 days, renewed once a day of it has been used), not a session table, and the browser keeps it, so a phone stays logged in. The signing key is derived from a random key stored in the database and the username and password: a restart or a new image keeps the browser logged in, and changing the password logs every browser out. Only `/api/` needs the session; the client's files and the speech model hold no data, so they stay open and keep their long caching.

## Considered options

- **HTTP Basic Auth**: no login page, but phones prompt again unpredictably, and there is no way to log out.
- **A key random per process, or a third `APP_SESSION_SECRET`**: the first logs the phone out on every deploy, the second is one more setting to get right, when the database already persists.
