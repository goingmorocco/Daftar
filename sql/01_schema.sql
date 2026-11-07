-- =====================================================================
-- Daftar — multi-center management (tutoring, language & training centers)
-- All objects are prefixed ctr_ so they live safely beside EuroPass tables.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Core tenancy ----------
create table if not exists public.ctr_organizations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  city          text,
  phone         text,
  address       text,
  plan          text not null default 'trial' check (plan in ('trial','starter','growth','enterprise')),
  plan_ends_at  timestamptz,
  max_students  int,
  max_centers   int,
  join_code     text not null unique,
  invoice_seq   int  not null default 0,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create table if not exists public.ctr_platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table if not exists public.ctr_settings (
  org_id             uuid primary key references public.ctr_organizations(id) on delete cascade,
  currency           text not null default 'DH',
  late_grace_days    int  not null default 7 check (late_grace_days between 0 and 90),
  waitlist_threshold int  not null default 7 check (waitlist_threshold between 1 and 100),
  auto_invoices      boolean not null default true,
  tpl_unpaid   text not null default 'Bonjour {parent}, petit rappel de {centre} : le paiement de {mois} pour {eleve} ({groupe}) reste à régler. Montant restant : {reste} DH. Merci 🙏',
  tpl_soon     text not null default 'Bonjour {parent}, le paiement de {mois} pour {eleve} ({groupe}) est de {montant} DH, à régler avant le {date}. Merci — {centre}',
  tpl_renewal  text not null default 'Bonjour {parent}, l''inscription de {eleve} au groupe {groupe} se termine le {date}. Souhaitez-vous la renouveler ? — {centre}',
  receipt_footer text default 'Merci pour votre confiance.',
  updated_at   timestamptz not null default now()
);

