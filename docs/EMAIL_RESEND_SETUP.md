# XERT email through Resend

XERT sends its automatic emails from the database. When a booking changes, a
class is cancelled, an enquiry arrives or a member joins, a trigger builds the
message and hands it to Resend over HTTPS (`pg_net`). The Resend key lives only
in Supabase Vault; the website, the iOS app and Vercel never see it. Every
send is written to `public.email_log`, and the owner controls everything under
**Command Centre → Communications → Email**.

Sending domain: `contact.xertfitness.com.au` (verified in Resend).
Default from address: `hello@contact.xertfitness.com.au`.

## One-time setup

1. In Resend, create an API key with sending permission for the
   `contact.xertfitness.com.au` domain. Copy it once; it is shown only once.
2. In Supabase → SQL Editor for the XERT project, run the migration
   `supabase/migrations/20260903010000_email_notifications.sql`.
3. In the same SQL Editor, store the key in Vault. Replace the placeholder
   with the real key and run:

   ```sql
   select vault.create_secret('PASTE_RESEND_KEY_HERE', 'resend_api_key');
   ```

   To rotate later, run
   `select vault.update_secret(id, 'NEW_KEY') from vault.secrets where name = 'resend_api_key';`.
4. Open Command Centre → Communications → Email. Set the reply-to address and
   the owner-alert address, turn the master switch on, save, then send a test
   to yourself. The log at the bottom shows sent, failed or skipped with the
   reason.

The key does not need to be in Vercel for any of this. If it was added there,
it is unused and can be removed.

## What is sent

| Event | Who gets it | Type switch |
| --- | --- | --- |
| Member booking confirmed, waitlisted or declined | the member | Booking confirmed, waitlisted or declined |
| Member or public booking cancelled | the member or requester | Booking cancelled |
| Class cancelled by XERT | everyone holding a place, request or waitlist spot | Class cancelled by XERT |
| Personal training request approved, declined or reschedule requested | the requester | Personal training request updates |
| New website enquiry, class request or PT request | the person, as a thank-you | Thanks-for-enquiring reply |
| New member account | the member | Welcome email |
| New enquiry, class request or PT request | the owner-alert address | Alert the owner |

Each type can be switched off individually. With the master switch off, every
email is logged as skipped and nothing is sent.

## Auth emails (sign-up confirmation, password reset)

Those are sent by Supabase Auth, not by these triggers. To send them from the
same domain: Supabase → Authentication → SMTP Settings → enable custom SMTP:

- Host `smtp.resend.com`, port `465`
- Username `resend`, password: the Resend API key
- Sender email `hello@contact.xertfitness.com.au`, sender name `XERT Fitness`

## Troubleshooting

- **Skipped, RESEND_API_KEY_MISSING**: step 3 has not been done in this project.
- **Skipped, EMAIL_DISABLED / EMAIL_TYPE_DISABLED**: turn the switch on in the Email screen.
- **Failed, HTTP 403 or 422**: the from address is not on a domain verified in Resend, or the key lacks sending permission.
- **Unknown**: the provider response expired before the log was refreshed. Check Resend's own log for that address.
