-- Apple Pay inbox for «Деньги».
-- The iPhone Shortcut adds a row after every Apple Pay purchase; the app takes the rows, saves them
-- on the phone and deletes them here. Nobody can read the table directly: only the two functions
-- below, and only with the personal secret from the app's settings.
-- Run once: Supabase → SQL Editor → paste → Run.

create table if not exists public.applepay_inbox (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  secret text not null check (length(secret) >= 24),
  amount text,
  merchant text,
  card text
);

alter table public.applepay_inbox enable row level security;

-- the Shortcut may only add rows (it sends «Prefer: return=minimal», so it never reads them back)
drop policy if exists "shortcut inserts" on public.applepay_inbox;
create policy "shortcut inserts" on public.applepay_inbox for insert to anon with check (true);
revoke select, update, delete on public.applepay_inbox from anon, authenticated;
grant insert on public.applepay_inbox to anon;

create or replace function public.inbox_take(p_secret text)
returns setof public.applepay_inbox
language sql security definer set search_path = public as $$
  select * from public.applepay_inbox
  where secret = p_secret and length(p_secret) >= 24
  order by created_at
$$;

create or replace function public.inbox_done(p_secret text, p_ids uuid[])
returns void
language sql security definer set search_path = public as $$
  delete from public.applepay_inbox where secret = p_secret and id = any(p_ids)
$$;

revoke all on function public.inbox_take(text) from public;
revoke all on function public.inbox_done(text, uuid[]) from public;
grant execute on function public.inbox_take(text) to anon;
grant execute on function public.inbox_done(text, uuid[]) to anon;
