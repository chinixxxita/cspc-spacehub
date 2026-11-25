CSPC SpaceHub - System Admin icon and table fix

Copy the three files in this ZIP into the matching locations under:
C:\xampp\htdocs\cspc-spacehub

Back up the existing files first. This patch changes only:
- views/layouts/main.ejs (CSS cache key)
- views/system-admin/dashboard.ejs (scoped wrapper/table classes)
- public/css/app.css (System Admin icon, heading, and table styles)

Restart the local Node server, then hard-refresh the browser with Ctrl+F5.
