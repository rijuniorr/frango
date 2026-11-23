-- v2 (23/nov): duplas segregadas. Ricardo↔Gabriel e Ricardo↔Sara; Gabriel e Sara NÃO se veem.
-- Toda a regra fica no banco (RLS), inclusive nas fotos do Storage.

-- 1) quem pode existir no login
create or replace function public.so_os_dois() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email not in ('ricardo@frango.app', 'gabriel@frango.app', 'sara@frango.app') then
    raise exception 'cadastro fechado';
  end if;
  return new;
end $$;

-- 2) duplas por usuário (funciona antes da Sara existir)
create table if not exists public.pairs (a text not null, b text not null, primary key (a, b));
insert into public.pairs values ('ricardo', 'gabriel'), ('ricardo', 'sara') on conflict do nothing;
alter table public.pairs enable row level security;
drop policy if exists ler on public.pairs;
create policy ler on public.pairs for select to authenticated using (true);

create or replace function public.me_user() returns text language sql stable security definer set search_path = public as
$$ select username from public.profiles where id = auth.uid() $$;

-- posso ver os dados dessa pessoa? (eu mesmo ou minha dupla)
create or replace function public.can_see(target uuid) returns boolean language sql stable security definer set search_path = public as $$
  select target = auth.uid() or exists (
    select 1 from public.profiles t, public.pairs pr
    where t.id = target and (
      (pr.a = public.me_user() and pr.b = t.username) or (pr.b = public.me_user() and pr.a = t.username)
    )
  )
$$;

-- 3) público do post: null = todas as minhas duplas; senão lista de usuários que podem ver (ex.: {sara})
alter table public.checkins add column if not exists audience text[];

-- 4) leitura segregada
drop policy if exists ler on public.profiles;
create policy ler on public.profiles for select to authenticated using (public.can_see(id));
drop policy if exists ler on public.days;
create policy ler on public.days for select to authenticated using (public.can_see(user_id));
drop policy if exists ler on public.checkins;
create policy ler on public.checkins for select to authenticated using (
  user_id = auth.uid() or (public.can_see(user_id) and (audience is null or public.me_user() = any(audience)))
);
-- curtidas/comentários: só de posts que eu enxergo (o subselect passa pelo RLS de checkins)
drop policy if exists ler on public.likes;
create policy ler on public.likes for select to authenticated using (exists (select 1 from public.checkins c where c.id = checkin_id));
drop policy if exists ler on public.comments;
create policy ler on public.comments for select to authenticated using (exists (select 1 from public.checkins c where c.id = checkin_id));
drop policy if exists meu on public.likes;
create policy meu on public.likes for all to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.checkins c where c.id = checkin_id));
drop policy if exists meu on public.comments;
create policy meu on public.comments for all to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.checkins c where c.id = checkin_id));

-- 5) fotos: dono, ou a foto pertence a um post/avatar que eu enxergo (lista de pasta também fica bloqueada)
drop policy if exists fotos_ler on storage.objects;
create policy fotos_ler on storage.objects for select to authenticated using (
  bucket_id = 'fotos' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from public.checkins c where position(name in c.photos::text) > 0)
    or exists (select 1 from public.profiles p where p.avatar = name)
  )
);

-- conferência
select (select count(*) from public.pairs) duplas, (select count(*) from pg_policies where schemaname = 'public' and policyname = 'ler') politicas_ler;
