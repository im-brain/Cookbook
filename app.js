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
