# Re-Lapse

A shared disposable camera. Shoot, wait, develop.

## The gate

A new camera asks to join with a name. Until that request is accepted it cannot shoot, and it cannot open the feed, albums, events, or profiles. Santiago decides at `/gate`.

The portal checks `RELAPSE_ADMIN_TOKEN`. Keep that value in the server environment. Do not commit it, and the server does not print it. Until that value is set, `/gate` stays shut. There is no built-in key.
