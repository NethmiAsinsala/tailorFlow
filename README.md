# Thanu Fashion Shop Manager

A mobile-first tailoring business manager powered by Supabase.

## Included modules

- Secure owner login and persistent sessions
- Dashboard with order, customer, payment and stock summaries
- Customer management
- Order tracking with balances and production statuses
- Reusable measurement profiles
- Inventory and low-stock alerts
- Payment records and monthly totals
- Supabase Row Level Security so each signed-in owner sees only their data

## Supabase setup

1. Open your Supabase project.
2. Open **SQL Editor** and run [`supabase/schema.sql`](supabase/schema.sql).
3. In **Authentication > Users**, create the shop owner's email and password if one does not already exist.
4. Confirm the URL and publishable key in [`js/supabase.js`](js/supabase.js) belong to that project.

The schema uses namespaced `tf_*` table names, so it does not alter or delete
older TailorFlow tables that may already exist in the same Supabase project.

For an installation created before dynamic garment measurements were added,
run [`supabase/add-dynamic-measurements.sql`](supabase/add-dynamic-measurements.sql)
once in the Supabase SQL Editor.

## Run locally

Use the VS Code Live Server extension, or run:

```powershell
python -m http.server 5500
```

Then open `http://localhost:5500`.

Do not open the HTML files directly with a `file://` URL; authentication redirects work best through a local web server.
