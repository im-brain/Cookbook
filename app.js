// app.js: how the cookbook BEHAVES.
// index.html = what's on the page, style.css = how it looks, this file = what it does.

// ---------- Home Screen check ----------
// Your recipes must be saved inside the Home Screen app, not in a Safari tab
// (they keep separate storage, and Safari may clear its copy). So we check
// which one you're in and show the right message.

// "standalone" means "opened from the Home Screen icon, without Safari's address bar".
// iPhones report it with navigator.standalone; other browsers use the display-mode check.
const openedFromHomeScreen =
  window.navigator.standalone === true ||
  window.matchMedia("(display-mode: standalone)").matches;

// Find the two messages in index.html by their id.
const installHelp = document.getElementById("install-help");
const installedNote = document.getElementById("installed-note");

// Show one message and hide the other.
// ("hidden = false" means "show it"; "hidden = true" means "hide it".)
if (openedFromHomeScreen) {
  installedNote.hidden = false;
  installHelp.hidden = true;
} else {
  installHelp.hidden = false;
  installedNote.hidden = true;
}

// ---------- Switching screens ----------
// The app has "screens" (home, recipe page, recipe form). We show one and hide the others.

const homeScreen = document.getElementById("home-screen");
const formScreen = document.getElementById("recipe-form-screen");
const viewScreen = document.getElementById("recipe-view-screen");

// A "function" is a named set of instructions we can reuse.
// This one shows the screen you give it and hides the rest.
function showScreen(screenToShow) {
  homeScreen.hidden = screenToShow !== homeScreen;
  formScreen.hidden = screenToShow !== formScreen;
  viewScreen.hidden = screenToShow !== viewScreen;
  window.scrollTo(0, 0); // jump back to the top of the page
}

// ---------- The recipe form ----------

const form = document.getElementById("recipe-form");
const sourceField = document.getElementById("source-field");
const formMessage = document.getElementById("form-message");
const formHeading = document.getElementById("form-heading");
const kindField = document.getElementById("kind-field");
const tagChips = document.getElementById("tag-chips");

// Which recipe the form is editing. null means "a new recipe".
let editingId = null;

// "Add a recipe" button → open an empty form.
document.getElementById("add-recipe-button").addEventListener("click", function () {
  editingId = null;
  formHeading.textContent = "New recipe";
  kindField.hidden = false;    // a new recipe asks where it's from
  form.reset();                // empty all the boxes
  renderTagChips([]);          // all known tags, none ticked
  resetList(ingredientsList);  // back to one empty ingredient box
  resetList(stepsList);        // back to one empty step box
  updateSourceField();         // hide the Source box again
  formMessage.hidden = true;   // hide any old message
  homeMessage.hidden = true;   // and the "Saved" message on the home screen
  showScreen(formScreen);
});

// "Cancel" button → go back without saving: to the recipe if editing, otherwise home.
document.getElementById("cancel-button").addEventListener("click", function () {
  if (editingId) {
    showRecipe(editingId, false);
  } else {
    showScreen(homeScreen);
  }
});

// Show the Source box only for recipes "From somewhere else".
function updateSourceField() {
  const kind = form.elements.kind.value; // "mine" or "elsewhere"
  sourceField.hidden = kind !== "elsewhere";
}
// Run it whenever one of the kind choices changes.
form.addEventListener("change", function (event) {
  if (event.target.name === "kind") {
    updateSourceField();
  }
});

// "Save recipe" button. The browser first checks that a title was typed (because of "required").
form.addEventListener("submit", function (event) {
  // Normally a form "sends" itself and reloads the page. We stop that.
  event.preventDefault();

  // A tag typed in the "New tag" box but not added yet still counts.
  addTypedTag();

  // Collect everything from the form into one "recipe" (see recipeFromForm below).
  const recipe = recipeFromForm();

  // A title of only spaces doesn't count.
  if (recipe.current.title === "") {
    formMessage.textContent = "Please give the recipe a title.";
    formMessage.hidden = false;
    form.elements.title.focus();
    return;
  }

  // Editing? Save the changes into the existing recipe instead (see saveEditedRecipe below).
  if (editingId) {
    const editResult = saveEditedRecipe(editingId, recipe);
    if (!editResult.ok) {
      formMessage.textContent = editResult.problem;
      formMessage.hidden = false;
      return;
    }
    refreshHome();
    showRecipe(editingId, false);
    showViewMessage("✓ Changes saved.");
    return;
  }

  // Try to save it. If something goes wrong, stay on the form and explain, so nothing is lost.
  const result = saveNewRecipe(recipe);
  if (!result.ok) {
    formMessage.textContent = result.problem;
    formMessage.hidden = false;
    return;
  }

  // Saved! Go home and say so.
  showHomeMessage("✓ Saved “" + recipe.current.title + "”.");
  refreshHome();
  showScreen(homeScreen);
});

