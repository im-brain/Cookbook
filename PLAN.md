# My Cookbook — Plan

A personal cookbook website that I use on my iPhone.
How we work and the reasons behind each decision are in `CLAUDE.md`.

## Current status (2026-11-09)

- **"Suggest from my fridge" is done as Version 37** (merged and confirmed working on the phone on 2026-11-09). **The AI upgrade is dropped** (user's choice, 2026-11-09): for screenshots the user will send them to Claude in a chat and get back text to paste with 📋 Paste. **Nothing is planned now: the redesign, import, cooking mode and the fridge are all done. Ask the user what they'd like next.**

- **Phase 8 (Shopping list) is done.** Part B (Version 36, shopping sync) is merged, its SQL was run in Supabase, and on 2026-11-09 the user confirmed it works both ways between iPhone and iPad (extras, ticks, removals). Phases 1–8 are done. Next: see **Redesign** below for what follows Phase 8 (the AI upgrade and "Suggest from my fridge" come after the redesign).

- **Phase 7 (This Week / Next Week) is done**: Part A (Version 31, the planner), Part B (Version 32, plan sync; its SQL was run in Supabase) and the fix found while moving the iPad (Version 33: Verify explains itself, the conflict box shows at once, "Make this device match the cloud") are merged. On 2026-11-09 the user finished the move on the iPad and reported that it worked, so both devices now sync. (The plan sync between iPhone and iPad was not reported separately; if it ever misbehaves, start from `js/plan-sync.js` and `tests/plan-sync.test.js`.) Phases 1–7 are done. **Phase 8 Part A (Shopping list on the phone) is done as Version 34 (confirmed working) plus a look fix as Version 35 (smaller one-line rows; always opens on this week); Version 35 was confirmed working on the phone on 2026-11-09. Next: Part B (shopping sync, Version 36)**, in a new session. It reads the plan (`cookbook.plan`, see `CLAUDE.md` → This Week) and the recipes' structured ingredients, and a range uses its **upper** amount.

- **Version 1**, **Cooking mode** and **Import a recipe** are done (up to Version 22, all confirmed on the phone).
- **Redesign approved** (2026-11-08): new look, Cover Flow, structured ingredients, private Supabase sync, photos, This Week and a shopping list, in 8 phases (see **Redesign** below and `CLAUDE.md` → Key decisions).
- **Phase 1 (new look, tab bar, Settings) is done as Version 23** (confirmed on the phone). **Phase 2 (Cookbook views) is done** (Version 24, plus the slider fix as Version 25, merged). **Phase 3 (Structured ingredients) is split in two**: **Part A (Version 26)** is done and confirmed on the phone; **Part B (Version 27)** (the ingredient editor) is merged. **Phase 4 (Version 28, account and sync, test project only) is done**: merged and confirmed on the phone. **Phase 5 (Version 29, move the real recipes) is next.** It needs a fresh backup first, the real Supabase project's address and publishable key (allowed in the cloud environment's network settings), the user's explicit OK at the upload step, and the user pasting the updated helper into Cloudflare.
- The AI upgrade (also for screenshots) and "Suggest from my fridge" come after the redesign.
- **Working rules:** Claude shows a plan and waits for the user's OK before changing or committing anything, and does **one step per session** (the user starts a new session for each step). See `CLAUDE.md`.
- Recipes the user saves are real. Before anything risky, ask the user to **Export a backup** first (Settings → Backup since Version 23).

## What "done" means (version 1)

- [x] I can **create** my own recipes.
- [x] I can **save** recipes from elsewhere (typed or pasted) into my cookbook, with their source.
- [x] I can **edit** a saved recipe, see the **original**, and **add my own notes**.
- [x] I can **back up** my recipes and get them back.
- [x] I can **search** my cookbook.
- [x] A **"What should I cook?"** button suggests a random recipe, optionally by tag.

## Decisions (from the planning interview)

| Topic | Decision |
|---|---|
| Phone | iPhone, Safari. Always open from the Home Screen icon. |
| Storage | On the phone (localStorage), plus backups to iCloud Drive. |
| Hosting | Public repo + GitHub Pages at `im-brain.github.io/Cookbook`. Recipes never go in the repo. |
| Kinds of recipe | "My own" or "From somewhere else" (with optional source). |
| Original vs mine | Recipes from elsewhere keep an untouched original. Show mine by default; View original; Reset to original. |
| Fields | Title, ingredients, steps, servings, time, tags, notes. One optional photo (Version 30). |
| Notes | Separate from edits, shown above the ingredients. |
| Tags | breakfast, lunch, dinner, dessert, quick, vegetarian + my own. |
| Random pick | From all saved recipes, optional tag filter. |
| Outside recipe services | None for now (TheMealDB and Spoonacular dropped). |
| Offline mode | Not yet. |
| Workflow | Claude writes + explains, checks on a simulated iPhone and sends a screenshot, I tap Merge, I test live. |

## Tools, in plain language

