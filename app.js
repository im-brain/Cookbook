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
