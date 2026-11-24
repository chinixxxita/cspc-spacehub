# CSPC SpaceHub — Professional Campus UI update

This build replaces the heavy glassmorphism look with a professional campus-focused visual system while retaining the existing Express/EJS pages, routes, database integration, reservation workflow, and compact 15-minute time-picker implementation.

## Visual changes
- Solid white login and availability cards with restrained shadows and a CSPC-gold top accent.
- Campus background retained on the landing and login screens, with a strong navy overlay for readability.
- Solid navy navigation/sidebar and clear blue active states.
- Consistent white cards, light neutral page backgrounds, input focus states, and table styling.
- Glass blur/transparency removed from primary content panels and dense data areas.
- Responsive behavior and reduced-motion accessibility preferences retained.

## Run locally
1. Extract the project folder.
2. Ensure your local `.env` file is present and configured for your existing MySQL database. The `.env` file is intentionally not included in the archive.
3. Run `npm install`.
4. Run `npm run dev` or `npm start`.

No database recreation is required for this visual-only update. Keep your existing database and local `.env` file.
