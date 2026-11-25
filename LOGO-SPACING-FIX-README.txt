CSPC SpaceHub — Logo and spacing fix

Files included:
- views/layouts/main.ejs: bumps the stylesheet cache version only.
- public/css/app.css: aligns the sidebar monogram and brand text, improves the brand mark, and fixes System Administration page heading/card spacing and table overflow.

Apply locally:
1. Back up your current views/layouts/main.ejs and public/css/app.css.
2. Extract this ZIP and copy the two included files into the matching locations in C:\xampp\htdocs\cspc-spacehub.
3. Restart node .\app.js.
4. Hard-refresh the browser with Ctrl+F5.

No database, routes, permissions, or production settings are changed. The uploaded project did not contain an official CSPC seal/logo image, so this patch preserves the existing SpaceHub “SH” monogram rather than inventing an official crest.
