# CSPC SpaceHub — Final UI Polish Build

## Finalized UX
- Compact monthly calendar designed to fit the desktop viewport with minimal/no page scrolling.
- Calendar shows Pending, Booked (Approved), and Maintenance clearly.
- Calendar reservation dates are normalized in SQL to avoid JavaScript DATE/DATETIME mismatch.
- Landing page is a focused one-screen desktop experience with restrained campus-background motion and staged entrance animation.
- Login page uses the campus background, animated card/content entrance, subtle background glow, and clear focus states.
- Login validation preserves the School/Institutional ID while never preserving passwords.
- Reservation validation preserves non-sensitive form fields through the session draft.
- Reservation time selection has two methods:
  1. Quick Select — click an available hour; the time-picker card opens immediately and the user can choose an end time.
  2. Time Picker — open the picker directly and choose Start Time and End Time.
- Reservation operating window is continuous 8:00 AM–5:00 PM. 10:00 AM–1:00 PM is valid when all three hourly blocks are available.
- Reduced-motion support is preserved.
- Decorative icons are minimized; navigation remains text-led and functional.

## Important
Do not recreate or overwrite the existing `cspc_spacehub` database when installing this build. Back up the current project folder first.
