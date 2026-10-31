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

  // Saving comes in step 6. For now, just say so.
  formMessage.textContent = "Saving arrives in step 6. Nothing was saved yet.";
  formMessage.hidden = false;
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