// ---------- Tags ----------
// The starter tags are always offered. Your own tags are remembered simply by being
// on a saved recipe: every tag used on any recipe is offered next time.

const STARTER_TAGS = ["breakfast", "lunch", "dinner", "dessert", "quick", "vegetarian"];
const newTagBox = document.getElementById("new-tag");

// Tidy a typed tag: lower case, no extra spaces, at most 30 letters. "  Soup  " → "soup".
function cleanTag(text) {
  return text.trim().replace(/\s+/g, " ").toLowerCase().slice(0, 30);
}

// Every tag to offer: the starter tags first, then your own tags A to Z.
function knownTags() {
  const own = [];
  (loadRecipes() || []).forEach(function (recipe) {
    [recipe.current, recipe.original].forEach(function (version) {
      if (!version) {
        return;
      }
      version.tags.forEach(function (tag) {
        if (STARTER_TAGS.indexOf(tag) === -1 && own.indexOf(tag) === -1) {
          own.push(tag);
        }
      });
    });
  });
  own.sort(function (a, b) { return a.localeCompare(b); });
  return STARTER_TAGS.concat(own);
}

// Make one tag chip (a checkbox that looks like a pill) and add it to the form.
function addTagChip(tag, checked) {
  const chip = document.createElement("label");
  chip.className = "chip";
  const box = document.createElement("input");
  box.type = "checkbox";
  box.name = "tags";
  box.value = tag;
  box.checked = checked;
  const text = document.createElement("span");
  text.textContent = tag;
  chip.append(box, text);
  tagChips.append(chip);
}

// Fill the tag area with every known tag, ticking the ones in "selected".
function renderTagChips(selected) {
  tagChips.innerHTML = "";
  knownTags().forEach(function (tag) {
    addTagChip(tag, selected.indexOf(tag) !== -1);
  });
  // A recipe's tag that isn't known yet (shouldn't happen, but just in case) still gets a chip.
  selected.forEach(function (tag) {
    if (knownTags().indexOf(tag) === -1) {
      addTagChip(tag, true);
    }
  });
  newTagBox.value = "";
}

// Add the tag typed in the "New tag" box: tick its chip, making one if it's new.
function addTypedTag() {
  const tag = cleanTag(newTagBox.value);
  newTagBox.value = "";
  if (tag === "") {
    return;
  }
  const existing = Array.from(tagChips.querySelectorAll('input[name="tags"]')).find(function (box) {
    return box.value === tag;
  });
  if (existing) {
    existing.checked = true;
  } else {
    addTagChip(tag, true);
  }
}

document.getElementById("add-tag-button").addEventListener("click", function () {
  addTypedTag();
  newTagBox.focus(); // ready for another one
});

// The keyboard's Done key in the "New tag" box adds the tag (instead of saving the whole form).
newTagBox.addEventListener("keydown", function (event) {
  if (event.key === "Enter" && !event.isComposing) {
    event.preventDefault();
    addTypedTag();
  }
});

// ---------- Ingredient and step lists ----------
// Instead of one big box, ingredients and steps get one box each.
// "+ Add ingredient" / "+ Add step" (or the keyboard's Next key) adds the next box.

const ingredientsList = document.getElementById("ingredients-list");
const stepsList = document.getElementById("steps-list");

// Add one row (a typing box + a remove button) to a list.
// "afterRow" is optional: if given, the new row goes right after it instead of at the end.
function addRow(list, afterRow) {
  const name = list.dataset.name;       // "ingredients" or "steps" (from data-name in index.html)
  const item = list.dataset.item;       // "ingredient" or "step"

  // Build the row: <li> <textarea> <button>×</button> </li>
  const row = document.createElement("li");

  const box = document.createElement("textarea");
  box.name = name;
  box.rows = 1;
  box.enterKeyHint = "next";            // the iPhone keyboard shows "next" instead of "return"
  // The very first box shows an example; later boxes just say what goes there.
  box.placeholder = list.children.length === 0 ? list.dataset.example : "Next " + item;
  box.setAttribute("aria-label", item);

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "remove-row";
  removeButton.textContent = "×";
  removeButton.setAttribute("aria-label", "Remove this " + item);

  row.append(box, removeButton);

  // Put the row in the list: after "afterRow" if given, otherwise at the end.
  if (afterRow) {
    afterRow.after(row);
  } else {
    list.append(row);
  }
  return box;
}

