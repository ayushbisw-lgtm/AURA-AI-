-- One-time scheduler setup. First apply the exam planner migration and enable
-- pg_cron, pg_net, and Vault under Supabase Database > Extensions.
-- Replace the placeholders locally. Never commit real secrets to this file.

select vault.create_secret('https://<your-project-ref>.supabase.co', 'aura_reminder_app_url');
select vault.create_secret('<same-random-value-as-Vercel-CRON_SECRET>', 'aura_reminder_cron_secret');

-- Run once after creating the two Vault secrets.
select cron.schedule(
  'aura-exam-reminders',
  '* * * * *',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'aura_reminder_app_url') || '/api/cron/exam-reminders',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'aura_reminder_cron_secret'),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  $$
);

-- To stop the scheduler later:
-- select cron.unschedule('aura-exam-reminders');
