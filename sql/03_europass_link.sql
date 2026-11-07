-- Keep Daftar sign-ups out of EuroPass's student profiles.
create or replace function public.handle_new_user()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
begin
  if coalesce(new.raw_user_meta_data->>'app', '') = 'daftar' then
    return new;
  end if;
  insert into public.profiles (id, full_name, role, course_id, title, city, phone, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'New User'),
    'student',
    nullif(new.raw_user_meta_data->>'course_id', '')::uuid,
    new.raw_user_meta_data->>'title',
    new.raw_user_meta_data->>'city',
    new.raw_user_meta_data->>'phone',
    new.email
  );
  return new;
end;
$function$;