// Empty a list and give it a single blank row.
function resetList(list) {
  list.innerHTML = "";
  addRow(list);
}

// Make a typing box exactly as tall as its text, so long steps wrap instead of scrolling.
function fitHeight(box) {
  box.style.height = "auto";
  box.style.height = box.scrollHeight + 2 + "px";
}

// "+ Add ingredient" and "+ Add step" buttons.
document.querySelectorAll(".add-row").forEach(function (button) {
  button.addEventListener("click", function () {
    const list = document.getElementById(button.dataset.list);
    const newBox = addRow(list);
    newBox.focus();   // put the cursor in the new box, ready to type
  });
});

// Things that happen inside the lists. One "listener" per list handles every row in it.
[ingredientsList, stepsList].forEach(function (list) {

  // Keyboard's Next/Return key → start the next row instead of a new line.
  list.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && !event.isComposing && event.target.tagName === "TEXTAREA") {
      event.preventDefault();
      const currentRow = event.target.closest("li");
      const newBox = addRow(list, currentRow);
      newBox.focus();
    }
  });

  // Typing → grow the box if the text wraps onto more lines.
  list.addEventListener("input", function (event) {
    if (event.target.tagName === "TEXTAREA") {
      fitHeight(event.target);
    }
  });

  // × button → remove that row. If it's the only row left, just empty it.
  list.addEventListener("click", function (event) {
    if (event.target.classList.contains("remove-row")) {
      const row = event.target.closest("li");
      if (list.children.length > 1) {
        row.remove();
      } else {
        const box = row.querySelector("textarea");
        box.value = "";
        fitHeight(box);
      }
    }
  });
});

// Read what's typed in a list, skipping empty boxes. Step 6 uses this when saving.
function readList(list) {
  return Array.from(list.querySelectorAll("textarea"))
    .map(function (box) { return box.value.trim(); })
    .filter(function (text) { return text !== ""; });
}

// Start each list with one empty row.
resetList(ingredientsList);
resetList(stepsList);

// ======================================================================
// ---------- Saving recipes on the phone ----------
// The phone has a small storage box for each website, called "localStorage".
// It only stores text, so we turn our list of recipes into text (called JSON) to save it,
// and turn it back into a list when we read it.
// ======================================================================

// The name of our "drawer" in the storage box. Never change it, or saved recipes would seem to vanish.
const STORAGE_KEY = "cookbook.recipes";

// Read all saved recipes. Returns a list (empty if nothing saved yet),
// or null if the saved text is damaged. In that case we must NOT overwrite it.
function loadRecipes() {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    if (text === null) {
      return []; // nothing saved yet
    }
    const recipes = JSON.parse(text);
    return Array.isArray(recipes) ? recipes : null;
  } catch (error) {
    return null;
  }
}

// Write the whole list of recipes back into storage. Returns true if it worked.
function storeRecipes(recipes) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(recipes));
    return true;
  } catch (error) {
    return false; // e.g. the phone's storage for this site is full
  }
}

