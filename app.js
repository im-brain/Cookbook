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
// The app has "screens" (home, recipe form). We show one and hide the others.

const homeScreen = document.getElementById("home-screen");
const formScreen = document.getElementById("recipe-form-screen");

// A "function" is a named set of instructions we can reuse.
// This one shows the screen you give it and hides the rest.
function showScreen(screenToShow) {
  homeScreen.hidden = screenToShow !== homeScreen;
  formScreen.hidden = screenToShow !== formScreen;
  window.scrollTo(0, 0); // jump back to the top of the page
}

// ---------- The recipe form ----------

const form = document.getElementById("recipe-form");
const sourceField = document.getElementById("source-field");
const formMessage = document.getElementById("form-message");

// "Add a recipe" button → open an empty form.
document.getElementById("add-recipe-button").addEventListener("click", function () {
  form.reset();                // empty all the boxes
  resetList(ingredientsList);  // back to one empty ingredient box
  resetList(stepsList);        // back to one empty step box
  updateSourceField();         // hide the Source box again
  formMessage.hidden = true;   // hide any old message
  homeMessage.hidden = true;   // and the "Saved" message on the home screen
  showScreen(formScreen);
});

// "Cancel" button → go back home without saving.
document.getElementById("cancel-button").addEventListener("click", function () {
  showScreen(homeScreen);
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

  // Collect everything from the form into one "recipe" (see recipeFromForm below).
  const recipe = recipeFromForm();

  // A title of only spaces doesn't count.
  if (recipe.current.title === "") {
    formMessage.textContent = "Please give the recipe a title.";
    formMessage.hidden = false;
    form.elements.title.focus();
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
  updateRecipeCount();
  showScreen(homeScreen);
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

// When the app opens, show the count straight away.
updateRecipeCount();
