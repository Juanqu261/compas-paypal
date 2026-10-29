-- The latest real analyst run per demo merchant, with the findings shown with
-- it. Additive only: one new table, no existing row touched.
--
-- Act 1 of /demo shows every visitor the last real run and allows a new live
-- run of a merchant only after a cooldown (6 hours by default), so the
-- analyst's model costs are bounded per merchant, not per visitor. Kept here
-- so a restart keeps both the run and the cooldown. On startup the backend
-- verifies the run's CUM pointers again against the CUM source; nothing here
-- is trusted as a mapping by itself (ADR 0009).
--
-- Merchant data only: catalog SKUs, CUM codes, flags. Never a payer, a
-- delegate or an errand.

create table compas.analyst_runs (
  merchant_id text primary key check (merchant_id ~ '^[a-z0-9-]{1,64}$'),
  paypal_merchant_id text not null,
  run_id text not null,
  finished_at timestamptz not null,
  job jsonb not null,
  findings jsonb not null
);

alter table compas.analyst_runs enable row level security;
create policy backend_only on compas.analyst_runs to compas_backend using (true) with check (true);
grant select, insert, update on compas.analyst_runs to compas_backend;
