SpaceHub QR codes: making them work online and surviving a domain change

WHAT WAS WRONG
Printed codes contained APP_URL (your .env had http://192.168.254.102:3000, a LAN address), or
whatever address the admin had open. Posted online, those stickers pointed to a place nobody
outside your network can reach.

WHAT CHANGED
1. New .env setting QR_BASE_URL: the permanent public https address printed into the codes.
   (Falls back to APP_URL, then to the address the admin is browsing.)
2. Admin > Facility QR Codes now warns when the address is localhost / 192.168.x.x / http.
3. New "Scan QR" page (/checkin, in the sidebar for students/faculty). It reads ANY SpaceHub
   code, including stickers printed with an old domain, and opens check-in on the CURRENT site.
   It also has a paste-the-link box for browsers without camera scanning (e.g. iPhone Safari).
4. Facility tokens are unchanged. Nothing in the database needs to be touched.

DEPLOY STEPS
1. Host the app on a public server with HTTPS and set in .env:
     NODE_ENV=production
     APP_URL=https://your-domain
     QR_BASE_URL=https://your-domain
2. Restart the app, open Admin > Manage Facilities > QR Codes, confirm no warning, then print.

IF THE DOMAIN CHANGES LATER
- Best: keep the old domain and 301-redirect it to the new one, keeping the path
  (old.example.org/checkin/<token> -> new.example.org/checkin/<token>). Old stickers keep working.
- Otherwise: users open Scan QR inside SpaceHub (new site) and scan/paste the old code, or
  reprint after updating QR_BASE_URL. Do NOT use "Generate new code" for a domain change; that
  invalidates tokens and is only for compromised codes.
- Tip: use a domain you control for the long term (e.g. a school subdomain), not a temporary
  hosting URL, so stickers never need reprinting.
