# IRIK Host — Cloudflare Workers + D1

Full-stack control panel for IRIK Host. Minecraft Nodes are intentionally NOT connected yet. Server Start/Stop/Restart updates the control-plane status only.

## Owner
Email: rayanjarrar82@gmail.com
Password: eve33join-

## Cloudflare deployment
1. Install Node.js 18+.
2. Extract this ZIP and open a terminal in the project folder.
3. Run `npm install`.
4. Run `npx wrangler login` and sign in to your Cloudflare account.
5. Create the D1 database:
   `npx wrangler d1 create irik-host-db`
6. Copy the returned database_id into `wrangler.jsonc` replacing `REPLACE_WITH_YOUR_D1_DATABASE_ID`.
7. Initialize the production database:
   `npx wrangler d1 execute irik-host-db --remote --file=./schema.sql`
8. Deploy:
   `npx wrangler deploy`

Cloudflare will give you a `*.workers.dev` URL.

## Local test
`npx wrangler dev`

## Important security note
The owner password is included in `schema.sql` because this is the requested initial account. Change it after first login by adding a password-change endpoint before making the project public, or replace the seeded hash with your own generated credentials.

## Future Node
The Worker is the control plane. Later, add a private Node/Daemon that authenticates to a Worker API and controls Docker/Minecraft on a real VPS. Do not expose Docker control directly to the browser.
