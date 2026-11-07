-- =====================================================================
-- Daftar — helper functions, triggers, RPCs and row-level security
-- =====================================================================

-- ---------- Role helpers (security definer so policies don't recurse) ----------
create or replace function public.ctr_my_role(p_org uuid)
returns text language sql stable security definer set search_path = public as $$
  select role from public.ctr_members
  where org_id = p_org and user_id = auth.uid() and status = 'active'
  limit 1
$$;

create or replace function public.ctr_is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.ctr_platform_admins where user_id = auth.uid())
$$;

create or replace function public.ctr_is_member(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.ctr_my_role(p_org) is not null
$$;

create or replace function public.ctr_is_manager(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.ctr_my_role(p_org) in ('owner','admin'), false)
$$;

create or replace function public.ctr_is_staff(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.ctr_my_role(p_org) in ('owner','admin','staff'), false)
$$;

-- Subscription still running? (trial / paid plan not expired; enterprise without end date)
create or replace function public.ctr_org_active(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.ctr_organizations o
    where o.id = p_org and (o.plan_ends_at is null or o.plan_ends_at > now())
  )
$$;

create or replace function public.ctr_can_write(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.ctr_is_staff(p_org) and public.ctr_org_active(p_org)
$$;

-- Groups taught by the signed-in teacher
create or replace function public.ctr_my_group_ids(p_org uuid)
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(g.id), '{}')
  from public.ctr_groups g
  join public.ctr_members m on m.teacher_id = g.teacher_id and m.org_id = g.org_id
  where g.org_id = p_org and m.user_id = auth.uid() and m.status = 'active' and m.role = 'teacher'
$$;

create or replace function public.ctr_teacher_sees_student(p_org uuid, p_student uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.ctr_enrollments e
    where e.org_id = p_org and e.student_id = p_student
      and e.group_id = any (public.ctr_my_group_ids(p_org))
  )
$$;

-- ---------- Plan limits ----------
create or replace function public.ctr_plan_limits(p_org uuid, out max_students int, out max_centers int)
language sql stable security definer set search_path = public as $$
  select
    coalesce(o.max_students, case o.plan when 'starter' then 150 when 'growth' then 500 when 'trial' then 500 else null end),
    coalesce(o.max_centers,  case o.plan when 'starter' then 1   when 'growth' then 3   when 'trial' then 3   else null end)
  from public.ctr_organizations o where o.id = p_org
$$;

create or replace function public.ctr_check_student_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare lim int; cnt int;
begin
  if new.status <> 'active' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'active' then return new; end if;
  select max_students into lim from public.ctr_plan_limits(new.org_id);
  if lim is null then return new; end if;
  select count(*) into cnt from public.ctr_students where org_id = new.org_id and status = 'active' and id <> new.id;
  if cnt >= lim then
    raise exception 'PLAN_LIMIT_STUDENTS: votre plan autorise % élèves actifs.', lim using errcode = 'P0001';
  end if;
  return new;
end $$;

create or replace function public.ctr_check_center_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare lim int; cnt int;
begin
  select max_centers into lim from public.ctr_plan_limits(new.org_id);
  if lim is null then return new; end if;
  select count(*) into cnt from public.ctr_centers where org_id = new.org_id and active and id <> new.id;
  if cnt >= lim then
    raise exception 'PLAN_LIMIT_CENTERS: votre plan autorise % centre(s).', lim using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists ctr_students_limit on public.ctr_students;
create trigger ctr_students_limit before insert or update of status on public.ctr_students
  for each row execute function public.ctr_check_student_limit();

drop trigger if exists ctr_centers_limit on public.ctr_centers;
create trigger ctr_centers_limit before insert on public.ctr_centers
  for each row execute function public.ctr_check_center_limit();

-- ---------- Invoice numbering ----------
create or replace function public.ctr_invoice_number()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.number is null then
    update public.ctr_organizations set invoice_seq = invoice_seq + 1
      where id = new.org_id returning invoice_seq into new.number;
  end if;
  return new;
end $$;

drop trigger if exists ctr_invoices_number on public.ctr_invoices;
create trigger ctr_invoices_number before insert on public.ctr_invoices
  for each row execute function public.ctr_invoice_number();

-- ---------- Protect subscription fields on organizations ----------
create or replace function public.ctr_protect_org()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  -- Direct API calls run as 'authenticated'; internal triggers/RPCs run as the function owner.
  if current_user in ('authenticated','anon') and not public.ctr_is_platform_admin() then
    if new.plan is distinct from old.plan
       or new.plan_ends_at is distinct from old.plan_ends_at
       or new.max_students is distinct from old.max_students
       or new.max_centers  is distinct from old.max_centers
       or new.invoice_seq  is distinct from old.invoice_seq
       or new.join_code    is distinct from old.join_code
       or new.created_by   is distinct from old.created_by then
      raise exception 'Ces champs sont gérés par la plateforme.' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists ctr_orgs_protect on public.ctr_organizations;
create trigger ctr_orgs_protect before update on public.ctr_organizations
  for each row execute function public.ctr_protect_org();

-- ---------- Protect owner rows in members ----------
create or replace function public.ctr_protect_members()
returns trigger language plpgsql security invoker set search_path = public as $$
declare me text;
begin
  if current_user not in ('authenticated','anon') then
    return coalesce(new, old);
  end if;
  me := public.ctr_my_role(coalesce(new.org_id, old.org_id));
  if tg_op = 'DELETE' then
    if old.role = 'owner' then raise exception 'Le propriétaire ne peut pas être retiré.' using errcode = '42501'; end if;
    return old;
  end if;
  if new.org_id <> old.org_id or new.user_id <> old.user_id then
    raise exception 'Modification non autorisée.' using errcode = '42501';
  end if;
  if (old.role = 'owner' or new.role = 'owner') and me <> 'owner' then
    raise exception 'Seul le propriétaire peut modifier ce rôle.' using errcode = '42501';
  end if;
  if old.role = 'owner' and old.user_id = auth.uid() and (new.role <> 'owner' or new.status <> 'active') then
    raise exception 'Vous ne pouvez pas retirer votre propre rôle de propriétaire.' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists ctr_members_protect on public.ctr_members;
create trigger ctr_members_protect before update or delete on public.ctr_members
  for each row execute function public.ctr_protect_members();

-- ---------- RPCs ----------
create or replace function public.ctr_random_code()
returns text language sql volatile set search_path = public, extensions as $$
  select upper(substr(translate(encode(gen_random_bytes(9), 'base64'), '+/=0O1Il', 'XYZ23456'), 1, 6))
$$;

create or replace function public.ctr_create_organization(
  p_name text, p_city text default null, p_phone text default null, p_full_name text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_code text; v_email text;
begin
  if auth.uid() is null then raise exception 'Connexion requise.' using errcode = '42501'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Le nom du centre est obligatoire.'; end if;
  if (select count(*) from public.ctr_members where user_id = auth.uid() and role = 'owner') >= 5 then
    raise exception 'Nombre maximal de centres atteint pour ce compte.';
  end if;
  loop
    v_code := public.ctr_random_code();
    exit when not exists (select 1 from public.ctr_organizations where join_code = v_code);
  end loop;
  select email into v_email from auth.users where id = auth.uid();

  insert into public.ctr_organizations (name, city, phone, plan, plan_ends_at, join_code, created_by)
  values (trim(p_name), p_city, p_phone, 'trial', now() + interval '15 days', v_code, auth.uid())
  returning id into v_org;

  insert into public.ctr_settings (org_id) values (v_org);
  insert into public.ctr_centers (org_id, name, city, phone) values (v_org, trim(p_name), p_city, p_phone);
  insert into public.ctr_members (org_id, user_id, full_name, phone, email, role, status)
  values (v_org, auth.uid(), coalesce(p_full_name, v_email), p_phone, v_email, 'owner', 'active');
  return v_org;
end $$;

create or replace function public.ctr_join_organization(
  p_code text, p_full_name text, p_phone text default null, p_role text default 'staff')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_email text;
begin
  if auth.uid() is null then raise exception 'Connexion requise.' using errcode = '42501'; end if;
  if p_role not in ('staff','teacher') then p_role := 'staff'; end if;
  select id into v_org from public.ctr_organizations where join_code = upper(trim(p_code));
  if v_org is null then raise exception 'Code invalide.'; end if;
  select email into v_email from auth.users where id = auth.uid();
  insert into public.ctr_members (org_id, user_id, full_name, phone, email, role, status)
  values (v_org, auth.uid(), p_full_name, p_phone, v_email, p_role, 'pending')
  on conflict (org_id, user_id) do nothing;
  return v_org;
end $$;

create or replace function public.ctr_regenerate_join_code(p_org uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if not public.ctr_is_manager(p_org) then raise exception 'Accès refusé.' using errcode = '42501'; end if;
  loop
    v_code := public.ctr_random_code();
    exit when not exists (select 1 from public.ctr_organizations where join_code = v_code);
  end loop;
  update public.ctr_organizations set join_code = v_code where id = p_org;
  return v_code;
end $$;

-- Platform admin: list every organization with usage
create or replace function public.ctr_admin_list_orgs()
returns table (id uuid, name text, city text, phone text, plan text, plan_ends_at timestamptz,
               max_students int, max_centers int, created_at timestamptz,
               owner_email text, students bigint, centers bigint)
language sql stable security definer set search_path = public as $$
  select o.id, o.name, o.city, o.phone, o.plan, o.plan_ends_at, o.max_students, o.max_centers, o.created_at,
         (select m.email from public.ctr_members m where m.org_id = o.id and m.role = 'owner' limit 1),
         (select count(*) from public.ctr_students s where s.org_id = o.id and s.status = 'active'),
         (select count(*) from public.ctr_centers c where c.org_id = o.id and c.active)
  from public.ctr_organizations o
  where public.ctr_is_platform_admin()
  order by o.created_at desc
$$;

revoke execute on function public.ctr_create_organization(text,text,text,text) from anon;
revoke execute on function public.ctr_join_organization(text,text,text,text) from anon;
revoke execute on function public.ctr_regenerate_join_code(uuid) from anon;
revoke execute on function public.ctr_admin_list_orgs() from anon;

-- ---------- Row-level security ----------
do $$
declare t text;
begin
  foreach t in array array[
    'ctr_organizations','ctr_platform_admins','ctr_settings','ctr_centers','ctr_levels','ctr_subjects',
    'ctr_rooms','ctr_prices','ctr_teachers','ctr_members','ctr_groups','ctr_group_slots','ctr_sessions',
    'ctr_students','ctr_enrollments','ctr_attendance','ctr_waitlist','ctr_invoices','ctr_payments',
    'ctr_expenses','ctr_teacher_payouts','ctr_reminder_log']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- organizations
drop policy if exists ctr_orgs_select on public.ctr_organizations;
create policy ctr_orgs_select on public.ctr_organizations for select to authenticated
  using (public.ctr_is_member(id) or public.ctr_is_platform_admin());
drop policy if exists ctr_orgs_update on public.ctr_organizations;
create policy ctr_orgs_update on public.ctr_organizations for update to authenticated
  using (public.ctr_is_manager(id) or public.ctr_is_platform_admin())
  with check (public.ctr_is_manager(id) or public.ctr_is_platform_admin());

-- platform admins: read own row only
drop policy if exists ctr_padmin_select on public.ctr_platform_admins;
create policy ctr_padmin_select on public.ctr_platform_admins for select to authenticated
  using (user_id = auth.uid());

-- members: a user sees own memberships; staff see the whole team; managers manage
drop policy if exists ctr_members_select on public.ctr_members;
create policy ctr_members_select on public.ctr_members for select to authenticated
  using (user_id = auth.uid() or public.ctr_is_staff(org_id));
drop policy if exists ctr_members_update on public.ctr_members;
create policy ctr_members_update on public.ctr_members for update to authenticated
  using (public.ctr_is_manager(org_id)) with check (public.ctr_is_manager(org_id));
drop policy if exists ctr_members_delete on public.ctr_members;
create policy ctr_members_delete on public.ctr_members for delete to authenticated
  using (public.ctr_is_manager(org_id) or (user_id = auth.uid() and status = 'pending'));

-- settings
drop policy if exists ctr_settings_select on public.ctr_settings;
create policy ctr_settings_select on public.ctr_settings for select to authenticated
  using (public.ctr_is_member(org_id));
drop policy if exists ctr_settings_update on public.ctr_settings;
create policy ctr_settings_update on public.ctr_settings for update to authenticated
  using (public.ctr_is_manager(org_id) and public.ctr_org_active(org_id))
  with check (public.ctr_is_manager(org_id));

-- reference tables readable by every member, editable by managers
do $$
declare t text;
begin
  foreach t in array array['ctr_centers','ctr_levels','ctr_subjects','ctr_rooms','ctr_prices'] loop
    execute format('drop policy if exists %I on public.%I', t||'_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.ctr_is_member(org_id))', t||'_select', t);
    execute format('drop policy if exists %I on public.%I', t||'_write', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.ctr_is_manager(org_id) and public.ctr_org_active(org_id)) with check (public.ctr_is_manager(org_id) and public.ctr_org_active(org_id))', t||'_write', t);
  end loop;
end $$;

-- operational tables: staff read/write; teachers read what concerns their groups
do $$
declare t text;
begin
  foreach t in array array['ctr_students','ctr_enrollments','ctr_groups','ctr_group_slots','ctr_sessions',
                           'ctr_waitlist','ctr_invoices','ctr_payments','ctr_expenses','ctr_reminder_log','ctr_attendance'] loop
    execute format('drop policy if exists %I on public.%I', t||'_write', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.ctr_can_write(org_id)) with check (public.ctr_can_write(org_id))', t||'_write', t);
    execute format('drop policy if exists %I on public.%I', t||'_staff_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.ctr_is_staff(org_id))', t||'_staff_select', t);
  end loop;
end $$;

-- teacher read scopes
drop policy if exists ctr_groups_teacher_select on public.ctr_groups;
create policy ctr_groups_teacher_select on public.ctr_groups for select to authenticated
  using (id = any (public.ctr_my_group_ids(org_id)));
drop policy if exists ctr_slots_teacher_select on public.ctr_group_slots;
create policy ctr_slots_teacher_select on public.ctr_group_slots for select to authenticated
  using (group_id = any (public.ctr_my_group_ids(org_id)));
drop policy if exists ctr_sessions_teacher_select on public.ctr_sessions;
create policy ctr_sessions_teacher_select on public.ctr_sessions for select to authenticated
  using (group_id = any (public.ctr_my_group_ids(org_id)));
drop policy if exists ctr_sessions_teacher_update on public.ctr_sessions;
create policy ctr_sessions_teacher_update on public.ctr_sessions for update to authenticated
  using (group_id = any (public.ctr_my_group_ids(org_id)) and public.ctr_org_active(org_id))
  with check (group_id = any (public.ctr_my_group_ids(org_id)));
drop policy if exists ctr_sessions_teacher_insert on public.ctr_sessions;
create policy ctr_sessions_teacher_insert on public.ctr_sessions for insert to authenticated
  with check (group_id = any (public.ctr_my_group_ids(org_id)) and public.ctr_org_active(org_id));
drop policy if exists ctr_enroll_teacher_select on public.ctr_enrollments;
create policy ctr_enroll_teacher_select on public.ctr_enrollments for select to authenticated
  using (group_id = any (public.ctr_my_group_ids(org_id)));
drop policy if exists ctr_students_teacher_select on public.ctr_students;
create policy ctr_students_teacher_select on public.ctr_students for select to authenticated
  using (public.ctr_my_role(org_id) = 'teacher' and public.ctr_teacher_sees_student(org_id, id));

-- attendance: teachers manage attendance of their own sessions
create or replace function public.ctr_teacher_owns_session(p_org uuid, p_session uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.ctr_sessions s
                 where s.id = p_session and s.org_id = p_org
                   and s.group_id = any (public.ctr_my_group_ids(p_org)))
$$;
drop policy if exists ctr_att_teacher_all on public.ctr_attendance;
create policy ctr_att_teacher_all on public.ctr_attendance for all to authenticated
  using (public.ctr_teacher_owns_session(org_id, session_id) and public.ctr_org_active(org_id))
  with check (public.ctr_teacher_owns_session(org_id, session_id) and public.ctr_org_active(org_id));

-- teachers table: staff read, managers write, a teacher reads own row
drop policy if exists ctr_teachers_select on public.ctr_teachers;
create policy ctr_teachers_select on public.ctr_teachers for select to authenticated
  using (public.ctr_is_staff(org_id)
         or exists (select 1 from public.ctr_members m where m.teacher_id = ctr_teachers.id and m.user_id = auth.uid() and m.status = 'active'));
drop policy if exists ctr_teachers_write on public.ctr_teachers;
create policy ctr_teachers_write on public.ctr_teachers for all to authenticated
  using (public.ctr_is_manager(org_id) and public.ctr_org_active(org_id))
  with check (public.ctr_is_manager(org_id) and public.ctr_org_active(org_id));

-- payroll: managers only
drop policy if exists ctr_payouts_all on public.ctr_teacher_payouts;
create policy ctr_payouts_all on public.ctr_teacher_payouts for all to authenticated
  using (public.ctr_is_manager(org_id)) with check (public.ctr_is_manager(org_id) and public.ctr_org_active(org_id));

-- ---------- Function privileges: nothing for anon, triggers not callable via API ----------
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig, p.prorettype = 'trigger'::regtype as is_trg
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'ctr\_%'
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    if f.is_trg then
      execute format('revoke execute on function %s from authenticated', f.sig);
    else
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;

-- ---------- Expenses are admin-only (employees never see them) ----------
drop policy if exists ctr_expenses_write on public.ctr_expenses;
drop policy if exists ctr_expenses_staff_select on public.ctr_expenses;
create policy ctr_expenses_select on public.ctr_expenses for select to authenticated
  using (public.ctr_is_manager(org_id));
create policy ctr_expenses_write on public.ctr_expenses for all to authenticated
  using (public.ctr_is_manager(org_id) and public.ctr_org_active(org_id))
  with check (public.ctr_is_manager(org_id) and public.ctr_org_active(org_id));
