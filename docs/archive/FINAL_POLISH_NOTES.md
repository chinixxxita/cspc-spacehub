# CSPC SpaceHub — Final Polish Update

## Reservation time selection
- Reservation hours are now continuous from 8:00 AM to 5:00 PM.
- 10:00 AM–1:00 PM is explicitly supported.
- The 12:00 PM–1:00 PM block is available.
- Two time-selection methods are provided:
  1. Quick Select — click an available hourly block.
  2. Time Picker — open the picker card and choose exact Start Time and End Time.
- Clicking an available time opens the time-picker card automatically.
- Pending/Approved reservations and scheduled maintenance remain unavailable.
- Server-side validation also allows continuous ranges such as 10:00–13:00.

## Usability
- Reservation form fields are preserved after server-side validation errors.
- Passwords are never preserved after authentication/registration errors.
- Landing page remains a focused one-screen desktop experience with subtle animation.
- Login page uses subtle entrance/background animation.
- Decorative sidebar home icon was removed.
- Calendar date formatting was stabilized so MySQL DATE values match calendar cells.
