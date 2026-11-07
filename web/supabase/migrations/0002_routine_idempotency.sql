-- Second click of Add sends the same idempotency key. One row is stored.

alter table public.routines add column if not exists client_key text;

create unique index if not exists routines_owner_client_key_idx
  on public.routines (owner_id, client_key);
