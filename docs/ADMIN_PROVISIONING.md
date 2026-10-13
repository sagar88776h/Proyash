# Setting up the first administrator

There is **no default administrator account and no default password**. Public
sign-up is disabled. The first administrator is created once, deliberately,
by someone with access to the Supabase project; after that, every other
account is invited from the portal.

The database function `public.bootstrap_first_admin` can only be run with the
service role (not from the website), and it refuses to run as soon as any
active administrator exists — so it cannot be used later to take over the
portal.

## Option A — provisioning script (recommended)

Run from a trusted computer with Node.js 20.19+ and this repository:

```bash
export SUPABASE_URL="https://<project-ref>.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<service-role key>"   # never commit or share this
export SITE_URL="https://www.example.org"

npm run provision-admin -- --email admin@example.org --name "Full Name"

unset SUPABASE_SERVICE_ROLE_KEY
```

The script:

1. checks that no administrator exists yet (and stops if one does);
2. sends a Supabase invitation email — the person chooses their own password
   from the link, so no password is ever created, printed or stored;
3. grants the administrator role.

It reads the key only from the environment (never from a command-line
argument, which would be saved in shell history) and never prints it.

## Option B — Supabase dashboard

1. Authentication → Users → **Invite user** → enter the administrator’s email.
2. SQL editor → run:

   ```sql
   select public.bootstrap_first_admin('admin@example.org');
   ```

## After the first sign-in

1. Open the invitation email and choose a password (at least 10 characters,
   with upper and lower case letters and a number).
2. In the portal, open **Your account** and turn on **two-step verification**.
   Strongly recommended for every administrator and treasurer.
3. Go to **Administration → Users & roles** and invite the rest of the team,
   giving each person only the roles they need:

   | Role | Can |
   | --- | --- |
   | Administrator | Manage accounts, roles and settings; read everything including the audit log |
   | Treasurer | Record and verify ledger entries, reconcile accounts, prepare and publish financial reports |
   | Assistance reviewer | Review requests for help, add notes, change status |
   | Volunteer coordinator | Review volunteer registrations, assign volunteers, draft projects |
   | Publisher | Edit page content; publish projects, villages, outcomes and photos |
   | Volunteer | See their own volunteer profile and assignments |

4. Make sure **at least two people** hold finance roles (administrator or
   treasurer). With the default finance controls, the person who records an
   entry cannot verify it, and the person who prepares a report cannot publish it.
5. Work through the **Launch checklist** on the portal overview.

## Day-to-day account management

- **Never share accounts.** Every person signs in with their own email so the
  audit history shows who did what.
- When someone leaves, **deactivate** their account (Users & roles). This
  removes all access immediately and ends their sessions; their history stays.
  Accounts are not deleted.
- The portal prevents removing the last active administrator and prevents
  administrators from removing their own administrator role.
- If an administrator loses their authenticator app, another administrator
  cannot reset it from the portal. After confirming the request in person, a
  person with Supabase project access can remove the factor in the SQL editor,
  and the user then sets up two-step verification again:

  ```sql
  delete from auth.mfa_factors
  where user_id = (select id from auth.users where email = 'person@example.org');
  ```
