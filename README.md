# Daftar — center management

Management app (minimal white design, EuroPass red & blue for text and icons, Comfortaa, collapsible menu, Ctrl K search) for tutoring, language and training centers in Morocco: students, groups, timetable, attendance, invoices and cash payments, WhatsApp reminders, waiting list, teacher payroll, expenses, team roles and subscription plans. Multi-center (SaaS): every center's data is isolated by Supabase row-level security.

## Files
| Path | What it is |
|---|---|
| `index.html`, `css/`, `js/` | The app (plain HTML/JS, no build step) |
| `js/config.js` | App name, Supabase URL/key, WhatsApp number for plan requests |
| `sql/01–03` | Database schema, security rules, EuroPass sign-up guard (all already applied) |
| `fonts/` | Comfortaa, self-hosted (SIL Open Font License) |
| `tests/logic.test.mjs` | Business-rule tests: `node tests/logic.test.mjs` |

## Run it
- **Demo (no database):** open `index.html?demo` through any web server. Data lives in the browser only; the "Voir comme" menu switches between director, front desk and teacher.
- **Locally:** `python3 -m http.server 8000` in this folder → http://localhost:8000

## Publish on GitHub Pages
1. Create a repository, upload this folder, then **Settings → Pages → Deploy from branch → main / root**.
2. In Supabase (EuroPass project) → **Authentication → URL Configuration**, add the Pages URL (e.g. `https://<user>.github.io/daftar/`) to **Redirect URLs**, so confirmation and password-reset emails come back to the app.
3. Optional: **Authentication → Emails** — customise the confirmation email text for Daftar.

## Accounts and roles
- **EuroPass Academy** is already set up as the first center (owner: hitaklite@gmail.com — same password as the EuroPass site). That account is also the **platform admin**: the "Plateforme" page lists every center and lets you set plan, expiry date and limits after a client pays.
- New center owners sign up, choose "Créer mon centre" and get a **15-day trial**.
- Staff and teachers sign up, choose "Rejoindre une équipe" and enter the center's **team code** (shown on the Équipe page); the owner approves them.
- Menu: **Aperçu** (Tableau de bord, Emploi du temps, Conflits) · **Académique** (Groupes, Étudiants, Étudiants sortis, Liste d'attente, Enseignants) · **Finances** (Bilan mensuel, Paiements, Dépenses, Suivis) · **Centre** (Paramètres, Équipe, Abonnement).
- Roles: **Admin** = everything, including finances (Bilan mensuel, received-payments ledger, expenses, teacher payroll), settings and team · **Employé** = students, groups, timetable, taking payments, reminders and waiting list, with no financial overview · **Enseignant** = own groups, timetable and attendance only. Expenses and payroll are also locked to admins in the database.

## Plans (enforced in the database)
Trial 500 students / 3 sites (15 days) · Starter 199 DH: 150 / 1 · Growth 399 DH: 500 / 3 · Enterprise: unlimited. When a plan expires the center becomes read-only until renewed.

## How the automation works
- **Sessions** are created from each group's weekly slots (up to 6 weeks ahead) when the timetable is opened.
- **Billing is per student, every 30 days.** The first invoice is due on the enrollment start date. When it is fully paid, the next one is due 30 days after the payment (or 30 days after the due date if the student paid early, so early payers keep their date). Each invoice is created automatically 5 days before it is due, when anyone from the staff opens the app; partial or unpaid invoices hold the next cycle until settled. Turn off in Paramètres.
- **Late** = unpaid after due date + the grace period set in Réglages (default 7 days).
- **Reminders** open WhatsApp with the message pre-written; sending one marks it done for the day.
