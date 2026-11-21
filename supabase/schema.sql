-- FRANGO — banco (rodar no SQL Editor do Supabase). Só 2 usuários: ricardo e gabriel.

-- só esses dois emails podem existir no login
create or replace function public.so_os_dois() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email not in ('ricardo@frango.app', 'gabriel@frango.app') then
    raise exception 'cadastro fechado';
  end if;
  return new;
end $$;
drop trigger if exists so_os_dois on auth.users;
create trigger so_os_dois before insert on auth.users for each row execute function public.so_os_dois();

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text unique not null,
  name text not null,
  is_admin boolean not null default false,
  height_cm int,
  goal_kg numeric(5,1),
  created_at timestamptz not null default now()
);

create or replace function public.novo_perfil() returns trigger language plpgsql security definer set search_path = public as $$
declare u text := split_part(new.email, '@', 1);
begin
  insert into public.profiles (id, username, name, is_admin)
  values (new.id, u, case u when 'ricardo' then 'Ricardo' else 'Fachola' end, u = 'ricardo')
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists novo_perfil on auth.users;
create trigger novo_perfil after insert on auth.users for each row execute function public.novo_perfil();

-- regras do admin (linha única)
create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  max_skips int not null default 2,   -- treinos que pode furar na semana
  max_junk int not null default 2,    -- besteiras que pode comer na semana
  updated_at timestamptz not null default now()
);
insert into public.settings (id) values (1) on conflict do nothing;

-- diário: treinei? besteiras?
create table if not exists public.days (
  user_id uuid not null references public.profiles on delete cascade default auth.uid(),
  day date not null,
  trained boolean,
  junk int not null default 0 check (junk >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

-- check-in semanal (segunda)
create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade default auth.uid(),
  week date not null,                 -- segunda-feira da semana
  weight numeric(5,1),
  note text,
  photos jsonb not null default '{}', -- {"frente": "path", "lado": "path", "costas": "path"}
  created_at timestamptz not null default now(),
  unique (user_id, week)
);

create table if not exists public.likes (
  checkin_id uuid not null references public.checkins on delete cascade,
  user_id uuid not null references public.profiles on delete cascade default auth.uid(),
  primary key (checkin_id, user_id)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  checkin_id uuid not null references public.checkins on delete cascade,
  user_id uuid not null references public.profiles on delete cascade default auth.uid(),
  body text not null check (length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

-- segurança: os dois leem tudo; cada um só escreve o que é seu; settings só o admin
alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.days enable row level security;
alter table public.checkins enable row level security;
alter table public.likes enable row level security;
alter table public.comments enable row level security;

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as
$$ select coalesce((select is_admin from public.profiles where id = auth.uid()), false) $$;

do $$ declare t text; begin
  foreach t in array array['profiles','settings','days','checkins','likes','comments'] loop
    execute format('drop policy if exists ler on public.%I', t);
    execute format('create policy ler on public.%I for select to authenticated using (true)', t);
  end loop;
  foreach t in array array['days','checkins','likes','comments'] loop
    execute format('drop policy if exists meu on public.%I', t);
    execute format('create policy meu on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;
drop policy if exists meu on public.profiles;
create policy meu on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists admin on public.settings;
create policy admin on public.settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- fotos: pasta privada; caminho = <user_id>/<semana>/<angulo>.jpg
insert into storage.buckets (id, name, public) values ('fotos', 'fotos', false) on conflict (id) do nothing;
drop policy if exists fotos_ler on storage.objects;
create policy fotos_ler on storage.objects for select to authenticated using (bucket_id = 'fotos');
drop policy if exists fotos_subir on storage.objects;
create policy fotos_subir on storage.objects for insert to authenticated with check (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists fotos_trocar on storage.objects;
create policy fotos_trocar on storage.objects for update to authenticated using (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists fotos_apagar on storage.objects;
create policy fotos_apagar on storage.objects for delete to authenticated using (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);

-- tempo real no feed
do $$ begin
  alter publication supabase_realtime add table public.checkins, public.days, public.likes, public.comments;
exception when others then null; end $$;

-- v0.3 (20/nov): categorias de treino, foto de perfil, peso atual, gordura; Fachola vira Gabriel
alter table public.days add column if not exists kinds text[] not null default '{}';
alter table public.profiles add column if not exists avatar text;
alter table public.profiles add column if not exists weight_kg numeric(5,1);
alter table public.profiles add column if not exists fat_pct numeric(4,1);
create or replace function public.novo_perfil() returns trigger language plpgsql security definer set search_path = public as $$
declare u text := split_part(new.email, '@', 1);
begin
  insert into public.profiles (id, username, name, is_admin)
  values (new.id, u, initcap(u), u = 'ricardo')
  on conflict (id) do nothing;
  return new;
end $$;
update public.profiles set name = 'Gabriel' where username = 'gabriel' and name = 'Fachola';
