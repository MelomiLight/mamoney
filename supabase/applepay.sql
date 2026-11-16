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
-- when the purchase was made (sent by the Shortcut), so a purchase queued offline keeps its own day
alter table public.applepay_inbox add column if not exists paid_at text;

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

-- The Shortcut keeps a queue file: every purchase is appended to it as JSON, then the whole
-- file is sent here and deleted. No internet → the request fails, the file stays, and the next
-- purchase sends both. Entries that aren't JSON or have no amount are skipped; one sent twice
-- (the reply got lost) is skipped while the first copy is still waiting here, the app skips later ones.
create or replace function public.inbox_push(p_secret text, p_lines text)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  ln text;
  j jsonb;
  n integer := 0;
begin
  if length(coalesce(p_secret, '')) < 24 then raise exception 'secret too short'; end if;
  -- every {…} in the text is one purchase: works whether the Shortcut wrote them one per line or pretty-printed
  for ln in select m[1] from regexp_matches(coalesce(p_lines, ''), '(\{[^{}]*\})', 'g') as m loop
    begin
      j := ln::jsonb;
    exception when others then
      continue;
    end;
    continue when jsonb_typeof(j) <> 'object' or coalesce(j->>'amount', '') = '';
    continue when j->>'paid_at' is not null and exists (
      select 1 from applepay_inbox
      where secret = p_secret and paid_at = j->>'paid_at'
        and amount is not distinct from j->>'amount' and merchant is not distinct from j->>'merchant');
    insert into applepay_inbox (secret, amount, merchant, card, paid_at)
    values (p_secret, j->>'amount', j->>'merchant', j->>'card', j->>'paid_at');
    n := n + 1;
  end loop;
  return n;
end
$$;

revoke all on function public.inbox_push(text, text) from public;
grant execute on function public.inbox_push(text, text) to anon;
revoke all on function public.inbox_take(text) from public;
revoke all on function public.inbox_done(text, uuid[]) from public;
grant execute on function public.inbox_take(text) to anon;
grant execute on function public.inbox_done(text, uuid[]) to anon;
