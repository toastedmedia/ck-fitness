-- Storage buckets and rules. Skipped automatically where Supabase Storage does not exist (local tests).
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema not present; skipping bucket setup';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
    ('program-thumbnails', 'program-thumbnails', true,  2097152,  array['image/jpeg','image/png','image/webp']),
    ('program-resources',  'program-resources',  false, 20971520, array['application/pdf','image/jpeg','image/png','image/webp']),
    ('avatars',            'avatars',            true,  1048576,  array['image/jpeg','image/png','image/webp'])
  on conflict (id) do nothing;

  -- Thumbnails: anyone reads; content editors write.
  execute $p$create policy "thumbnails: editors write" on storage.objects for all
    using (bucket_id = 'program-thumbnails' and public.has_staff_role(array['owner','admin','content_manager']))
    with check (bucket_id = 'program-thumbnails' and public.has_staff_role(array['owner','admin','content_manager']))$p$;

  -- Resources are private: editors write; members download only through server-signed links.
  execute $p$create policy "resources: editors write" on storage.objects for all
    using (bucket_id = 'program-resources' and public.has_staff_role(array['owner','admin','content_manager']))
    with check (bucket_id = 'program-resources' and public.has_staff_role(array['owner','admin','content_manager']))$p$;

  -- Avatars: each member manages files in a folder named after her user id.
  execute $p$create policy "avatars: own folder" on storage.objects for all
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
    with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
end $$;
