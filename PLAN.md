# My Cookbook — Plan

A personal cookbook website that I use on my iPhone.
How we work and the reasons behind each decision are in `CLAUDE.md`.

## What "done" means (version 1)

- [ ] I can **create** my own recipes.
- [ ] I can **save** recipes from elsewhere (typed or pasted) into my cookbook, with their source.
- [ ] I can **edit** a saved recipe, see the **original**, and **add my own notes**.
- [ ] I can **back up** my recipes and get them back.
- [ ] I can **search** my cookbook.
- [ ] A **"What should I cook?"** button suggests a random recipe, optionally by tag.

## Decisions (from the planning interview)

| Topic | Decision |
|---|---|
| Phone | iPhone, Safari. Always open from the Home Screen icon. |
| Storage | On the phone (localStorage), plus backups to iCloud Drive. |
| Hosting | Public repo + GitHub Pages at `im-brain.github.io/Cookbook`. Recipes never go in the repo. |
| Kinds of recipe | "My own" or "From somewhere else" (with optional source). |
| Original vs mine | Recipes from elsewhere keep an untouched original. Show mine by default; View original; Reset to original. |
| Fields | Title, ingredients, steps, servings, time, tags, notes. No photos. |
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

- [ ] **Step 1 — Hello, cookbook.** An `index.html` page titled "My Cookbook".
  **Test it:** Claude's screenshot shows the title.
- [ ] **Step 2 — Put it on the internet.** Make the repo public and turn on GitHub Pages.
  **Test it:** Open `im-brain.github.io/Cookbook` on my iPhone and see "My Cookbook".
- [ ] **Step 3 — Phone-friendly look.** `style.css`: readable text, big buttons, fits the screen.
  **Test it:** Nothing is tiny; no sideways scrolling.
- [ ] **Step 4 — Add to Home Screen.** Icon + manifest so it installs like an app.
  **Test it:** Share → Add to Home Screen. The icon opens it full screen. **From now on, always use the icon.**
- [ ] **Step 5 — Recipe form.** Title, ingredients (one per line), steps (one per line), servings, time, tags, notes, and "My own" / "From somewhere else" with a source box. Save does nothing yet.
  **Test it:** I can fill in every box comfortably on my phone.
- [ ] **Step 6 — Save a recipe.** `app.js` stores it on the phone.
  **Test it:** Save one, close the app, reopen it: a message says "1 recipe saved".
- [ ] **Step 7 — See my cookbook.** A list of titles; tapping one shows the full recipe with notes above the ingredients.
  **Test it:** Save two recipes; both appear and open correctly.
- [ ] **Step 8 — Backup.** Export (save the file to iCloud Drive) and Import. Reminder: "N recipes changed since your last backup".
  **Test it:** Export, delete a recipe, import: it comes back. The reminder appears after a change and disappears after a backup.
- [ ] **Step 9 — Edit, delete, original vs mine.** Edit anything; delete asks "Are you sure?". For recipes from elsewhere: View original and Reset to original.
  **Test it:** Change a step, reload: change kept. View original shows the old step. Reset brings it back. Delete removes it.
- [ ] **Step 10 — Tags.** Starter tags plus my own.
  **Test it:** Add a new tag "soup" to a recipe; it's offered next time.
- [ ] **Step 11 — Search.** Filter by title, ingredient or tag.
  **Test it:** Typing "chicken" shows only recipes with chicken.
- [ ] **Step 12 — "What should I cook?"** Random pick, optional tag filter.
  **Test it:** Tap several times: different recipes. Filter "quick": only quick ones. Empty cookbook: a friendly message.

**→ Version 1 is done here.**

## Later — in this order

1. **Save from a web link + smart paste.** Paste a recipe URL (or a whole recipe's text) and the form fills itself in. Needs a small free helper (Cloudflare Worker) because browsers block one site from reading another.
   - **Then an AI upgrade** for sites and messy text that plain import can't handle. AI service and budget decided when we get there; the key stays hidden in the helper.
2. **Suggest from my fridge.** I type what I have; my saved recipes are ranked by how many ingredients I have, with what's missing.

## Maybe someday

- Suggestions from an outside recipe service
- Photos
- Offline mode
- Sync across devices / online storage

## Progress log

- 2026-10-31 — First plan written, then refined in a planning interview (grill-me). `CLAUDE.md` added as memory for future sessions.
