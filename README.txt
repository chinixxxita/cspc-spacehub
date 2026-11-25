CSPC SpaceHub — Landing Page Restore Patch

This patch restores the earlier campus-wide public landing page design and makes the login/register background match the landing hero exactly (same campus image and overlay). It contains ONLY these three files:
- views/landing.ejs
- views/layouts/main.ejs (role-aware updated layout retained; stylesheet cache key refreshed)
- public/css/app.css (role-updated stylesheet retained; landing-specific styles restored; login background matched to landing hero)

Apply by backing up the three matching files in your local project, then copying these files into C:\xampp\htdocs\cspc-spacehub while preserving the folder structure. Do not replace the whole project or database. Restart the Node app and hard-refresh the browser (Ctrl+F5).
