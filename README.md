# Equate Build 6

Build 6 includes all live-play feedback collected after Build 5.

## Changes
- Added Full Screen control using the browser Fullscreen API.
- Fixed right-side control label overflow, including Settings.
- Added separate QUIT / SAVE control.
  - Save & Quit
  - Quit Without Saving (with confirmation)
  - Cancel
- EXIT is now separate from Quit / Save.
- Removed page-number text from gameplay.
- Expert boards now start at 9x9 minimum.
- Removed automatic highlighting/outlining of other matching numbers during normal play.
- Refactored Hint and manual selection to use the same `validateTriple()` function so a hinted equation cannot be rejected by the player validator.
- Preserves one whole number per tile, exactly three tiles per equation, white cleared tiles, tap + swipe, undo, hints, timer, sounds, running score, best score, 80/100 advancement, and the Build 5 board-transition input fix.
