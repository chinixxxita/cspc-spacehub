# CSPC SpaceHub — Glass + Time Picker Polish

## Final UI changes
- Professional glassmorphism applied selectively to public hero panels, login, dashboard cards, forms, calendar and reservation surfaces.
- Data tables use one consistent compact table style across dashboard/admin/reports.
- Reservation time selection now uses ONE time picker only.
- Time picker is hidden until the user clicks **Select time**.
- Time slots are 15-minute increments from 8:00 AM through 5:00 PM.
- Small availability cards appear inside the single time picker.
- Users can select exact times such as 8:15, 8:30, 10:45, 12:15, etc.
- 10:00 AM–1:00 PM is valid.
- Server-side validation accepts 15-minute increments and 8:00 AM–5:00 PM continuously.
- Availability endpoint returns 15-minute availability blocks and accounts for Pending/Approved reservations and scheduled maintenance periods.
- Maintenance conflict validation is now time-aware for reservation submission.

## Database
No schema changes are required. Keep the existing `.env` and `cspc_spacehub` database.
