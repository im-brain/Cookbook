# CLAUDE.md — read this first every session

This is a personal cookbook website. The full plan and progress are in `PLAN.md`.

## About the user

- New to coding. Explain every change in plain language and avoid jargon (or explain it the first time).
- Uses an **iPhone with Safari** only. Design and test for that.

## How we work

1. Work on **one step from `PLAN.md` at a time**.
2. **Plan first.** Before changing any files in the repo or committing, Claude shows a short plan: what will change, which files (including which notes in `CLAUDE.md` / `PLAN.md`), and any choices made. Then Claude waits for the user's OK. Scratch work (test scripts, trying ideas in the scratchpad) doesn't need asking first.
3. Claude writes the code and explains what changed and why, in plain words.
4. Claude checks the step in a simulated iPhone screen (Playwright, iPhone viewport) and sends the user a screenshot.
5. Claude raises the **version number** (see Lessons learned) and opens a pull request that says which version to look for. The user taps **Merge** on GitHub.
6. About a minute later the live site updates at **https://im-brain.github.io/Cookbook/**. The phone may keep an old copy for up to 10 minutes, so the user waits, fully closes the app (swipe it away) and reopens it from the icon, checks the version number at the bottom of the home screen, then tests.
7. If something is broken, fix it before starting the next step.

## Memory rule (important)

New sessions start with no memory of earlier conversations, so this file and `PLAN.md` are the memory.
**Every pull request that changes anything** (not only numbered steps) also updates the notes, in the same pull request:
- In `PLAN.md`: tick any finished checkbox, update **Current status**, and add a dated line to the **Progress log**.
- In this file: add any new decision or lesson to **Key decisions** or **Lessons learned**, and keep the version-number list current.

## Key decisions (and why)