// Make a unique label for each recipe, so we can find it again later.
function makeId() {
  if (window.crypto && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// Today's date on your phone, as text like "2026-10-31".
function todayAsText() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0"); // months count from 0, so add 1
  const day = String(now.getDate()).padStart(2, "0");
  return now.getFullYear() + "-" + month + "-" + day;
}

// Read the form and build a recipe in the shape described in PLAN.md.
function recipeFromForm() {
  const kind = form.elements.kind.value; // "mine" or "elsewhere"
  const servings = parseInt(form.elements.servings.value, 10);
  const minutes = parseInt(form.elements.time.value, 10);
  const today = todayAsText(); // e.g. "2026-10-31"

  // "current" is the version you see and edit.
  const current = {
    title: form.elements.title.value.trim(),
    ingredients: readList(ingredientsList),
    steps: readList(stepsList),
    servings: Number.isNaN(servings) ? null : servings,  // null = left empty
    timeMinutes: Number.isNaN(minutes) ? null : minutes,
    tags: Array.from(form.querySelectorAll('input[name="tags"]:checked')).map(function (box) {
      return box.value;
    })
  };

  return {
    id: makeId(),
    kind: kind,
    source: kind === "elsewhere" ? form.elements.source.value.trim() : "",
    current: current,
    // For recipes from somewhere else, keep an untouched copy as the "original".
    // (JSON.parse(JSON.stringify(...)) makes a separate copy, so later edits don't change it.)
    original: kind === "elsewhere" ? JSON.parse(JSON.stringify(current)) : null,
    notes: form.elements.notes.value.trim(),
    createdAt: today,
    updatedAt: today
  };
}

// Add one new recipe to the saved list. Returns { ok: true } or { ok: false, problem: "..." }.
function saveNewRecipe(recipe) {
  const recipes = loadRecipes();
  if (recipes === null) {
    return { ok: false, problem: "Sorry, your saved recipes couldn't be read, so nothing was changed. Please tell Claude." };
  }
  recipes.push(recipe);
  if (!storeRecipes(recipes)) {
    return { ok: false, problem: "Sorry, the recipe couldn't be saved. The phone's storage for the cookbook may be full." };
  }
  return { ok: true };
}

// ---------- Home screen messages ----------

const homeMessage = document.getElementById("home-message");
const recipeCount = document.getElementById("recipe-count");

function showHomeMessage(text) {
  homeMessage.textContent = text;
  homeMessage.hidden = false;
}

// Show how many recipes are saved, e.g. "1 recipe saved" or "3 recipes saved".
function updateRecipeCount() {
  const recipes = loadRecipes();
  if (recipes === null) {
    recipeCount.textContent = "Your saved recipes couldn't be read.";
  } else if (recipes.length === 0) {
    recipeCount.textContent = "No recipes saved yet.";
  } else if (recipes.length === 1) {
    recipeCount.textContent = "1 recipe saved";
  } else {
    recipeCount.textContent = recipes.length + " recipes saved";
  }
}

// ======================================================================
// ---------- The list of recipes (home screen) ----------
// ======================================================================

const recipeList = document.getElementById("recipe-list");
const emptyNote = document.getElementById("empty-note");

// Turn minutes into friendly text: 30 → "30 min", 75 → "1 hr 15 min".
function describeTime(minutes) {
  if (!minutes) {
    return "";
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) {
    return rest + " min";
  }
  return hours + " hr" + (rest ? " " + rest + " min" : "");
}

// Build a short details line like "30 min · Serves 4 · dinner, quick". Empty parts are left out.
function describeRecipe(recipe, includeTags) {
  const parts = [];
  if (recipe.current.timeMinutes) {
    parts.push(describeTime(recipe.current.timeMinutes));
  }
  if (recipe.current.servings) {
    parts.push("Serves " + recipe.current.servings);
  }
  if (includeTags && recipe.current.tags.length > 0) {
    parts.push(recipe.current.tags.join(", "));
  }
  return parts.join(" · ");
}

// Fill the home screen list with every saved recipe, A to Z.
// Note: we only ever set "textContent" (plain text), never raw HTML,
// so unusual characters in a recipe can't break the page.
function renderRecipeList() {
  recipeList.innerHTML = ""; // start from an empty list
  const recipes = loadRecipes();
  if (recipes === null) {
    emptyNote.hidden = true; // the count line at the top already says they couldn't be read
    return;
  }
  emptyNote.hidden = recipes.length > 0;

  // Sort A to Z by title, ignoring upper/lower case.
  const sorted = recipes.slice().sort(function (a, b) {
    return a.current.title.localeCompare(b.current.title, undefined, { sensitivity: "base" });
  });

  sorted.forEach(function (recipe) {
    const row = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "recipe-row";

    const title = document.createElement("span");
    title.className = "recipe-row-title";
    title.textContent = recipe.current.title;
    button.append(title);

    const detailsText = describeRecipe(recipe, true);
    if (detailsText) {
      const details = document.createElement("span");
      details.className = "recipe-row-details";
      details.textContent = detailsText;
      button.append(details);
    }

    // Tapping the row opens that recipe.
    button.addEventListener("click", function () {
      showRecipe(recipe.id);
    });

    row.append(button);
    recipeList.append(row);
  });
}

// ======================================================================
// ---------- One recipe's page ----------
// ======================================================================

// Fill a list (<ul> or <ol>) with one item per line of text.
function fillList(listElement, items) {
  listElement.innerHTML = "";
  items.forEach(function (text) {
    const item = document.createElement("li");
    item.textContent = text;
    listElement.append(item);
  });
}

// Which recipe the recipe page is showing, and whether it's showing the original.
let shownRecipeId = null;
let showingOriginal = false;

// Open the page for the recipe with this id.
// If "original" is true (recipes from somewhere else only), show the original instead of my version.
function showRecipe(id, original) {
  const recipes = loadRecipes() || [];
  const recipe = recipes.find(function (r) { return r.id === id; });
  if (!recipe) {
    return; // shouldn't happen, but don't crash if it does
  }
  const hasOriginal = recipe.kind === "elsewhere" && recipe.original !== null;
  shownRecipeId = id;
  showingOriginal = Boolean(original) && hasOriginal;
  viewMessage.hidden = true;

  // "current" is the version we're about to show: the original, or my version.
  const current = showingOriginal ? recipe.original : recipe.current;

  document.getElementById("view-title").textContent = current.title;

  const details = document.getElementById("view-details");
  details.textContent = describeRecipe({ current: current }, false);
  details.hidden = details.textContent === "";

  // Source: "From: ..." If it's a web link, make it tappable (opens in Safari).
  const source = document.getElementById("view-source");
  source.innerHTML = "";
  source.hidden = !(recipe.kind === "elsewhere" && recipe.source);
  if (!source.hidden) {
    source.append("From: ");
    if (/^https?:\/\//i.test(recipe.source)) {
      const link = document.createElement("a");
      link.href = recipe.source;
      link.textContent = recipe.source;
      link.target = "_blank";       // open in Safari, not inside the app
      link.rel = "noopener";
      source.append(link);
    } else {
      source.append(recipe.source);
    }
  }

  // Tags as pills.
  const tags = document.getElementById("view-tags");
  tags.innerHTML = "";
  current.tags.forEach(function (tag) {
    const pill = document.createElement("span");
    pill.className = "tag";
    pill.textContent = tag;
    tags.append(pill);
  });
  tags.hidden = current.tags.length === 0;

  // Notes (only if there are any).
  document.getElementById("view-notes").textContent = recipe.notes;
  document.getElementById("view-notes-box").hidden = !recipe.notes;

  // Ingredients and steps (each section hidden if empty).
  fillList(document.getElementById("view-ingredients"), current.ingredients);
  document.getElementById("view-ingredients-section").hidden = current.ingredients.length === 0;
  fillList(document.getElementById("view-steps"), current.steps);
  document.getElementById("view-steps-section").hidden = current.steps.length === 0;

  // Buttons: which ones make sense right now?
  const changed = hasOriginal && fingerprint(recipe.current) !== fingerprint(recipe.original);
  document.getElementById("original-banner").hidden = !showingOriginal;
  document.getElementById("edit-button").hidden = showingOriginal;
  document.getElementById("view-original-button").hidden = showingOriginal || !hasOriginal;
  document.getElementById("back-to-mine-button").hidden = !showingOriginal;
  document.getElementById("reset-button").hidden = !showingOriginal || !changed;
  document.getElementById("unchanged-note").hidden = !showingOriginal || changed;
  document.getElementById("delete-button").hidden = showingOriginal;

  showScreen(viewScreen);
}

const viewMessage = document.getElementById("view-message");

function showViewMessage(text) {
  viewMessage.textContent = text;
  viewMessage.hidden = false;
}

// Refresh everything on the home screen after saved recipes change.
function refreshHome() {
  updateRecipeCount();
  renderRecipeList();
  updateBackupReminder();
}

// Find one recipe, change it with "change", and store everything again.
// Returns { ok: true } or { ok: false, problem: "..." }, like saveNewRecipe.
function changeRecipe(id, change) {
  const recipes = loadRecipes();
  if (recipes === null) {
    return { ok: false, problem: "Sorry, your saved recipes couldn't be read, so nothing was changed. Please tell Claude." };
  }
  const index = recipes.findIndex(function (r) { return r.id === id; });
  if (index === -1) {
    return { ok: false, problem: "Sorry, that recipe couldn't be found. Nothing was changed." };
  }
  change(recipes, index);
  if (!storeRecipes(recipes)) {
    return { ok: false, problem: "Sorry, the change couldn't be saved. The phone's storage for the cookbook may be full." };
  }
  return { ok: true };
}

// ======================================================================
// ---------- Edit, delete, original ----------
// ======================================================================

// Fill a list of typing boxes (ingredients or steps) with saved items.
function fillEditList(list, items) {
  list.innerHTML = "";
  if (items.length === 0) {
    addRow(list);
    return;
  }
  items.forEach(function (text) {
    const box = addRow(list);
    box.value = text;
  });
}

// "Edit recipe" → open the form, filled in with my version of the recipe.
document.getElementById("edit-button").addEventListener("click", function () {
  const recipe = (loadRecipes() || []).find(function (r) { return r.id === shownRecipeId; });
  if (!recipe) {
    return;
  }
  const c = recipe.current;
  editingId = recipe.id;
  formHeading.textContent = "Edit recipe";
  kindField.hidden = true;     // the kind stays as it was saved
  form.reset();
  formMessage.hidden = true;

  form.elements.kind.value = recipe.kind;
  updateSourceField();
  form.elements.source.value = recipe.source;
  form.elements.title.value = c.title;
  fillEditList(ingredientsList, c.ingredients);
  fillEditList(stepsList, c.steps);
  form.elements.servings.value = c.servings === null ? "" : c.servings;
  form.elements.time.value = c.timeMinutes === null ? "" : c.timeMinutes;
  renderTagChips(c.tags);      // all known tags, with this recipe's ticked
  form.elements.notes.value = recipe.notes;

  showScreen(formScreen);
  // Boxes can only measure their height once they're on screen, so size them now.
  form.querySelectorAll(".list-editor textarea").forEach(fitHeight);
});

// Save the edited form into the existing recipe. Its id, kind, original and createdAt stay the same.
function saveEditedRecipe(id, fromForm) {
  return changeRecipe(id, function (recipes, index) {
    const recipe = recipes[index];
    recipe.source = fromForm.source;
    recipe.current = fromForm.current;
    recipe.notes = fromForm.notes;
    recipe.updatedAt = todayAsText();
  });
}

// "View original" / "Back to my version"
document.getElementById("view-original-button").addEventListener("click", function () {
  showRecipe(shownRecipeId, true);
});
document.getElementById("back-to-mine-button").addEventListener("click", function () {
  showRecipe(shownRecipeId, false);
});

// "Reset to original" → asks first, then makes my version a copy of the original. Notes are kept.
document.getElementById("reset-button").addEventListener("click", function () {
  const ok = window.confirm("Reset to the original?\n\nYour changes to this recipe will be lost. Your notes stay.");
  if (!ok) {
    return;
  }
  const result = changeRecipe(shownRecipeId, function (recipes, index) {
    const recipe = recipes[index];
    recipe.current = JSON.parse(JSON.stringify(recipe.original)); // a separate copy
    recipe.updatedAt = todayAsText();
  });
  if (!result.ok) {
    showViewMessage(result.problem);
    return;
  }
  refreshHome();
  showRecipe(shownRecipeId, false);
  showViewMessage("✓ Reset to the original.");
});

// "Delete recipe" → asks first, then removes it and goes home.
document.getElementById("delete-button").addEventListener("click", function () {
  const recipe = (loadRecipes() || []).find(function (r) { return r.id === shownRecipeId; });
  if (!recipe) {
    return;
  }
  const ok = window.confirm("Delete “" + recipe.current.title + "”?\n\nAre you sure? It can only come back from a backup file.");
  if (!ok) {
    return;
  }
  const result = changeRecipe(shownRecipeId, function (recipes, index) {
    recipes.splice(index, 1); // take it out of the list
  });
  if (!result.ok) {
    showViewMessage(result.problem);
    return;
  }
  refreshHome();
  showHomeMessage("Deleted “" + recipe.current.title + "”.");
  showScreen(homeScreen);
});

// "‹ My Cookbook" button → back to the list.
document.getElementById("back-button").addEventListener("click", function () {
  homeMessage.hidden = true;
  showScreen(homeScreen);
});

// ======================================================================
// ---------- Backup: Export and Import ----------
// Export puts every recipe into one file. You save it in iCloud Drive, so the recipes
// survive even if the phone is lost. Import reads that file back in.
// ======================================================================

// A second "drawer" in the storage box, remembering what the last backup contained.
// Never rename it either, or the reminder would think you never backed up.
const BACKUP_KEY = "cookbook.lastBackup";

const backupReminder = document.getElementById("backup-reminder");
const backupStatus = document.getElementById("backup-status");
const backupMessage = document.getElementById("backup-message");
const importFile = document.getElementById("import-file");

// Turn a recipe into a short "fingerprint" (a number written as text).
// If anything in the recipe changes, the fingerprint changes too. We keep only
// fingerprints (not whole copies) of the backup, so it uses almost no storage.
function fingerprint(recipe) {
  const text = JSON.stringify(recipe);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(36);
}

// Remember "this is what the backup contains": the date and one fingerprint per recipe.
function rememberBackup(recipes) {
  const fingerprints = {};
  recipes.forEach(function (recipe) {
    fingerprints[recipe.id] = fingerprint(recipe);
  });
  try {
    localStorage.setItem(BACKUP_KEY, JSON.stringify({ date: todayAsText(), fingerprints: fingerprints }));
  } catch (error) {
    // Not serious: the reminder will just say the recipes aren't backed up.
  }
}

// Read what the last backup contained, or null if there has never been one.
function loadLastBackup() {
  try {
    const saved = JSON.parse(localStorage.getItem(BACKUP_KEY));
    return saved && saved.fingerprints ? saved : null;
  } catch (error) {
    return null;
  }
}

// Count recipes that are new, edited or deleted since the last backup.
function countChangesSinceBackup(recipes, lastBackup) {
  let changes = 0;
  const stillHere = {};
  recipes.forEach(function (recipe) {
    stillHere[recipe.id] = true;
    if (lastBackup.fingerprints[recipe.id] !== fingerprint(recipe)) {
      changes++; // new or edited
    }
  });
  Object.keys(lastBackup.fingerprints).forEach(function (id) {
    if (!stillHere[id]) {
      changes++; // deleted
    }
  });
  return changes;
}

// "1 recipe" / "3 recipes"
function recipesWord(number) {
  return number + (number === 1 ? " recipe" : " recipes");
}

// Show the warning ("N recipes changed since your last backup") or the quiet "all backed up" line.
function updateBackupReminder() {
  const recipes = loadRecipes();
  const lastBackup = loadLastBackup();
  backupReminder.hidden = true;
  backupStatus.hidden = true;
  if (recipes === null) {
    return; // the top of the screen already says the recipes couldn't be read
  }

  if (lastBackup === null) {
    if (recipes.length > 0) {
      backupReminder.textContent = "You haven't made a backup yet. " +
        recipesWord(recipes.length) + (recipes.length === 1 ? " isn't" : " aren't") + " backed up.";
      backupReminder.hidden = false;
    }
    return;
  }

  const changes = countChangesSinceBackup(recipes, lastBackup);
  if (changes > 0) {
    backupReminder.textContent = recipesWord(changes) + " changed since your last backup (" + lastBackup.date + ").";
    backupReminder.hidden = false;
  } else {
    backupStatus.textContent = "✓ All recipes backed up (last backup " + lastBackup.date + ").";
    backupStatus.hidden = false;
  }
}

function showBackupMessage(text) {
  backupMessage.textContent = text;
  backupMessage.hidden = false;
}

// ----- Export -----
document.getElementById("export-button").addEventListener("click", function () {
  homeMessage.hidden = true;
  backupMessage.hidden = true;

  const recipes = loadRecipes();
  if (recipes === null) {
    showBackupMessage("Sorry, your saved recipes couldn't be read, so there's nothing to export. Please tell Claude.");
    return;
  }
  if (recipes.length === 0) {
    showBackupMessage("There are no recipes to back up yet.");
    return;
  }

  // The file's contents: a label saying what it is, the date, and every recipe.
  const backup = {
    app: "my-cookbook",
    formatVersion: 1,
    exportedAt: todayAsText(),
    recipes: recipes
  };
  const fileName = "cookbook-backup-" + todayAsText() + ".json";
  const file = new File([JSON.stringify(backup, null, 2)], fileName, { type: "application/json" });

  // On iPhone, open the Share menu with the file, so you can tap "Save to Files".
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file] })
      .then(function () {
        // You finished sharing (e.g. saved it to Files): count this as a backup.
        rememberBackup(recipes);
        updateBackupReminder();
        showBackupMessage("✓ Backup of " + recipesWord(recipes.length) + " made. Check it's in iCloud Drive (Files app).");
      })
      .catch(function (error) {
        if (error.name === "AbortError") {
          showBackupMessage("Backup cancelled. Nothing was saved.");
        } else {
          showBackupMessage("Sorry, the backup file couldn't be shared. Please tell Claude.");
        }
      });
    return;
  }

  // Other browsers (e.g. a computer): download the file instead.
  const link = document.createElement("a");
  link.href = URL.createObjectURL(file);
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(function () { URL.revokeObjectURL(link.href); }, 10000);
  rememberBackup(recipes);
  updateBackupReminder();
  showBackupMessage("✓ Backup file of " + recipesWord(recipes.length) + " downloaded.");
});

