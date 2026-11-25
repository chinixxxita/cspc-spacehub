# SpaceHub UX refresh

## What changed
- Refined the shared visual system with a restrained blue-to-purple brand accent.
- Improved sidebar, active navigation, top bar, buttons, form controls, cards, status pills, tables, and calendar styling.
- Increased interaction clarity with consistent focus rings, hover states, and more readable contrast.
- Improved responsive layouts for tablet and mobile, including navigation, dashboard statistics, tables, facility cards, and calendar scrolling.
- Updated the stylesheet cache-busting version in the shared EJS layout.

## What was intentionally preserved
- Express routes, EJS page structure, authentication, authorization, session handling, reservation logic, availability checks, database schema, and role-specific workflows.
- No database migrations or production data changes were made.

## Deployment
1. Back up the currently deployed project.
2. Replace the application files with this project version, or deploy the changed files:
   - `public/css/app.css`
   - `views/layouts/main.ejs`
3. Keep your production `.env` file and database credentials on the server. The `.env` file is intentionally not included in the UX refresh archive.
4. Restart/redeploy the app using your existing deployment process.
5. Hard-refresh the browser (Ctrl+F5) if cached styles remain.

## Validation performed
- JavaScript syntax check passed for the project JavaScript files.
- EJS compilation check passed for all 34 view templates.
- No live production deployment or end-to-end browser test was performed.
