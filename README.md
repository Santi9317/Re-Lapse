# Re-Lapse

A shared disposable camera. Shoot, wait, develop.

## The gate

A new camera asks to join with a name. Until that request is accepted it cannot shoot, and it cannot open the feed, albums, events, or profiles. Santiago decides at `/gate`.

The portal checks `RELAPSE_ADMIN_TOKEN`. Keep that value in the server environment. Do not commit it, and the server does not print it.

On a machine with no `DATABASE_URL`, an unset `RELAPSE_ADMIN_TOKEN` falls back to the local key `relapse-local-gate` so the portal can be tried. The hosted app has a database, so this fallback stays off and `/gate` stays shut until `RELAPSE_ADMIN_TOKEN` is set.
