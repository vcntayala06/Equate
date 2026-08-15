# Equate Build 5

Build 5 is a clean rebuild of the gameplay screen and board-transition input path.

## Main fixes
- Landscape gameplay is designed to fit in one viewport with no page scrolling.
- Visual structure follows the approved reference:
  - stage top left
  - large running score top center
  - best score top right
  - circular timer/goal left
  - centered board
  - Undo/Hint/Pause/Settings right
- Page/board transitions explicitly re-enable input.
- Input listeners are delegated to the permanent board element, so tap/swipe continues working on page 2, page 3, etc.
- Pointer state is reset during page transitions, pause, blur, and new stages.

## Preserved rules
- One whole number per tile.
- Exactly three selected tiles per equation.
- Cleared tiles stay white.
- Matching-number assistance is outline-only.
- Invalid attempts automatically clear.
- Cleared white spaces do not block later straight-line connections.
- 10 equations per stage; 10 base points each; 80/100 advances.
- 10-minute timer with time bonus.
- Hint has no point penalty.
- Two free undos, then -5 points each.
- Sound effects and mute button.
- Running session score and best score.