| Tool | What it is | Why |
|---|---|---|
| **HTML** | The structure: headings, buttons, text boxes. | Every website uses it. Nothing to install. |
| **CSS** | The look: colors, sizes, layout for a phone screen. | Built into every browser. |
| **JavaScript** | The behavior: "when I tap Save, store this recipe." | Runs in the browser. No server needed. |
| **localStorage** | A small storage box in the browser that keeps data after closing. | Saves recipes on my phone for free, no account. |
| **GitHub Pages** | Free hosting that turns this repo into a web address. | The code already lives on GitHub. |
| **Add to Home Screen** | Turns the website into an app-like icon. | Opens like an app, and protects my data from Safari's clean-up. |

## Files

```
index.html               the page
style.css                the look
app.js                   the behavior
manifest.json + icon     what "Add to Home Screen" uses (step 4)
PLAN.md                  this plan
CLAUDE.md                memory for future sessions
```

## Recipe shape (what we store for each recipe)

```js
{
  id: "abc123",
  kind: "elsewhere",           // "mine" or "elsewhere"
  source: "Grandma's card",    // optional, for "elsewhere"
  current: {                   // what I see and edit
    title: "Tomato Soup",
    ingredients: ["4 tomatoes", "1 onion", "2 cups stock"],
    steps: ["Chop everything", "Simmer 20 minutes", "Blend"],
    servings: 4,
    timeMinutes: 30,
    tags: ["dinner", "vegetarian"]
  },
  original: { ... },           // only for "elsewhere": the first saved version, never changed
  notes: "Add a pinch of sugar next time.",
  createdAt: "2026-10-31",
  updatedAt: "2026-10-31"
}
```

## Version 1 steps — small and testable one at a time

Each step ends with **"Test it"**: something I check on my phone before we move on.

- [x] **Step 1 — Hello, cookbook.** An `index.html` page titled "My Cookbook".
  **Test it:** Claude's screenshot shows the title.
- [x] **Step 2 — Put it on the internet.** Make the repo public and turn on GitHub Pages.
  **Test it:** Open `im-brain.github.io/Cookbook` on my iPhone and see "My Cookbook".
- [x] **Step 3 — Phone-friendly look.** `style.css`: readable text, big buttons, fits the screen.
  **Test it:** Nothing is tiny; no sideways scrolling.
- [x] **Step 4 — Add to Home Screen.** Icon + manifest so it installs like an app.
  **Test it:** Share → Add to Home Screen. The icon opens it full screen. **From now on, always use the icon.**
- [x] **Step 5 — Recipe form.** Title, ingredients and steps (one box each, with "+ Add ingredient" / "+ Add step"), servings, time, tags, notes, and "My own" / "From somewhere else" with a source box. Save does nothing yet.
  **Test it:** I can fill in every box comfortably on my phone.
- [x] **Step 6 — Save a recipe.** `app.js` stores it on the phone.
  **Test it:** Save one, close the app, reopen it: a message says "1 recipe saved".
- [x] **Step 7 — See my cookbook.** A list of titles; tapping one shows the full recipe with notes above the ingredients.
  **Test it:** Save two recipes; both appear and open correctly.
- [x] **Step 8 — Backup.** Export (save the file to iCloud Drive) and Import. Reminder: "N recipes changed since your last backup".
  **Test it:** Export, delete a recipe, import: it comes back. The reminder appears after a change and disappears after a backup.
- [x] **Step 9 — Edit, delete, original vs mine.** Edit anything; delete asks "Are you sure?". For recipes from elsewhere: View original and Reset to original.
  **Test it:** Change a step, reload: change kept. View original shows the old step. Reset brings it back. Delete removes it.
- [x] **Step 10 — Tags.** Starter tags plus my own.
  **Test it:** Add a new tag "soup" to a recipe; it's offered next time.
- [x] **Step 11 — Search.** Filter by title, ingredient or tag.
  **Test it:** Typing "chicken" shows only recipes with chicken.
- [x] **Step 12 — "What should I cook?"** Random pick, optional tag filter.
  **Test it:** Tap several times: different recipes. Filter "quick": only quick ones. Empty cookbook: a friendly message.

**→ Version 1 is done here.**

## Cooking mode — steps 13–15

Decided in a grill-me interview (2026-10-31). Details in `CLAUDE.md` → Key decisions.