create table if not exists public.ctr_centers (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.ctr_organizations(id) on delete cascade,
  name       text not null,
  city       text,
  address    text,
  phone      text,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.ctr_levels (
  id     uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.ctr_organizations(id) on delete cascade,
  name   text not null,
  sort   int  not null default 0
);

create table if not exists public.ctr_subjects (
  id     uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.ctr_organizations(id) on delete cascade,
  name   text not null,
  sort   int  not null default 0
);

create table if not exists public.ctr_rooms (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references public.ctr_organizations(id) on delete cascade,
  center_id uuid references public.ctr_centers(id) on delete set null,
  name      text not null,
  capacity  int
);

create table if not exists public.ctr_prices (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.ctr_organizations(id) on delete cascade,
  level_id      uuid not null references public.ctr_levels(id) on delete cascade,
  subject_id    uuid not null references public.ctr_subjects(id) on delete cascade,
  monthly_price numeric(10,2) not null check (monthly_price >= 0),
  unique (level_id, subject_id)
);

create table if not exists public.ctr_teachers (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.ctr_organizations(id) on delete cascade,
  full_name   text not null,
  phone       text,
  email       text,
  subject_ids uuid[] not null default '{}',
  pay_type    text not null default 'per_session' check (pay_type in ('per_session','per_hour','monthly','percent')),
  pay_rate    numeric(10,2) not null default 0 check (pay_rate >= 0),
  active      boolean not null default true,
  notes       text,
  created_at  timestamptz not null default now()
);

create table if not exists public.ctr_members (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.ctr_organizations(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  full_name  text,
  phone      text,
  email      text,
  role       text not null default 'staff' check (role in ('owner','admin','staff','teacher')),
  status     text not null default 'pending' check (status in ('pending','active','disabled')),
  teacher_id uuid references public.ctr_teachers(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);

-- ---------- Teaching ----------
create table if not exists public.ctr_groups (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.ctr_organizations(id) on delete cascade,
  center_id     uuid references public.ctr_centers(id) on delete set null,
  name          text not null,
  level_id      uuid references public.ctr_levels(id) on delete set null,
  subject_id    uuid references public.ctr_subjects(id) on delete set null,
  teacher_id    uuid references public.ctr_teachers(id) on delete set null,
  room_id       uuid references public.ctr_rooms(id) on delete set null,
  monthly_price numeric(10,2),
  capacity      int,
  start_date    date not null default current_date,
  end_date      date,
  active        boolean not null default true,
  color         text,
  created_at    timestamptz not null default now()
);

create table if not exists public.ctr_group_slots (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.ctr_organizations(id) on delete cascade,
  group_id   uuid not null references public.ctr_groups(id) on delete cascade,
  weekday    smallint not null check (weekday between 1 and 7),   -- ISO: 1 = Monday … 7 = Sunday
  start_time time not null,
  end_time   time not null,
  room_id    uuid references public.ctr_rooms(id) on delete set null,
  check (end_time > start_time)
);

create table if not exists public.ctr_sessions (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.ctr_organizations(id) on delete cascade,
  group_id   uuid not null references public.ctr_groups(id) on delete cascade,
  date       date not null,
  start_time time not null,
  end_time   time not null,
  teacher_id uuid references public.ctr_teachers(id) on delete set null,
  room_id    uuid references public.ctr_rooms(id) on delete set null,
  status     text not null default 'scheduled' check (status in ('scheduled','done','cancelled')),
  notes      text,
  unique (group_id, date, start_time)
);

create table if not exists public.ctr_students (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.ctr_organizations(id) on delete cascade,
  center_id    uuid references public.ctr_centers(id) on delete set null,
  full_name    text not null,
  phone        text,
  parent_name  text,
  parent_phone text,
  level_id     uuid references public.ctr_levels(id) on delete set null,
  school       text,
  notes        text,
  status       text not null default 'active' check (status in ('active','inactive')),
  created_at   timestamptz not null default now()
);

create table if not exists public.ctr_enrollments (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.ctr_organizations(id) on delete cascade,
  student_id    uuid not null references public.ctr_students(id) on delete cascade,
  group_id      uuid not null references public.ctr_groups(id) on delete cascade,
  start_date    date not null default current_date,
  end_date      date,
  monthly_price numeric(10,2) not null default 0 check (monthly_price >= 0),
  status        text not null default 'active' check (status in ('active','ended')),
  created_at    timestamptz not null default now(),
  unique (student_id, group_id)
);

create table if not exists public.ctr_attendance (
  session_id uuid not null references public.ctr_sessions(id) on delete cascade,
  student_id uuid not null references public.ctr_students(id) on delete cascade,
  org_id     uuid not null references public.ctr_organizations(id) on delete cascade,
  status     text not null check (status in ('present','absent','late','excused')),
  marked_by  uuid default auth.uid(),
  marked_at  timestamptz not null default now(),
  primary key (session_id, student_id)
);

create table if not exists public.ctr_waitlist (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.ctr_organizations(id) on delete cascade,
  center_id   uuid references public.ctr_centers(id) on delete set null,
  full_name   text not null,
  phone       text,
  parent_name text,
  level_id    uuid references public.ctr_levels(id) on delete set null,
  subject_id  uuid references public.ctr_subjects(id) on delete set null,
  notes       text,
  status      text not null default 'waiting' check (status in ('waiting','enrolled','cancelled')),
  created_at  timestamptz not null default now()
);

-- ---------- Money ----------
create table if not exists public.ctr_invoices (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.ctr_organizations(id) on delete cascade,
  student_id    uuid not null references public.ctr_students(id) on delete cascade,
  enrollment_id uuid references public.ctr_enrollments(id) on delete set null,
  number        int,
  period_month  date,
  description   text,
  amount        numeric(10,2) not null check (amount >= 0),
  due_date      date not null default current_date,
  cancelled     boolean not null default false,
  issued_at     timestamptz not null default now(),
  created_by    uuid default auth.uid(),
  unique (enrollment_id, period_month)
);

create table if not exists public.ctr_payments (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.ctr_organizations(id) on delete cascade,
  invoice_id       uuid references public.ctr_invoices(id) on delete cascade,
  student_id       uuid not null references public.ctr_students(id) on delete cascade,
  amount           numeric(10,2) not null check (amount > 0),
  method           text not null default 'cash' check (method in ('cash','cheque','transfer','card')),
  paid_at          date not null default current_date,
  reference        text,
  notes            text,
  received_by      uuid default auth.uid(),
  received_by_name text,
  created_at       timestamptz not null default now()
);

create table if not exists public.ctr_expenses (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.ctr_organizations(id) on delete cascade,
  center_id   uuid references public.ctr_centers(id) on delete set null,
  category    text not null default 'Autre',
  description text,
  amount      numeric(10,2) not null check (amount >= 0),
  spent_at    date not null default current_date,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);

create table if not exists public.ctr_teacher_payouts (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.ctr_organizations(id) on delete cascade,
  teacher_id     uuid not null references public.ctr_teachers(id) on delete cascade,
  month          date not null,
  amount         numeric(10,2) not null default 0,
  sessions_count int not null default 0,
  hours          numeric(8,2) not null default 0,
  status         text not null default 'pending' check (status in ('pending','paid')),
  paid_at        date,
  notes          text,
  unique (teacher_id, month)
);

create table if not exists public.ctr_reminder_log (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.ctr_organizations(id) on delete cascade,
  student_id    uuid not null references public.ctr_students(id) on delete cascade,
  invoice_id    uuid references public.ctr_invoices(id) on delete cascade,
  enrollment_id uuid references public.ctr_enrollments(id) on delete cascade,
  kind          text not null check (kind in ('unpaid','soon','renewal')),
  sent_at       timestamptz not null default now(),
  sent_by       uuid default auth.uid()
);

-- ---------- Indexes ----------
create index if not exists ctr_members_user_idx      on public.ctr_members(user_id);
create index if not exists ctr_members_org_idx       on public.ctr_members(org_id);
create index if not exists ctr_members_teacher_idx   on public.ctr_members(teacher_id);
create index if not exists ctr_centers_org_idx       on public.ctr_centers(org_id);
create index if not exists ctr_levels_org_idx        on public.ctr_levels(org_id);
create index if not exists ctr_subjects_org_idx      on public.ctr_subjects(org_id);
create index if not exists ctr_rooms_org_idx         on public.ctr_rooms(org_id);
create index if not exists ctr_rooms_center_idx      on public.ctr_rooms(center_id);
create index if not exists ctr_prices_org_idx        on public.ctr_prices(org_id);
create index if not exists ctr_prices_subject_idx    on public.ctr_prices(subject_id);
create index if not exists ctr_teachers_org_idx      on public.ctr_teachers(org_id);
create index if not exists ctr_groups_org_idx        on public.ctr_groups(org_id);
create index if not exists ctr_groups_teacher_idx    on public.ctr_groups(teacher_id);
create index if not exists ctr_groups_center_idx     on public.ctr_groups(center_id);
create index if not exists ctr_groups_level_idx      on public.ctr_groups(level_id);
create index if not exists ctr_groups_subject_idx    on public.ctr_groups(subject_id);
create index if not exists ctr_groups_room_idx       on public.ctr_groups(room_id);
create index if not exists ctr_slots_group_idx       on public.ctr_group_slots(group_id);
create index if not exists ctr_slots_org_idx         on public.ctr_group_slots(org_id);
create index if not exists ctr_slots_room_idx        on public.ctr_group_slots(room_id);
create index if not exists ctr_sessions_org_date_idx on public.ctr_sessions(org_id, date);
create index if not exists ctr_sessions_teacher_idx  on public.ctr_sessions(teacher_id);
create index if not exists ctr_sessions_room_idx     on public.ctr_sessions(room_id);
create index if not exists ctr_students_org_idx      on public.ctr_students(org_id);
create index if not exists ctr_students_center_idx   on public.ctr_students(center_id);
create index if not exists ctr_students_level_idx    on public.ctr_students(level_id);
create index if not exists ctr_enroll_org_idx        on public.ctr_enrollments(org_id);
create index if not exists ctr_enroll_group_idx      on public.ctr_enrollments(group_id);
create index if not exists ctr_att_student_idx       on public.ctr_attendance(student_id);
create index if not exists ctr_att_org_idx           on public.ctr_attendance(org_id);
create index if not exists ctr_wait_org_idx          on public.ctr_waitlist(org_id);
create index if not exists ctr_wait_center_idx       on public.ctr_waitlist(center_id);
create index if not exists ctr_wait_level_idx        on public.ctr_waitlist(level_id);
create index if not exists ctr_wait_subject_idx      on public.ctr_waitlist(subject_id);
create index if not exists ctr_inv_org_idx           on public.ctr_invoices(org_id);
create index if not exists ctr_inv_student_idx       on public.ctr_invoices(student_id);
create index if not exists ctr_pay_org_idx           on public.ctr_payments(org_id);
create index if not exists ctr_pay_invoice_idx       on public.ctr_payments(invoice_id);
create index if not exists ctr_pay_student_idx       on public.ctr_payments(student_id);
create index if not exists ctr_exp_org_idx           on public.ctr_expenses(org_id);
create index if not exists ctr_exp_center_idx        on public.ctr_expenses(center_id);
create index if not exists ctr_payout_org_idx        on public.ctr_teacher_payouts(org_id);
create index if not exists ctr_rem_org_idx           on public.ctr_reminder_log(org_id);
create index if not exists ctr_rem_student_idx       on public.ctr_reminder_log(student_id);
create index if not exists ctr_rem_invoice_idx       on public.ctr_reminder_log(invoice_id);
create index if not exists ctr_rem_enroll_idx        on public.ctr_reminder_log(enrollment_id);
create index if not exists ctr_orgs_created_by_idx   on public.ctr_organizations(created_by);
