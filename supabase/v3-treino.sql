-- v3 (23/nov): treino vira post no feed — observação e foto do treino no dia
alter table public.days add column if not exists note text;
alter table public.days add column if not exists photo text;

-- foto do treino: quem enxerga o dia (RLS de days) enxerga a foto
drop policy if exists fotos_ler on storage.objects;
create policy fotos_ler on storage.objects for select to authenticated using (
  bucket_id = 'fotos' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from public.checkins c where position(name in c.photos::text) > 0)
    or exists (select 1 from public.profiles p where p.avatar = name)
    or exists (select 1 from public.days d where d.photo = name)
  )
);

-- 23/nov = dia 1 oficial: some com os testes antigos
delete from public.days where day < '2026-11-23';

-- conferência
select (select string_agg(column_name, ',') from information_schema.columns where table_name = 'days' and column_name in ('note', 'photo')) colunas, (select count(*) from public.days) dias, (select min(day) from public.days) primeiro;