// ----- Import -----

// The Import button opens the phone's file picker (the hidden file box).
document.getElementById("import-button").addEventListener("click", function () {
  homeMessage.hidden = true;
  backupMessage.hidden = true;
  importFile.value = ""; // so picking the same file twice still works
  importFile.click();
});

// Check one recipe from a file has the parts we need, and fill in anything missing.
// Returns the tidied recipe, or null if it's not usable.
function cleanImportedRecipe(recipe) {
  if (!recipe || typeof recipe.id !== "string" || !recipe.current ||
      typeof recipe.current.title !== "string" || recipe.current.title.trim() === "") {
    return null;
  }
  const c = recipe.current;
  function textList(value) {
    return Array.isArray(value) ? value.filter(function (x) { return typeof x === "string"; }) : [];
  }
  function cleanPart(part) {
    return {
      title: String(part.title || ""),
      ingredients: textList(part.ingredients),
      steps: textList(part.steps),
      servings: typeof part.servings === "number" ? part.servings : null,
      timeMinutes: typeof part.timeMinutes === "number" ? part.timeMinutes : null,
      tags: textList(part.tags)
    };
  }
  return {
    id: recipe.id,
    kind: recipe.kind === "elsewhere" ? "elsewhere" : "mine",
    source: typeof recipe.source === "string" ? recipe.source : "",
    current: cleanPart(c),
    original: recipe.original ? cleanPart(recipe.original) : null,
    notes: typeof recipe.notes === "string" ? recipe.notes : "",
    createdAt: typeof recipe.createdAt === "string" ? recipe.createdAt : todayAsText(),
    updatedAt: typeof recipe.updatedAt === "string" ? recipe.updatedAt : todayAsText()
  };
}

