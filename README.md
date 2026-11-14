# Idlenomics

Run the static game with `python -m http.server 8000`, then open http://localhost:8000.
Run the dependency-free simulation regression suite with `npm test` (Node.js 22+).

## Progression rules

Online play and offline catch-up use the same one-second transitions in `simulation.js`:

1. Apply production and consumption, clamped to resource storage.
2. Run enabled, unlocked auto-crafting recipes in their displayed order. One artisan provides one cycle per four seconds per enabled recipe, multiplied by crafting speed. Fractional work is saved. A cycle needs all inputs and room for every output. Missed cycles expire rather than accumulating an instant-production backlog.
3. Add a settler after 25 consecutive seconds with positive net food, more than 15 stored food, and available housing. Reset the growth timer when those conditions fail. New settlers consume food on subsequent ticks. Food depletion stops growth; it does not kill citizens.
4. Advance civilization time and offer a historical dilemma every 90 seconds if none is pending. A pending dilemma waits for a player choice, online or offline.

The wall-clock adapter preserves partial seconds through autosaves and reloads, catches up delayed/hidden browser tabs, and guards against duplicate or backwards timestamps. Catch-up is capped at seven days and its timestamp is consumed once; time beyond that cap is discarded. Offline reporting shows the time actually simulated.

Existing saves retain their civilization and receive zeroed crafting/growth timers when those fields are absent. New saves, exports, imports and recovery backups preserve timer progress. Intentionally unassigned workers stay unassigned on reload.

The corrected artisan rate replaces the old forced minimum of one craft per callback, so one artisan may craft more slowly than before. Production and growth now agree whether the browser stays open or closed.
