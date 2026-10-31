# My Cookbook — Plan

A personal cookbook website that I use on my phone.

## What "done" means (version 1)

- [ ] I can **create** my own recipes.
- [ ] I can **save** recipes into my personal cookbook (typed, pasted, or from a built-in collection).
- [ ] I can **edit** a saved recipe and **add my own notes** to it.
- [ ] A **"What should I cook?"** button suggests a random recipe from my cookbook.

Later (planned, not a priority now):

- Suggest recipes from **what's in my fridge** (from my saved recipes first).
- Suggest **new recipes from an outside service**.
- **Paste a web link** and have the recipe filled in automatically.

## My answers to the planning questions

| Question | Answer |
|---|---|
| What should it suggest? | Random pick from my cookbook now. Fridge-based and outside suggestions later. |
| Where do recipes come from? | All three: I type/paste them, a built-in collection, and (later) a web link. |
| Where will I use it? | My phone. |

## The simplest way to build it

**A small website made of three plain files, hosted for free on GitHub Pages, that saves recipes inside my phone's browser.**

### The tools, in plain language

| Tool | What it is | Why this one |
|---|---|---|
| **HTML** | The structure of the page: headings, buttons, text boxes. | Every website uses it. Nothing to install. |
| **CSS** | The look: colors, sizes, layout that fits a phone screen. | Same — built into every browser. |
| **JavaScript** | The behavior: "when I tap Save, store this recipe." | Runs in the browser. No server needed. |
| **localStorage** | A small storage box built into the browser that keeps data after you close the page. | Saves my recipes on my phone with no database, account, or cost. |
| **GitHub Pages** | Free hosting that turns this repository into a real web address. | My code already lives on GitHub. Each time I push, the site updates. |
| **"Add to Home Screen"** | A phone feature that turns a website into an app-like icon. | Opens like an app, full screen, no app store. |

### What I'm deliberately *not* using (yet)

- **No framework** (React, etc.) — more to learn, and not needed for a project this size.
- **No server or database** — the phone stores everything. We can add an online database (for example, Supabase) later if I want sync between devices or protection against losing my phone.
- **No build tools** — I edit a file, refresh the page, and see the change.

### One important caution

Recipes live **only in my phone's browser**. If I clear browser data or lose the phone, they're gone. To protect against that, step 9 adds **Export / Import backup**. (On iPhone, adding the site to the Home Screen also helps Safari keep the data.)

## Files

```
index.html      the page
style.css       the look
app.js          the behavior
recipes.js      the built-in starter collection (step 8)
PLAN.md         this plan
```

## Recipe shape (what we store for each recipe)

```js
{
  id: "abc123",            // unique label, made automatically
  title: "Tomato Soup",
  ingredients: ["4 tomatoes", "1 onion", "2 cups stock"],
  steps: ["Chop everything", "Simmer 20 minutes", "Blend"],
  notes: "Add a pinch of sugar next time.",
  source: "mine",          // "mine", "collection", or a web link
  createdAt: "2026-10-31"
}
```

## Steps — small and testable one at a time

Each step ends with **"Test it"** — something I can check myself before we move on.

### Step 1 — Hello, cookbook
Create `index.html` with a title, "My Cookbook".
**Test it:** Open the file in a browser. I see the title.

### Step 2 — Put it on the internet
Turn on GitHub Pages for this repository.
**Test it:** Open the web address on my phone. I see "My Cookbook".

### Step 3 — Make it look right on a phone
Add `style.css`: readable text, big tap-friendly buttons, fits the screen.
**Test it:** On my phone, nothing is tiny and I don't need to scroll sideways.

### Step 4 — A form to create a recipe
Add a form: title, ingredients (one per line), steps (one per line), notes. A Save button. (Saving does nothing yet.)
**Test it:** I can type in every box on my phone.

### Step 5 — Save a recipe
Add `app.js`. Tapping Save stores the recipe in localStorage.
**Test it:** Save a recipe, close the browser, reopen it. (Step 6 will show it; for now, I'll check with a temporary message like "Saved 1 recipe".)

### Step 6 — See my cookbook
Show a list of saved recipe titles. Tapping a title opens the full recipe.
**Test it:** Save two recipes. Both appear. Tapping one shows its ingredients and steps.

### Step 7 — Edit, add notes, and delete
On a recipe's page: **Edit** button (change anything, including notes), and **Delete** (asks "Are you sure?").
**Test it:** Change a note, save, reload the page — the new note is still there. Delete a recipe — it's gone from the list.

### Step 8 — Built-in collection
Add `recipes.js` with ~10 starter recipes. A "Browse" screen lists them with a **Save to my cookbook** button. Once saved, it's my copy, so I can edit it and add notes.
**Test it:** Save one from Browse. It appears in my cookbook. Editing my copy doesn't change the original.

### Step 9 — Backup (Export / Import)
**Export** downloads all my recipes as one file. **Import** loads that file back.
**Test it:** Export, delete a recipe, import — the recipe comes back.

### Step 10 — "What should I cook?" button
Picks a random recipe from my cookbook and opens it.
**Test it:** Tap it several times; I get different recipes. With an empty cookbook, it shows a friendly message instead of breaking.

### Step 11 — Search
A search box that filters my cookbook by title or ingredient.
**Test it:** Typing "chicken" shows only recipes with chicken.

### Step 12 — Install on my phone
Add an icon and a small "manifest" file so the site can be added to the Home Screen like an app.
**Test it:** Add to Home Screen. Tapping the icon opens my cookbook full screen.

**→ Version 1 is done here.**

## Later — planned, not a priority

### Step 13 — Suggest from my fridge (my saved recipes)
I type what I have ("eggs, spinach, cheese"). The site ranks my saved recipes by how many of their ingredients I have and shows what's missing.
**Test it:** Enter ingredients from one recipe — that recipe is at the top.

### Step 14 — Suggest new recipes from an outside service
Use a free recipe service such as **TheMealDB** (free, no sign-up for basic use). Show suggestions (random, or by ingredient) with a **Save to my cookbook** button.
**Test it:** Tap "Suggest something new", see a recipe, save it, find it in my cookbook.

### Step 15 — Save from a web link
Paste a recipe URL and fill in the form automatically. This is the hardest part: many recipe sites block other websites from reading them directly, so this will likely need a small helper service. Until then, copy and paste works fine.

### Step 16 (optional) — Sync and safety online
If I want my recipes on more than one device, or safe if I lose my phone: move storage to an online database with a login (for example, Supabase, which has a free tier).

## How we'll work

- One step at a time. I test it, then we commit and move on.
- If a step breaks something, we fix it before starting the next one.
