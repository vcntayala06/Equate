# Equate

**Working title:** Equate  
**Tagline:** Find it. Solve it. Clear it.

This is a playable browser build of the equation-grid game designed in conversation.

## Run it

Open `index.html` in a modern browser.

For best mobile behavior, serve the folder from a simple local or web server instead of opening the file directly.

Example with Python:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Core rules implemented

- Addition, subtraction, multiplication, division, and mixed modes.
- Whole numbers only.
- Tap and swipe selection.
- Cleared tiles become blank.
- Blank spaces are treated as removed for future straight-line connections.
- An uncleared number always blocks a selection path.
- Early stages use straightforward directions.
- Diagonal play is introduced progressively.
- Reverse play is later.
- Expert mode allows the answer portion to snake while the problem portion remains straight.
- 10 equations per stage, 10 base points each.
- 80/100 advances.
- 10-minute timer with speed bonus.
- Hints reveal a currently valid equation with no score penalty.
- Two free undos, then -5 points per undo.
- Replays generate a fresh puzzle.
- Responsive portrait/landscape layout.
- Local save/resume and per-stage best score.

## Important prototype behavior

Very small early boards cannot physically hold 10 disjoint 3+ digit equations at once because cleared digits cannot be reused. To preserve both the small-board experience and the 10-equation stage score, early stages automatically cycle to another small board when no valid equation remains, while keeping the same stage score/timer.

This is intentionally implemented as one continuous stage, not as a reset.

## Next testing focus

1. Selection feels natural on iPhone.
2. Blank-space ray connections behave exactly as intended.
3. Generated boards feel solvable and strategic rather than random.
4. Difficulty ramp is fun.
5. Expert snaking needs real-device play testing before being considered final.
