# Equate — Accuracy-Audited Build 9

Open `index.html` in a modern browser. No installation or network connection is required.

This build includes Solo and local 2 Player head-to-head play, exact 5×5/6×6/7×7/9×9 difficulty boards, progressive diagonal and reverse unlocks, intentional Save & Quit, a validator-driven animated tutorial, and two free hints per stage followed by a five-point charge (never below zero).

## Accuracy audit

Gameplay selections, hints, tutorial examples, unlock demonstrations, reverse behavior, and generated-board audits use `validator.js`.

With Node.js installed, run `node tests.js`.

The suite checks known-good and known-bad arithmetic, cleared-space paths, blocked-number paths, unlock states, reverse direction, and 2,000 generated boards.
