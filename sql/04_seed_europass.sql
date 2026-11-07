-- Copy EuroPass tracker data into Daftar as the first center (non-destructive: tracker_* tables untouched)
do $$
declare
  v_owner uuid := '7c7aae3f-323e-4b64-8026-7488d34009a7';
  v_org uuid; v_center uuid;
  l_a2 uuid; l_b1 uuid; l_b2 uuid; l_gen uuid; l_prep uuid; l_a1 uuid;
  s_de uuid; s_en uuid;
  t_ajj uuid; t_mij uuid; t_wal uuid;
begin
  if exists (select 1 from public.ctr_organizations where name = 'EuroPass Academy') then
    raise notice 'already seeded'; return;
  end if;

  insert into public.ctr_organizations (name, city, phone, address, plan, plan_ends_at, join_code, created_by)
  values ('EuroPass Academy', 'Khemisset', '+212664463723',
          'Bureaux Al-Atiq, Avenue Hassan I, près de la Mosquée Al-Atiq', 'enterprise', null,
          public.ctr_random_code(), v_owner)
  returning id into v_org;

  insert into public.ctr_settings (org_id) values (v_org);
  insert into public.ctr_centers (org_id, name, city, phone, address)
  values (v_org, 'EuroPass Khemisset', 'Khemisset', '+212664463723', 'Avenue Hassan I') returning id into v_center;
  insert into public.ctr_members (org_id, user_id, full_name, email, role, status)
  values (v_org, v_owner, 'Waleed', 'hitaklite@gmail.com', 'owner', 'active');
  insert into public.ctr_platform_admins (user_id) values (v_owner) on conflict do nothing;

  insert into public.ctr_levels (org_id, name, sort) values (v_org,'A1',1) returning id into l_a1;
  insert into public.ctr_levels (org_id, name, sort) values (v_org,'A2',2) returning id into l_a2;
  insert into public.ctr_levels (org_id, name, sort) values (v_org,'B1',3) returning id into l_b1;
  insert into public.ctr_levels (org_id, name, sort) values (v_org,'B2',4) returning id into l_b2;
  insert into public.ctr_levels (org_id, name, sort) values (v_org,'Général',5) returning id into l_gen;
  insert into public.ctr_levels (org_id, name, sort) values (v_org,'Préparation',6) returning id into l_prep;
  insert into public.ctr_subjects (org_id, name, sort) values (v_org,'Allemand',1) returning id into s_de;
  insert into public.ctr_subjects (org_id, name, sort) values (v_org,'Anglais',2) returning id into s_en;

  insert into public.ctr_teachers (org_id, full_name, subject_ids) values (v_org,'Ajjali', array[s_de]) returning id into t_ajj;
  insert into public.ctr_teachers (org_id, full_name, subject_ids) values (v_org,'Mijjane', array[s_de]) returning id into t_mij;
  insert into public.ctr_teachers (org_id, full_name, subject_ids) values (v_org,'Walid', array[s_en]) returning id into t_wal;

  insert into public.ctr_groups (id, org_id, center_id, name, level_id, subject_id, teacher_id, start_date, color)
  select g.id, v_org, v_center, g.name,
    case
      when g.name like 'B1%' then l_b1 when g.name like 'B2%' then l_b2 when g.name like 'A2%' then l_a2
      when g.name like '%Preparation%' then l_prep else l_gen end,
    case when g.name like 'English%' then s_en else s_de end,
    case when g.name ilike '%Ajaali%' then t_ajj when g.name ilike '%Mijjane%' then t_mij else t_wal end,
    coalesce((select min(s.start_date) from public.tracker_students s where s.group_id = g.id), current_date),
    case when g.name like 'English%' then '#2563eb' else '#dc2626' end
  from public.tracker_groups g;

  -- Timetables known from the group names (English G2 & G3, 18:30); German groups to be filled in the app
  insert into public.ctr_group_slots (org_id, group_id, weekday, start_time, end_time)
  select v_org, '7d17f1b9-36c8-48f8-9190-e5b2c8767eb2', d, '18:30', '20:00' from unnest(array[1,3,5]) d;
  insert into public.ctr_group_slots (org_id, group_id, weekday, start_time, end_time)
  select v_org, '9c9b4a60-b127-41ff-92a7-f225c1922923', d, '18:30', '20:00' from unnest(array[2,4,6]) d;

  insert into public.ctr_students (id, org_id, center_id, full_name, phone, notes, created_at)
  select s.id, v_org, v_center, s.name, s.phone, s.note, s.created_at from public.tracker_students s;

  insert into public.ctr_enrollments (org_id, student_id, group_id, start_date, monthly_price)
  select v_org, s.id, s.group_id, coalesce(s.start_date, current_date), coalesce(f.price, 0)
  from public.tracker_students s left join public.tracker_fees f on f.student_id = s.id
  where s.group_id is not null;

  -- One invoice per student per month that has payments, then attach the payments
  insert into public.ctr_invoices (org_id, student_id, enrollment_id, period_month, description, amount, due_date)
  select v_org, p.student_id, e.id, date_trunc('month', p.paid_on)::date,
         'Mensualité ' || to_char(date_trunc('month', p.paid_on), 'MM/YYYY'),
         greatest(coalesce(e.monthly_price,0), sum(p.amount)), date_trunc('month', p.paid_on)::date
  from public.tracker_payments p
  join public.ctr_enrollments e on e.student_id = p.student_id
  group by p.student_id, e.id, e.monthly_price, date_trunc('month', p.paid_on)
  order by date_trunc('month', p.paid_on);

  insert into public.ctr_payments (org_id, invoice_id, student_id, amount, method, paid_at, notes, received_by_name, created_at)
  select v_org, i.id, p.student_id, p.amount, 'cash', p.paid_on, p.note, 'Import tracker', p.created_at
  from public.tracker_payments p
  join public.ctr_invoices i on i.student_id = p.student_id and i.period_month = date_trunc('month', p.paid_on)::date and i.org_id = v_org;
end $$;