- [x] **Step 13 — Cooking screen (Version 15).** "🍳 Start cooking" under the title opens a big-text screen: notes, ingredients and steps you tap to tick off (forgotten when you tap Done cooking). Times in steps ("20 minutes") are bold, for Siri or the Clock app. The screen stays awake while cooking. No timer in the cookbook (user's choice).
  **Test it:** Start cooking a recipe: tick a few things off, put the phone down for a few minutes (the screen should stay on), tap Done cooking, then Start cooking again: no ticks.
- [x] **Step 14 — Scale the recipe (Version 16).** − / + servings (when the recipe has a servings number) and ½×, 1×, 2×, 3× buttons on the cooking screen. Amounts shown as kitchen fractions (1½, ⅓) and highlighted. Only for this cooking session; the saved recipe doesn't change. Only the amount at the **start** of a line changes ("2 (14 oz) cans" → "3 (14 oz) cans"; "Juice of 1 lemon" stays). Amounts of 10 or more are rounded to whole numbers (250 g ÷ 3 → 83 g).
  **Test it:** A "serves 4" recipe at 6 servings: "2 cups stock" shows "3 cups stock"; "salt to taste" unchanged; reopen the recipe: original amounts.
- [x] **Step 15 — Converter (Version 18).** "⚖️ Convert" box on the cooking screen. US measures (cup 240 ml). Volumes (cups, tbsp, tsp, fl oz, ml, l), weights (oz, lb, g, kg), °F ↔ °C, and cups ↔ grams for flour, white/brown/powdered sugar, butter, rice, rolled oats, cocoa, milk/water, honey, oil, grated cheese.
  **Test it:** 1 cup flour → about 120 g; 350 °F → about 175 °C; 1 lb → about 454 g.

## Import a recipe — steps 16–17

Decided in a grill-me interview (2026-11-01). Details in `CLAUDE.md` → Key decisions.

- [x] **Step 16 — Smart paste (Version 19).** A "✨ Fill in automatically" box at the top of the New recipe form (not when editing): paste a recipe's text (📋 Paste button or press-and-hold), tap **Fill in**, and the title, ingredients, steps, servings, time and any web link (as Source) are filled in, with "From somewhere else" picked. Nothing is saved until you tap Save. Asks first if you've already typed something. Without "Ingredients"/"Instructions" headings it guesses and says so. Runs only on the phone.
  **Test it:** In Safari, open a recipe, select from the title down to the last step, Copy. In the cookbook: + Add a recipe → 📋 Paste → Fill in. Check the boxes, Save, and open the recipe.
- [x] **Step 17 — From a link (Version 21).** Paste a recipe's web link instead; a free Cloudflare Worker helper reads the page (most recipe sites include a hidden, tidy copy of the recipe) and sends back only the recipe. Website categories: ones matching your tags are ticked, new ones show as unticked chips. The description is ignored. Warns if you already saved a recipe from that link. If a site refuses the helper, it suggests copying the text instead (step 16). The user creates the free Cloudflare account; the helper's code is kept in `worker/` (no secrets) and only answers the cookbook's site.
  **Test it:** Paste a link from a big recipe site → Fill in → everything filled in; paste the same link again after saving → the "already saved" warning.

## Redesign — phases 1–8 (approved 2026-11-08)

The full proposal (mockups, data model, Supabase limits, migration steps) is the Claude artifact "Cookbook Redesign Proposal": https://claude.ai/artifact/2JW78LGWDESSd18gs8c5oF. Each phase is one or two pull requests with its own version number, screenshots and phone check. Recipes are only touched in Phases 3 and 5, both after a fresh backup. Still plain HTML, CSS and JavaScript, no build step.

- [x] **Phase 1 — New look and navigation (Version 23).** Paper, ink and terracotta colours with Dark Mode, serif headings, faint paper grain, line icons. A tab bar on iPhone / notebook sidebar on iPad with **Cookbook** and **Settings** (This Week and Shopping are added in their phases). Backup moved to Settings; a yellow "Back up in Settings" reminder stays on the home screen. Every existing screen restyled; nothing removed; no data changes.
  **Test it:** see the phone checklist in the pull request (version, tabs, backup reminder, a recipe, cooking, add/edit, Dark Mode, iPhone sideways).
- [x] **Phase 2 — Cookbook views (Version 24).** Cover Flow, grid and list; typographic covers in tag colours; search, filter and selection kept; dice for a random pick; Reduce Motion; better landscape. `app.js` starts to split into a `js/` folder.
- [x] **Phase 3 — Structured ingredients (Versions 26 and 27, two pull requests).** Needs a fresh backup first.
  - [x] **Part A (Version 26, confirmed):** `js/ingredients.js` reads a line into amount, unit, package size, ingredient, prep and optional, always keeping the original wording; lines it isn't sure about get a "Check" tag; old recipes are converted once when the app opens (the untouched old data is copied to the key `cookbook.recipesBeforeStructured` first); scaling uses the amount field (same results as before); backup format 2 (format 1 files still import). Node checks in `tests/ingredients.test.js`.
  - [x] **Part B (Version 27):** the ingredient editor (type a line, the understood parts show underneath, tap ••• to adjust them); smart paste and link import fill it.
- [x] **Phase 4 — Account and sync, test project only (Version 28, merged and confirmed on the phone).** Sign-in (email + password), outbox sync, status pill, conflict choices, against a **test** Supabase project with made-up recipes. Needs: the user creates a free Supabase account with two projects, and the test project's address is allowed in this cloud environment's network settings.
- [x] **Phase 5 — Move the real recipes (Version 29, merged and confirmed on the phone).** The six-step move in Settings (backup → check → preview → upload only on tap → verify → finish; local copy kept). Keep-awake ping from the Cloudflare helper a few times a day.
- [x] **Phase 6 — Photos (Version 30).** One optional photo per recipe, shrunk on the phone (longest side 1600 px, JPEG), kept on the phone in IndexedDB and in a private Supabase Storage bucket `recipe-photos`, shown on the recipe page and on covers, included in backups (format 3). **Needs the new photo SQL at the end of `supabase/schema.sql` run once in Supabase.** *(Merged and confirmed on the phone.)*
  **Test it:** see the phone checklist in the pull request.
- [x] **Phase 7 — This Week / Next Week (Versions 31–33).** Planner by date with sides, servings, leftovers, eating out, notes, past weeks and reuse.
  - [x] **Part A (Version 31, merged and confirmed on the phone):** a **This Week** tab; This week / Next week switch and ‹ › for other weeks; a Tonight card with Start cooking (amounts scaled to the planned servings); each day has a main (recipe, leftovers, eating out or a note) plus side dishes (recipes), servings with − / +; ••• menu: open recipe, change, move to another day (swaps if busy), remove; "Reuse a past week…" copies a week into the one on screen (busy days are left alone). Saved on the phone (`cookbook.plan`) and in backups (format 4; older files still import). Node checks in `tests/plan.test.js` (60).
  - [x] **Part B (Version 32, merged; SQL run in Supabase; the iPad now syncs):** the plan syncs between devices (`plan_entries` table, SQL at the end of `supabase/schema.sql`, run once in Supabase). Last edit wins (no conflict screen); a removal reaches other devices; two mains for one day → the newer one stays; waiting changes show in the status pill; the screen refreshes itself when a sync brings changes. Node checks in `tests/plan-sync.test.js` (37).
- [ ] **Phase 8 — Shopping list (Versions 34–35, split in two with the user's OK on 2026-11-09).** Per week, scaled and combined, aisles, pantry, extras, synced ticks, changes marked. A range uses its **upper** amount.
  - [x] **Part A (Versions 34–35, on the phone, confirmed on the phone):** a **Shopping** tab (bottom bar / sidebar). This week / Next week and ‹ › (always opens on the current week; a Sunday-opens-next-week rule was removed in Version 35 at the user's request). Built from the dinner plan (mains and sides), scaled to the planned servings, same ingredients added up (cups with tbsp and ml, oz with lb and g; cups ↔ grams only for the converter's 12 ingredients), grouped by aisle (Produce, Meat & fish, Dairy & eggs, Bakery, Pantry, Frozen, Other; guessed from a built-in word list, changeable per item in the ••• sheet). "Needs a look" holds things that can't be added up or lines the reader wasn't sure of. Pantry items ("I always have this") are left off but can be put back; your own extras; tick items off; **New** / **More needed · was … when ticked** marks and a "Got it" button when the plan changes; "No longer needed" holds things the plan dropped. Saved on the phone (`cookbook.shopping`) and in backups (format 5; older files still import). Node checks in `tests/shopping.test.js` (58).
  - [x] **Part B (Version 36, merged; SQL run; confirmed on iPhone and iPad):** ticks, extras, pantry, aisle choices and the New / More needed marks sync between iPhone and iPad (new Supabase table `shopping_items`; **the user runs the new SQL at the end of `supabase/schema.sql` once**). Last edit wins; shared marks (user's choice). Node checks in `tests/shopping-sync.test.js` (30).

Also decided: a deleted recipe goes to **"Recently deleted" for 30 days** (from the sync phases on).

## Later — in this order (after the redesign)

0. *(Done / dropped 2026-11-09: "Suggest from my fridge" is Version 37; the AI upgrade below was dropped, see Current status.)*
1. **Save from a web link + smart paste.** *(Now steps 16–17 above.)* Paste a recipe URL (or a whole recipe's text) and the form fills itself in. Needs a small free helper (Cloudflare Worker) because browsers block one site from reading another.
   - **Then an AI upgrade** for sites and messy text that plain import can't handle, **and for reading a recipe from a screenshot** (user's choice, 2026-11-01). AI service and budget decided when we get there; the key stays hidden in the helper. The screenshot is only read, never saved (no photos). Until then: open the screenshot in Photos → Live Text button → Copy All → 📋 Paste in the cookbook.
2. **Suggest from my fridge.** I type what I have; my saved recipes are ranked by how many ingredients I have, with what's missing.

## Maybe someday

- Suggestions from an outside recipe service
- Photos
- Offline mode
- Sync across devices / online storage

## Progress log

- 2026-10-31 — First plan written, then refined in a planning interview (grill-me). `CLAUDE.md` added as memory for future sessions.
- 2026-10-31 — Step 1 done: `index.html` with the title "My Cookbook". Checked on a simulated iPhone screen.
- 2026-10-31 — Step 2 done: repo made public, GitHub Pages turned on (main branch, root). Site is live at https://im-brain.github.io/Cookbook/.
- 2026-10-31 — Step 3 done: `style.css` added (warm colors, iPhone font, 18px text, 48px-tall buttons, automatic Dark Mode, notch-safe edges). Checked in light and dark mode: no sideways scrolling.
- 2026-10-31 — Step 4 done: app icon (`icons/`), `manifest.json`, iPhone Home Screen settings, and `app.js` started. In a Safari tab the page shows "Add me to your Home Screen" instructions; from the icon it shows "✓ Opened from your Home Screen".
- 2026-10-31 — Step 5 done: "Add a recipe" opens a form with every field (kind + source, title, ingredients, steps, servings, time, tag chips, notes). Save shows a "step 6" message and stores nothing; Cancel goes home.
- 2026-10-31 — Step 5 follow-up: ingredients and steps changed from one big text box to one box per item, with "+ Add" buttons, the keyboard's Next key, and × to remove. Steps are numbered and long ones wrap.
- 2026-10-31 — Fix: the phone kept showing an old copy after merging (caching). Added version numbers to the file links and a "Version 7" label on the home screen. Every update raises the number.
- 2026-10-31 — Step 6 done (Version 8): Save stores the recipe on the phone (localStorage key `cookbook.recipes`). Home shows "N recipes saved" and "✓ Saved …". Recipes from somewhere else keep an untouched `original` copy. If saved data can't be read, nothing is overwritten.
- 2026-10-31 — Step 7 done (Version 9): home screen lists saved recipes A–Z (title + time · servings · tags). Tapping one opens its page: details, source (web links tappable), tags, notes above ingredients, bulleted ingredients, numbered steps, and a "‹ My Cookbook" back button.
- 2026-10-31 — Handoff to a new conversation. Added "Current status" above. (PLAN.md only, so no version bump.)
- 2026-10-31 — Step 7 confirmed on the user's phone.
- 2026-10-31 — Step 8 done (Version 10): a Backup box on the home screen. **Export** opens the iPhone Share menu with `cookbook-backup-YYYY-MM-DD.json` (Save to Files → iCloud Drive). **Import** merges a backup in: missing recipes come back, the newer copy wins, nothing on the phone is deleted, and it asks first. The reminder says "N recipes changed since your last backup" (new, edited or deleted), or "✓ All recipes backed up".
- 2026-10-31 — Step 8 confirmed on the user's phone (export to iCloud Drive and import both work).
- 2026-10-31 — Step 9 done (Version 11): the recipe page has **Edit recipe** (the same form, filled in), **Delete recipe** (asks first), and, for recipes from somewhere else, **View original** (with a banner) → **Back to my version** / **Reset to original** (asks first; notes are kept). The kind of recipe can't be changed when editing. Tags the starter list doesn't have are kept when editing.
- 2026-10-31 — Step 9 confirmed on the user's phone.
- 2026-10-31 — Step 10 done (Version 12): the form has a "New tag" box with "+ Add" (or the keyboard's Done). New tags appear as ticked chips. Tags are tidied to lower case, and duplicates are ignored. A tag typed but not added still counts when you tap Save. Your own tags are offered on every recipe form after the starter tags, A–Z.
- 2026-10-31 — Step 10 merged; the user moved on to the next step.
- 2026-10-31 — Step 11 done (Version 13): a search box above the recipe list filters it as you type, by title, ingredient or tag. Upper/lower case and accents don't matter, and several words must all match ("chicken dinner"). Shows "3 of 5 recipes" or "Nothing matches …"; × clears it. Hidden when the cookbook is empty. Only "my version" is searched, not the original.
- 2026-10-31 — Step 11 confirmed on the user's phone ("everything is looking good").
- 2026-10-31 — Step 12 done (Version 14): a "🎲 What should I cook?" button under "+ Add a recipe" opens a box with a random recipe (tap it to open), **Pick another**, and "Pick from" chips (any, or one tag used on your recipes). Never the same recipe twice in a row. Friendly messages for an empty cookbook or a tag with only one recipe. **Version 1 is complete.**
- 2026-10-31 — Step 12 merged. Working rule added at the user's request: Claude shows a plan and waits for an OK before changing or committing anything, and `CLAUDE.md` / `PLAN.md` are updated in every pull request. (Notes only, so no version bump; the site stays at Version 14.)
- 2026-10-31 — Handoff to a new conversation. "Current status" updated. (PLAN.md only, so no version bump.)
- 2026-10-31 — Step 12 confirmed on the user's phone. Planned "Cooking mode" in a grill-me interview: a cooking screen (step 13), scaling (step 14), a converter (step 15). No timer in the cookbook: the user uses Siri / Clock, and times in steps are shown in bold. Cooking mode comes before link import.
- 2026-10-31 — Step 13 done (Version 15): "🍳 Start cooking" on the recipe page (hidden while viewing the original) opens the cooking screen: bigger text, notes, ingredients and numbered steps as big tap-to-tick boxes, bold times, Done cooking at the top and bottom. The screen stays awake while cooking (Wake Lock; older iPhones just dim).
- 2026-10-31 — Step 13 confirmed on the user's phone ("Works!").
- 2026-10-31 — Step 14 done (Version 16): a box at the top of the cooking screen with "Serves − 4 +" (only if the recipe has servings) and ½×, 1×, 2×, 3× buttons. The amount at the start of each ingredient changes and is shown in color, as kitchen fractions (1½, ¾, ⅓); 10 or more are whole numbers. Ranges ("2-3 cloves") scale both ends. Ticks are kept when you change the amounts. Starting to cook again begins at the saved amounts; the saved recipe never changes. Known limit: words don't change ("1 cups", "1 tomatoes").
- 2026-10-31 — Step 14 merged. Look fix (Version 17), from the user's screenshot review: text is now centered next to the tick circles (also for two-line items) and inside the − / + and ½×–3× buttons. The ½×, 1×, 2×, 3× buttons are kept but smaller (user's choice), since − / + servings is the main control. The converter moves to Version 18.
- 2026-11-01 — Step 15 done (Version 18): a "⚖️ Convert" button under the scaling box opens a calculator: Amount, From (cups, tbsp, tsp, fl oz, ml, liters, oz, lb, g, kg, °F, °C) and an optional Ingredient for cups ↔ grams (12 common ingredients). Answers show as you type, one per line (e.g. 1 cup flour = 120 g; 350 °F = 177 °C). It starts closed each time you Start cooking and saves nothing. **Cooking mode is complete.**
- 2026-11-01 — Planned "Import a recipe" in a grill-me interview: smart paste first (step 16, on the phone), then from a link (step 17, Cloudflare helper). Fill in only, review, then Save. Website categories → tags (matching ticked, new ones unticked); descriptions ignored; duplicate-link warning. AI upgrade left for later.
- 2026-11-01 — Step 16 done (Version 19): "✨ Fill in automatically" on the New recipe form. Understands typical recipe-site text (headings, "Prep Time / Cook Time / Total Time", "Servings", tick boxes ▢, numbered steps, "Notes" left out, website buttons like "1x 2x 3x" or "Print Recipe" skipped) and plain text without headings (guesses, with a warning).
- 2026-11-01 — Step 16 confirmed on the user's phone ("Works well"). Fix (Version 20), from a real recipe (Corned Lamb Shank): any ingredient or step line ending with ":" ("Brined Lamb:", "For the Brined Lamb:") is now shown as a **section heading**: bold, no bullet or number, not tickable or scaled in cooking mode. Step numbers start again at 1 in each section. Works for already-saved recipes too (nothing stored changes).
- 2026-11-01 — Section headings (Version 20) merged. Decided: reading recipes from screenshots will be part of the AI upgrade, after step 17 (Live Text + Copy All + Paste works meanwhile).
- 2026-11-01 — Step 17 done (Version 21): paste a recipe's web link and tap Fill in. A small helper on Cloudflare (`worker/recipe-helper.js`, user's free account) reads the recipe block most recipe sites include for Google and sends back only the recipe. Sections become headings, website categories become tag suggestions (matching ticked, new unticked), a link already saved shows "You already have …" with Open it / Fill in anyway, and blocked sites / pages without a recipe say to copy the text instead. **"Import a recipe" is complete.**
- 2026-11-01 — Step 17 confirmed on the user's phone ("Works great"). Fix (Version 22): in cook mode the step numbers (and ✓) sat about 2px too high in their circles on the iPhone; the circle now centers its contents itself.
- 2026-11-08 — Redesign proposal (Phase 0) written as a Claude artifact with mockups, a working prototype and a Supabase free-plan check; approved in full by the user, including the phase order and the two small choices (upper amount of a range on shopping lists; 30-day "Recently deleted"). Navigation choice "A": tab bar with Cookbook and Settings now, more tabs later.
- 2026-11-08 — Phase 1 done (Version 23): the new look on every screen (paper/ink/terracotta, Dark Mode, serif headings, lined "My notes" paper, circled step numbers, line icons), a tab bar on iPhone and a sidebar on iPad, a new **Settings** screen holding Backup, and a "Back up in Settings" reminder on the home screen. Checked on a simulated iPhone 13 (portrait, sideways, light/dark) and iPad Pro 11: 38 feature checks pass (save, edit, delete, original/reset, search, random, cooking, scaling incl. "2 (14 oz) cans", converter, paste, link import, backup round trip), no sideways scrolling, no page errors.
- 2026-11-08 — Working rule added (user's choice): one step per session, to save tokens. (Notes only, so the site stays at Version 23.)
- 2026-11-08 — Phase 1 (Version 23) confirmed on the user's phone.
- 2026-11-08 — Phase 2 done (Version 24): the home screen has a tag filter row ("All · N" + coloured tags), a **Cover Flow / Grid / List** switch and a round 🎲 button (picks from the chosen tag). Covers are drawn from the recipe (first tag's colour, tag, title, kitchen icon). Cover Flow tilts and overlaps covers, has arrows and a slider, tap the middle cover to open; Reduce Motion turns the tilting off; smaller covers when the phone is sideways. View and tag are remembered. The new code lives in `js/cookbook-views.js` (first split of `app.js`). Checked on a simulated iPhone 13 (portrait, sideways, light, dark, Reduce Motion) and iPad Pro 11: 24 checks pass, no sideways scrolling, no page errors. No recipe data changes.
- 2026-11-08 — Version 25 (fix, from the user's feedback on Version 24): the Cover Flow slider no longer jumps up and down between recipes (it sits right under the covers and the caption has a fixed height), it moves smoothly instead of in whole steps (follows swiping; dragging it moves the covers continuously and they glide to the nearest recipe on release), and the covers now stack like the edges of a book's pages so moving fast riffles through them. Reduce Motion still turns the tilting off. 31 checks pass on a simulated iPhone 13 (slider position identical for all 12 recipes, continuous thumb, real drag, release glide).
- 2026-11-08 — Phase 3 Part A done (Version 26), after the user approved splitting Phase 3 in two (so Phases 4–8 move up to Versions 28–32). New `js/ingredients.js` (the amount helpers moved there from `app.js`) reads each ingredient line into amount, unit, package size, ingredient, prep and optional and keeps the original wording; uncertain lines show a "Check" tag; "salt to taste" etc. are kept as written. Old recipes are converted once when the app opens, with a safety copy of the untouched old data. Scaling uses the amount field and gives the same results as before ("2 (14 oz) cans" → "3 (14 oz) cans"). Backups are now format 2; format 1 files still import and give identical results. Checked: 116 Node checks on made-up lines, and 33 checks on a simulated iPhone 13 (conversion, safety copy, recipe page, cooking and scaling, search, edit, export/import round trips, damaged data left alone, light and dark, no sideways scrolling, no page errors). Because every recipe's stored form changed, the yellow backup reminder will say all recipes changed until a new backup is exported.
- 2026-11-08 — Phase 3 Part B done (Version 27): on the recipe form, each ingredient line shows a small grey strip under it with how it was understood ("2 · cup · flour · sifted", plus a "Check" tag if unsure, or "No amount, so it is used as written"). A ••• button opens a panel (Amount, Up to for ranges, Unit, Ingredient, Package size, Prep, Optional, Done); changing a box rewrites the line's words from the parts and clears "Check". Adjustments are kept when saving and editing again. Typing in the line afterwards reads it again (the hand adjustment is dropped). Smart paste and link import fill the same boxes, so they show the strip too. No change to the saved data or backups. New helper `ingredientFromParts` in `js/ingredients.js` with Node checks (118 pass).
- 2026-11-08 — Phase 4 built (Version 28), not merged yet. Test project `lpswqdxvpmzbgwoqhuji.supabase.co` allowed in the cloud environment's network settings. New files: `vendor/supabase.js` (pinned `@supabase/supabase-js` 2.118.0, bundled once; how in `vendor/README.md`), `supabase/schema.sql` (table `recipes` + privacy rules + server-set change time), `js/sync.js` (engine; Node checks in `tests/sync.test.js`, 56 checks with two pretend phones), `js/auth.js` (the only file that talks to Supabase), `js/sync-ui.js` (when to sync, status pill, Account box, "Changed on two devices", "Recently deleted"). Settings has an **Account** box (email + password, Sync now, Sign out) and **Recently deleted** (30 days, Restore); Delete now moves a recipe there. **In Phase 4 only recipes with the tag `sync-test` are synced**, so real recipes never reach the test project. Checked on a simulated iPhone with a pretend Supabase (sign up, send, edit, offline, conflict, delete/restore, dark mode); the real library loads and reaches the project (it says the tables aren't set up yet).
- 2026-11-08 — Phase 4 checked against the real test project after the user ran `supabase/schema.sql`: 25 privacy and sync-rule checks (user B can't see, change, delete or insert as user A; not signed in gets nothing; stale-version updates change nothing; the server sets `modified_at`; only already-deleted recipes can be purged) and a two-phone run of the real app with the real library (sign up, receive, auto-combine, conflict choice, delete arriving in Recently deleted, session kept after reopening, wrong-password message). Made-up test users stay in the test project's Authentication list and can be deleted there. Pull request opened (Version 28).
- 2026-11-08 — Phase 4 (Version 28) merged and confirmed on the user's phone. Notes only in this update (no version change); Phase 5 is next, in a new session.
- 2026-11-08 — Phase 5 built (Version 29): `js/auth.js` now points at the **real** Supabase project; the `sync-test` filter is gone (all recipes sync, but only **after** "Finish" in Settings → "Move my recipes to the cloud"). Six steps: backup → check → preview → upload (only on tap) → verify → finish. Keep-awake ping added to `worker/recipe-helper.js` (the user must paste it into Cloudflare and add a cron schedule). **Before using it the user must run `supabase/schema.sql` in the real project** (on 2026-11-08 the real project had no `recipes` table yet).
- 2026-11-08 — Phase 5 (Version 29) merged and confirmed on the user's phone: recipes moved to the cloud, SQL run, helper updated, cron `0 */8 * * *` added. One oddity: the sign-up confirmation email linked to `localhost` (Supabase's default Site URL); harmless. Notes only (no version change). Phase 6 is next, in a new session.
- 2026-11-08 — Phase 6 done (Version 30): one optional photo per recipe. The form has Take photo / Choose from library / Remove; the photo is shrunk on the phone, shown under the tags on the recipe page and as the cover in Cover Flow and Grid (title on a dark fade; the plain cover stays until the picture is on the phone). Pictures are kept in IndexedDB and sent to a private Supabase bucket after the recipe syncs; other phones download them. Backups are format 3 and carry the photos as text; format 1 and 2 files still import. Settings shows how many photos the phone holds. Needs the photo SQL run in Supabase (end of `supabase/schema.sql`). Node checks: `tests/photos.test.js` (20).
- 2026-11-08 — Phase 6 (Version 30) merged and confirmed on the user's phone; the photo SQL was run in Supabase. Notes only (no version change). Phase 7 is next, in a new session.
- 2026-11-08 — Phase 7 Part A built (Version 31): the **This Week** tab (see Phase 7 above). Plan kept on the phone only for now (key `cookbook.plan`), included in backups (format 4). New files `js/plan.js` (dates and plan changes, also runs in Node), `js/plan-ui.js` (the screen and bottom sheets), `tests/plan.test.js`. Part B (sync) and Shopping (now Version 33) come after.
- 2026-11-08 — Phase 7 Part A (Version 31) merged and confirmed on the user's phone. Notes only (no version change). Part B (Version 32, plan sync) is next, in a new session.
- 2026-11-09 — Phase 7 Part B built (Version 32): the meal plan syncs between devices through a new cloud table `plan_entries` (new SQL at the end of `supabase/schema.sql` must be run once in Supabase). New file `js/plan-sync.js`, cloud calls in `js/auth.js`, wiring in `js/sync-ui.js` / `js/plan-ui.js`. Tests: `tests/plan-sync.test.js` (37) and a two-device Playwright run. Shopping list (Phase 8, Version 33) is next after the phone check.
- 2026-11-09 — Version 33 (fix found while moving the iPad): on a second device that already holds some of the cloud's recipes, Verify kept bouncing back to Upload. Verify now says exactly what differs and what to do; the "Changed on two devices" box shows right after Upload/Verify (it used to need the app reopened); new button **"Make this device match the cloud"** in the move card for a second device (asks first; the cloud's copies replace this device's copies; recipes only here are kept and uploaded). Node checks: `tests/sync.test.js` now 84. Shopping list is now Version 34.
- 2026-11-09 — Version 33 merged and confirmed on the user's iPad: the move finished there ("It worked") and syncing is on. Phase 7 is complete. Notes only (no version change). Phase 8 (Shopping list, Version 34) is next, in a new session.
- 2026-11-09 — Phase 8 Part A built (Version 34), after the user OK'd the plan and the Part A / Part B split (standard aisles). New Shopping tab; new files `js/shopping.js` (list maths, tested by `tests/shopping.test.js`, 58 checks) and `js/shopping-ui.js` (screen); `app.js` (tab, backup format 5, import), `index.html`, `style.css`. Checked on a simulated iPhone 13, sideways, iPad Pro 11, light and dark (35 screen checks: scaling, adding up, ticks, extras, pantry, aisle change, "more needed", "no longer needed", backup round trip, damaged data left alone, no sideways scrolling, no page errors). Sync of the list is Part B (Version 35).
- 2026-11-09 — Version 35 (fix, from the user's phone check of Version 34): shopping rows are now one short line (about 40px instead of 58px): name, the meals it is for in tiny text on the same line (cut off with … when there's no room), and the amount on the right; smaller tick circle and ••• button, tighter gaps and headings, so more items fit on screen. The Shopping tab now always opens on **This week** (the Sunday-opens-next-week rule is gone). Also fixed a long-line bug: the list's column could grow wider than the screen and push the ••• button off the edge. 37 screen checks pass (iPhone 13, sideways, iPad, light/dark; rows 40px; no row past the screen edge). Shopping sync is now Part B, Version 36.
- 2026-11-09 — Version 35 merged and confirmed on the user's phone ("Everything works"). Phase 8 Part A (Shopping list on the phone) is done. Notes only (no version change). Next: Part B, shopping sync (Version 36), in a new session; it needs a new Supabase table and SQL the user runs once.
- 2026-11-09 — Phase 8 Part B built (Version 36): shopping choices sync between devices through a new cloud table `shopping_items` (SQL at the end of `supabase/schema.sql`, must be run once). New file `js/shopping-sync.js` (works in Node), cloud calls in `js/auth.js`, wiring in `js/sync-ui.js` / `js/shopping-ui.js`, tests `tests/shopping-sync.test.js` (30) plus a two-device Playwright run (an extra typed on one phone showed on the other). Backups unchanged (format 5).
- 2026-11-09 — Version 36 merged and confirmed on the user's iPhone and iPad ("Works both ways"). Phase 8 (Shopping list) is done. Notes only (no version change).
- 2026-11-09 — Version 37: "What's in my fridge?" on the Cookbook screen (fridge button beside the dice). Type what you have; saved recipes (my version) are ranked by fewest missing ingredients, each showing "You have 2 of 3. Missing: feta". Salt/pepper/water/oil and optional ingredients never count; Shopping "I always have this" items count as had. New `js/fridge.js` (matching, Node checks `tests/fridge.test.js`, 27) and `js/fridge-ui.js`. The AI upgrade was dropped at the user's request (screenshots go through a Claude chat instead).
- 2026-11-09 — Version 37 merged and confirmed on the user's phone ("everything works"). Nothing is planned next; ask the user. Notes only (no version change).
