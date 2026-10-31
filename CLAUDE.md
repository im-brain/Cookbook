# CLAUDE.md — read this first every session

This is a personal cookbook website. The full plan and progress are in `PLAN.md`.

## About the user

- New to coding. Explain every change in plain language and avoid jargon (or explain it the first time).
- Uses an **iPhone with Safari** only. Design and test for that.

## How we work

1. Work on **one step from `PLAN.md` at a time**.
2. Claude writes the code and explains what changed and why, in plain words.
3. Claude checks the step in a simulated iPhone screen (Playwright, iPhone viewport) and sends the user a screenshot.
4. Claude raises the **version number** (see Lessons learned) and opens a pull request that says which version to look for. The user taps **Merge** on GitHub.
5. About a minute later the live site updates at **https://im-brain.github.io/Cookbook/**. The phone may keep an old copy for up to 10 minutes, so the user waits, fully closes the app (swipe it away) and reopens it from the icon, checks the version number at the bottom of the home screen, then tests.
6. If something is broken, fix it before starting the next step.

## Memory rule (important)

New sessions start with no memory of earlier conversations, so this file and `PLAN.md` are the memory.
At the end of every step, in the same pull request:
- In `PLAN.md`: tick the step's checkbox and add a dated line to the **Progress log**.
- In this file: add any new decision or lesson to **Key decisions** or **Lessons learned**.

## Key decisions (and why)

- **Plain HTML, CSS and JavaScript.** No framework, no build tools. Simplest to learn; edit a file, see the change.
- **Recipes are stored on the phone (localStorage).** No account, database or cost. Online sync is a "maybe someday".
- **Public repository + GitHub Pages.** Free Pages doesn't work for private repos. Only code is public; recipes never go in the repo.
- **Always open the cookbook from the Home Screen icon.** Safari deletes a website's saved data after ~7 days of Safari use without visiting it, but Home Screen apps are exempt. The Home Screen app and a Safari tab have **separate storage**, so recipes saved in one don't appear in the other. That's why the install step comes early, before real recipes are saved.
- **Backups:** Export a file (save it to iCloud Drive), Import it back. The reminder shows "N recipes changed since your last backup" whenever there are unbacked-up changes (risk is losing the phone, not Safari).
- **Two kinds of recipe:** "My own" (no original) and "From somewhere else" (optional source, e.g. a link or "Grandma's card"). For the second kind, the first saved version is kept as the **original**; edits are "mine". Show "mine" by default, with **View original** and **Reset to original** (asks first).
- **Recipe fields:** title, ingredients, steps, servings, total time, tags, notes, kind, source. **No photos** (phone storage is about 5 MB).
- **Ingredients and steps are entered one at a time** (user's choice after trying a big text box): one box per item, "+ Add ingredient" / "+ Add step" or the keyboard's Next key adds the next box, × removes one. Steps are numbered.
- **Notes** are separate from edits and shown **above the ingredients**.
- **Tags:** starter list (breakfast, lunch, dinner, dessert, quick, vegetarian) plus the user's own.
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
- **Caching / version number (do this in every PR that changes the site):** GitHub Pages lets phones reuse saved copies of files for up to 10 minutes, and a Home Screen app has no refresh button. The phone can even mix a new `index.html` with an old `app.js`. Fix: raise the version number in **three places in `index.html`**: `style.css?v=N`, `app.js?v=N`, and the `<p class="version">Version N</p>` line on the home screen. Version 7 was the first (2026-10-31); step 6 is Version 8; step 7 is Version 9. Tell the user which number to look for.
- **Storage (step 6):** all recipes live in localStorage under the key `cookbook.recipes` as one JSON list. **Never rename that key** (recipes would seem to vanish). Helpers in `app.js`: `loadRecipes()` (returns a list, or `null` if the data is damaged), `storeRecipes(list)`, `saveNewRecipe(recipe)`, `recipeFromForm()`, `updateRecipeCount()`, `showHomeMessage(text)`. **If `loadRecipes()` returns `null`, never write**: show a message instead, so damaged data isn't overwritten.
- Recipe shape as saved: `{ id, kind, source, current: { title, ingredients[], steps[], servings|null, timeMinutes|null, tags[] }, original (copy of current, or null for "mine"), notes, createdAt, updatedAt }`. Dates are the phone's local date as "YYYY-MM-DD".
- Tests can fake "close and reopen" with `page.reload()`. localStorage survives it.
- **Showing recipes (step 7):** `renderRecipeList()` rebuilds the home list (A–Z by title, ignoring case). Call it after any change to saved recipes. `showRecipe(id)` fills and opens the recipe page. Helpers: `describeTime(minutes)`, `describeRecipe(recipe, includeTags)`, `fillList(element, items)`.
- **Safety rule:** put recipe text on the page only with `textContent` / `append(text)`, never `innerHTML` with recipe data, so odd characters can't break the page. (`innerHTML = ""` to empty an element is fine.)
