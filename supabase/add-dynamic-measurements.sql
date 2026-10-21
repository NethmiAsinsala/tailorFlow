-- One-time update for an existing Thanu Fashion installation.
-- Adds storage for garment-specific measurements without deleting any data.

alter table public.tf_measurements
add column if not exists extra_values jsonb not null default '{}'::jsonb;