// When a file is picked, read it and merge its recipes in.
importFile.addEventListener("change", function () {
  const picked = importFile.files[0];
  if (!picked) {
    return; // you closed the picker without choosing
  }
  picked.text().then(function (text) {
    importBackupText(text);
  }).catch(function () {
    showBackupMessage("Sorry, that file couldn't be opened.");
  });
});

// Merge the recipes in a backup file into the ones on the phone.
// Rule: nothing on the phone is ever deleted. Recipes missing from the phone are added back.
// If a recipe is in both, the one changed more recently is kept (if it's a tie, the phone's copy stays).
function importBackupText(text) {
  const onPhone = loadRecipes();
  if (onPhone === null) {
    showBackupMessage("Sorry, your saved recipes couldn't be read, so nothing was changed. Please tell Claude.");
    return;
  }

  // Read the file. It should be a cookbook backup (or, just in case, a plain list of recipes).
  let fileRecipes;
  try {
    const data = JSON.parse(text);
    fileRecipes = Array.isArray(data) ? data : (data && data.app === "my-cookbook" ? data.recipes : null);
  } catch (error) {
    fileRecipes = null;
  }
  if (!Array.isArray(fileRecipes)) {
    showBackupMessage("That file isn't a cookbook backup. Nothing was changed.");
    return;
  }

  const cleaned = fileRecipes.map(cleanImportedRecipe).filter(function (r) { return r !== null; });
  const skipped = fileRecipes.length - cleaned.length;
  if (cleaned.length === 0) {
    showBackupMessage("No usable recipes were found in that file. Nothing was changed.");
    return;
  }

  // Work out what would happen, before changing anything.
  const merged = onPhone.slice();
  let added = 0;
  let updated = 0;
  let same = 0;
  cleaned.forEach(function (fromFile) {
    const index = merged.findIndex(function (r) { return r.id === fromFile.id; });
    if (index === -1) {
      merged.push(fromFile);
      added++;
    } else if (fingerprint(merged[index]) === fingerprint(fromFile)) {
      same++;
    } else if (fromFile.updatedAt > merged[index].updatedAt) {
      merged[index] = fromFile; // the file's copy is newer
      updated++;
    } else {
      same++; // the phone's copy is newer (or same day): keep it
    }
  });

  if (added === 0 && updated === 0) {
    rememberBackup(cleaned); // the file is a backup of these recipes
    updateBackupReminder();
    showBackupMessage("Everything in that backup is already on your phone. Nothing to add.");
    return;
  }

  // Ask first.
  let question = "This backup has " + recipesWord(cleaned.length) + ".\n";
  if (added) question += "• " + recipesWord(added) + " will be added.\n";
  if (updated) question += "• " + recipesWord(updated) + " will be replaced by the newer copy in the file.\n";
  if (same) question += "• " + recipesWord(same) + " already on your phone " + (same === 1 ? "stays as it is" : "stay as they are") + ".\n";
  question += "Nothing on your phone will be deleted. Go ahead?";
  if (!window.confirm(question)) {
    showBackupMessage("Import cancelled. Nothing was changed.");
    return;
  }

  if (!storeRecipes(merged)) {
    showBackupMessage("Sorry, the recipes couldn't be saved. The phone's storage for the cookbook may be full. Nothing was changed.");
    return;
  }
  rememberBackup(cleaned); // the file is a backup of these recipes

  let done = "✓ Imported: " + recipesWord(added) + " added";
  if (updated) done += ", " + updated + " replaced";
  done += ".";
  if (skipped) done += " " + recipesWord(skipped) + " in the file couldn't be read and were skipped.";
  showBackupMessage(done);
  refreshHome();
}

// When the app opens, show the count, the list and the backup reminder straight away.
refreshHome();