- **Plan before doing (2026-10-31, user's request):** the user liked getting a plan before any work, so every change starts with a plan and waits for an OK (see "How we work", step 2).
- **Plain HTML, CSS and JavaScript.** No framework, no build tools. Simplest to learn; edit a file, see the change.
- **Recipes are stored on the phone (localStorage).** No account, database or cost. Online sync is a "maybe someday".
- **Public repository + GitHub Pages.** Free Pages doesn't work for private repos. Only code is public; recipes never go in the repo.
- **Always open the cookbook from the Home Screen icon.** Safari deletes a website's saved data after ~7 days of Safari use without visiting it, but Home Screen apps are exempt. The Home Screen app and a Safari tab have **separate storage**, so recipes saved in one don't appear in the other. That's why the install step comes early, before real recipes are saved.
- **Backups:** Export a file (save it to iCloud Drive), Import it back. The reminder shows "N recipes changed since your last backup" whenever there are unbacked-up changes (risk is losing the phone, not Safari).
- **Import merges, never replaces** (user's choice): recipes missing from the phone are added, a recipe in both keeps the newer `updatedAt` (a tie keeps the phone's copy), nothing is deleted, and it asks first (`confirm`).
- **Export uses the iPhone Share menu** (`navigator.share` with a file), so the user taps Save to Files. If sharing isn't available (e.g. a computer), the file downloads instead.
- **Two kinds of recipe:** "My own" (no original) and "From somewhere else" (optional source, e.g. a link or "Grandma's card"). For the second kind, the first saved version is kept as the **original**; edits are "mine". Show "mine" by default, with **View original** and **Reset to original** (asks first).
- **Recipe fields:** title, ingredients, steps, servings, total time, tags, notes, kind, source. **No photos** (phone storage is about 5 MB).
- **Ingredients and steps are entered one at a time** (user's choice after trying a big text box): one box per item, "+ Add ingredient" / "+ Add step" or the keyboard's Next key adds the next box, × removes one. Steps are numbered.
- **Editing (step 9):** the same form as "Add a recipe", filled in. The kind ("My own" / "From somewhere else") is fixed once saved, so its choice is hidden when editing; the source can still change. Reset to original replaces only `current`; notes and source stay. Delete and Reset both ask first (`confirm`). Buttons sit at the bottom of the recipe page; Delete has red text.
- **Notes** are separate from edits and shown **above the ingredients**.
- **Tags:** starter list (breakfast, lunch, dinner, dessert, quick, vegetarian) plus the user's own.
- **Own tags are not stored separately (step 10):** the offered tags = starter tags + every tag on any saved recipe (`current` or `original`). So there is no extra storage key and backups carry tags automatically. A tag nobody uses any more simply stops being offered. Tags are lower case, single-spaced, max 30 characters.
- **Search (step 11)** looks at title, ingredients and tags of "my version" only (not notes, steps or the original). Every typed word must match somewhere; case and accents are ignored. It filters live as you type; there's no separate results screen.
- **"What should I cook?" (step 12)** is a box on the home screen, not a separate screen. The filter offers only tags actually used on a saved recipe, so a filter never comes up empty. It picks from "my version" tags. No repeat of the previous pick unless it's the only choice.
- **Cooking mode (2026-10-31, grill-me interview), steps 13–15:** "🍳 Start cooking" sits under the title/tags and always cooks "my version" (hidden while viewing the original). It opens a separate cooking screen with bigger text where you tap ingredients/steps to tick them off. Ticks are in memory only and forgotten on Done cooking; leaving doesn't ask first. **No timer in the cookbook** (user's choice: they use Siri / the Clock app; a Shortcut-based "iPhone Timer" button was offered and declined). Times in steps are shown in bold instead. The screen stays awake while cooking.
- **Scaling (step 14):** − / + servings (if the recipe has servings) plus ½×, 1×, 2×, 3×; only for the cooking session, never saved; kitchen fractions (nearest ¼ or ⅓), changed numbers highlighted; lines without a number unchanged.
- **Converter (step 15):** on the cooking screen only. **US measures** (cup 240 ml, tbsp 15 ml, tsp 5 ml); volumes, weights, °F ↔ °C, and cups ↔ grams for a built-in list of 12 common ingredients (see `PLAN.md`).
- **No outside recipe service for now.** TheMealDB and Spoonacular were considered and dropped.
- **Secret keys** (for the future link-import helper or AI) must live in a small Cloudflare Worker, **never** in the website's code, because the repo is public.
- **No offline mode yet.**

## Lessons learned

- Screenshot check: a Playwright script with `devices['iPhone 13']` opening `index.html` works in the cloud session (keep the script in the scratchpad, not the repo).
- GitHub Pages publishes from `main`, folder `/ (root)`. Every merge to `main` redeploys the site within about a minute.
- The cloud session's network can't open `*.github.io`, so Claude can't load the live site directly. To confirm a deploy, check the "pages build and deployment" workflow run via the GitHub tools; the user does the real-phone test.
- After a PR is merged, restart the working branch from `main` before the next step.
- Styling conventions (`style.css`): colors are variables in `:root` with a Dark Mode version; use the classes `.card`, `.button` and `.subtitle`; tap targets are at least 48px tall.
- For step 5: form inputs must use a font size of at least 16px, or iPhone Safari zooms in when you tap them. The page uses 18px, so `font: inherit` on inputs is enough.
- The app icon's source is `icons/icon.svg`. PNGs (180, 192, 512) are made from it with a Playwright screenshot script in the scratchpad. Re-run that script if the SVG changes.
- `app.js` checks `navigator.standalone` (iPhone) or `display-mode: standalone` to tell the Home Screen app from a Safari tab. In tests, fake it with `addInitScript` defining `navigator.standalone = true`.
- iPhone keeps the icon and name from the moment it's added, so later icon changes won't show unless it's re-added. **Deleting the Home Screen icon also deletes the recipes saved in it.** Never tell the user to delete or re-add the icon without exporting a backup first (step 8).
- Screenshot both light and dark mode (Playwright `colorScheme`), and check that `scrollWidth` equals the window width, which means no sideways scrolling.
- Screens: each screen is a `<section>` in `index.html` (`#home-screen`, `#recipe-view-screen`, `#recipe-form-screen`). `showScreen(...)` in `app.js` shows one and hides the rest. Add new screens to that function.
- Form classes in `style.css`: `.field` (label + hint + box), `.hint`, `.field-row` (side by side), `.choice` (big radio option), `.chips`/`.chip` (tag pills), `.message` (notice box), `.button-secondary` (outline button).
- CSS gotcha: `.field > label` also matched the `.choice` labels and broke their layout. It's now `.field > label:not(.choice)`. Watch for broad selectors overriding specific ones.
- Form field names (`kind`, `source`, `title`, `servings`, `time`, `tags`, `notes`) are what step 6 reads when saving. Ingredients and steps are lists: read them with `readList(ingredientsList)` / `readList(stepsList)` in `app.js` (empty boxes are skipped). To fill a list when editing (step 9), use `resetList` + `addRow`.
- Testing gotcha: Playwright's `text=+ Add ingredient` matched the hint text before the button. Target buttons by selector (e.g. `button.add-row[data-list=...]`).
- **Caching / version number (do this in every PR that changes the site):** GitHub Pages lets phones reuse saved copies of files for up to 10 minutes, and a Home Screen app has no refresh button. The phone can even mix a new `index.html` with an old `app.js`. Fix: raise the version number in **three places in `index.html`**: `style.css?v=N`, `app.js?v=N`, and the `<p class="version">Version N</p>` line on the home screen. Version 7 was the first (2026-10-31); step 6 is Version 8; step 7 is Version 9; step 8 is Version 10; step 9 is Version 11; step 10 is Version 12; step 11 is Version 13; step 12 is Version 14 (end of Version 1); step 13 is Version 15; step 14 will be Version 16; step 15 will be Version 17. Tell the user which number to look for.
- **Storage (step 6):** all recipes live in localStorage under the key `cookbook.recipes` as one JSON list. **Never rename that key** (recipes would seem to vanish). Helpers in `app.js`: `loadRecipes()` (returns a list, or `null` if the data is damaged), `storeRecipes(list)`, `saveNewRecipe(recipe)`, `recipeFromForm()`, `updateRecipeCount()`, `showHomeMessage(text)`. **If `loadRecipes()` returns `null`, never write**: show a message instead, so damaged data isn't overwritten.
- Recipe shape as saved: `{ id, kind, source, current: { title, ingredients[], steps[], servings|null, timeMinutes|null, tags[] }, original (copy of current, or null for "mine"), notes, createdAt, updatedAt }`. Dates are the phone's local date as "YYYY-MM-DD".
- Tests can fake "close and reopen" with `page.reload()`. localStorage survives it.
- **Showing recipes (step 7):** `renderRecipeList()` rebuilds the home list (A–Z by title, ignoring case). Call it after any change to saved recipes. `showRecipe(id)` fills and opens the recipe page. Helpers: `describeTime(minutes)`, `describeRecipe(recipe, includeTags)`, `fillList(element, items)`.
- **Safety rule:** put recipe text on the page only with `textContent` / `append(text)`, never `innerHTML` with recipe data, so odd characters can't break the page. (`innerHTML = ""` to empty an element is fine.)
- **Backup (step 8):** second localStorage key `cookbook.lastBackup` = `{ date, fingerprints: { id: hash } }`. **Never rename it.** `fingerprint(recipe)` is a short hash of the recipe's JSON. A recipe counts as "changed" if its fingerprint differs from the backup's, or it was added or deleted since. `rememberBackup(list)` runs after a finished export and after an import (the imported file counts as the backup). Call `updateBackupReminder()` after any change to saved recipes (step 9: after edit, delete and reset). Backup file shape: `{ app: "my-cookbook", formatVersion: 1, exportedAt, recipes: [...] }`. `cleanImportedRecipe` checks and tidies each imported recipe; keep its fields in the same order as `recipeFromForm`, or the fingerprints won't match.
- Testing the share menu: Playwright's Chromium has no share sheet. Fake it with `addInitScript` (`navigator.canShare = () => true; navigator.share = async d => { window.__shared = await d.files[0].text(); }`). For Import use `page.setInputFiles('#import-file', path)` and accept `confirm` with `page.on('dialog', d => d.accept())`.
- **Step 9 can use the backup:** if anything goes wrong while editing, the user can Import their latest backup to get recipes back.
- **Edit / delete / original (step 9):** `editingId` (null = new recipe) tells the form's Save whether to add or update; Cancel returns to the recipe when editing. `saveEditedRecipe(id, fromForm)` keeps `id`, `kind`, `original`, `createdAt` and sets `updatedAt`. `changeRecipe(id, change)` is the general "load, change one recipe, store" helper (refuses if data is damaged). `showRecipe(id, original)` shows my version or the original and picks which buttons to show; `shownRecipeId` / `showingOriginal` remember what's on screen. `refreshHome()` = count + list + backup reminder; call it after any change. `showViewMessage(text)` shows a message on the recipe page.
- **Tags (step 10):** the chips in `#tag-chips` are built by `renderTagChips(selectedTags)` from `knownTags()` (`STARTER_TAGS` + own tags A–Z); call it whenever the form opens (new: `[]`, edit: the recipe's tags). `cleanTag(text)` tidies typed tags. `addTypedTag()` reads the `#new-tag` box; Save calls it first so a typed-but-not-added tag isn't lost. Step 11/12 (search, random by tag) can use `knownTags()` for a tag filter.
- Form gotcha: pressing Enter in a single-line box inside a `<form>` submits the whole form. The `#new-tag` box catches Enter (`keydown` + `preventDefault`) to add the tag instead.
- Editing gotcha: list boxes can only be sized (`fitHeight`) once the form is on screen, so size them after `showScreen(formScreen)`.
- **Search (step 11):** `renderRecipeList()` reads `#search-box` itself and shows only matches, so every existing call to it (after save, edit, delete, import) keeps the filter. `simplify(text)` = lower case without accents; `matchesSearch(recipe, words)`. The box sits in `<form role="search">` so the iPhone keyboard shows a Search key; submitting only hides the keyboard. Safari's own clear button is hidden and replaced by a 48px `#search-clear` ×. `input[type="search"]` is in the shared input style rule (18px font, so no zoom).
- **Random pick (step 12):** `pickRecipe()` fills `#pick-card`; `pickTag` ("" = any) and `lastPickedId` remember the filter and last pick while the app is open (not saved). `renderPickTags(recipes)` builds the radio chips (same `.chip` look; radios work with the existing chip CSS). `makeRecipeButton(recipe)` builds a tappable recipe row and is shared by the list and the pick box. `refreshHome()` hides the pick box, since a pick may be out of date after a change.
- Testing randomness: run "Pick another" ~40 times and count results, checking every recipe shows up and none repeats twice in a row.
- **Cooking screen (step 13):** `#cooking-screen` (in `showScreen`). The `#start-cooking-button` click fills it from `recipe.current` of `shownRecipeId`; `fillCookList(list, items, boldTimes)` builds each item as `<li><button class="cook-item" aria-pressed><span class="cook-text">…`; tapping toggles `li.done`. `appendWithBoldTimes(element, text)` wraps times matched by `TIME_PATTERN` in `<strong class="cook-time">` (built with elements, not `innerHTML`). `doneCooking()` releases the wake lock and returns to the recipe. Step 14 (scaling) should rebuild the ingredient list with `fillCookList`.
- **Wake lock:** `keepAwake()` / `letSleep()` use `navigator.wakeLock` if it exists (iPhone Home Screen apps need iOS 18.4+; otherwise nothing happens). The phone drops it when you switch apps, so a `visibilitychange` listener asks again while the cooking screen is shown. In tests, fake `navigator.wakeLock` with `addInitScript`.
- **No regex look-behind (`(?<=` / `(?<!`)**: older iPhones can't read it, and one unreadable pattern stops all of `app.js` from running.
- CSS gotcha: a `display: flex` button turns every text piece and `<strong>` into its own column. Wrap the text in one `<span>` (`.cook-text`). Also put `line-through` on the span, not the button, or the ✓ circle gets crossed out too.
