// ======================================================================
// Sync screens and timing (redesign Phase 4). Plain script, loaded AFTER app.js.
// It decides WHEN to sync and shows the results: the status pill, the Account box,
// "Changed on two devices" and "Recently deleted". The sync work itself is in js/sync.js,
// the cloud connection in js/auth.js.
// All recipe text goes on the page with textContent, never innerHTML.
// ======================================================================

const syncPill = document.getElementById("sync-pill");
const accountMessage = document.getElementById("account-message");
const signinForm = document.getElementById("signin-form");
const signedInBox = document.getElementById("signed-in-box");
const accountName = document.getElementById("account-name");
const accountSyncLine = document.getElementById("account-sync-line");
const accountEmail = document.getElementById("account-email");
const accountPassword = document.getElementById("account-password");
const conflictCard = document.getElementById("conflict-card");
const conflictListBox = document.getElementById("conflict-list");
const trashCard = document.getElementById("trash-card");
const trashListBox = document.getElementById("trash-list");

let syncUser = null;          // the signed-in person, or null
let syncRunning = false;      // a sync is in progress right now
let syncWanted = false;       // something changed while syncing: go round once more
let syncTimer = null;         // waits a moment after a change, so several quick edits go together
let retryTimer = null;
let retryDelay = 30000;       // grows to 5 minutes while syncing keeps failing
let engineWriting = false;    // true while the sync engine itself saves (not a change by the person)
let syncStatus = { kind: "idle", message: "", at: null };

// ---------- Where the engine reads and writes ----------

function readJsonKey(key, emptyValue) {
  const text = localStorage.getItem(key);
  if (text === null) { return emptyValue; }
  return JSON.parse(text);          // damaged text throws: nothing then overwrites it
}

function syncEnv() {
  return {
    cloud: cloud,
    userId: syncUser ? syncUser.id : null,
    loadRecipes: loadRecipes,
    saveRecipes: function (list) {
      engineWriting = true;
      try { return storeRecipes(list); } finally { engineWriting = false; }
    },
    loadTrash: function () {
      try { const t = readJsonKey(TRASH_KEY, []); return Array.isArray(t) ? t.filter(function (x) { return x && x.recipe && x.recipe.id; }) : []; }
      catch (error) { throw { kind: "damaged" }; }
    },
    saveTrash: function (list) { localStorage.setItem(TRASH_KEY, JSON.stringify(list)); },
    loadState: function () {
      try { return readJsonKey(SYNC_KEY, null); } catch (error) { return null; }
    },
    saveState: function (state) { localStorage.setItem(SYNC_KEY, JSON.stringify(state)); },
    now: function () { return new Date().toISOString(); },
    today: todayAsText,
    newId: makeId
  };
}

// ---------- The status pill ----------

function changesWord(n) { return n === 1 ? "1 change" : n + " changes"; }

function safePending() {
  try { return pendingCount(syncEnv()); } catch (error) { return 0; }
}

function safeConflicts() {
  try { return conflictList(syncEnv()); } catch (error) { return []; }
}

function showPill(text, kind) {
  syncPill.textContent = text;
  syncPill.className = "sync-pill" + (kind ? " " + kind : "");
  syncPill.hidden = false;
}

function updateSyncStatus() {
  if (!syncUser) {
    syncPill.hidden = true;
    return;
  }
  const waiting = safePending();
  const conflicts = safeConflicts().length;
  if (syncRunning) {
    showPill("Saving…", "");
  } else if (syncStatus.kind === "offline") {
    showPill(waiting > 0 ? "Offline · " + changesWord(waiting) + " kept here" : "Offline", "warn");
  } else if (syncStatus.kind === "error") {
    showPill("Couldn’t sync · Retry", "warn");
  } else if (conflicts > 0) {
    showPill("Needs your choice", "warn");
  } else if (waiting > 0) {
    showPill(changesWord(waiting) + " waiting", "");
  } else {
    showPill("✓ Saved", "ok");
  }
  updateAccountLine(waiting, conflicts);
}

function updateAccountLine(waiting, conflicts) {
  let text;
  if (syncRunning) { text = "Syncing…"; }
  else if (syncStatus.kind === "offline") { text = "No connection. " + (waiting > 0 ? changesWord(waiting) + " kept on this phone and sent when you’re back online." : "Nothing is waiting."); }
  else if (syncStatus.kind === "error") { text = "Couldn’t sync: " + syncStatus.message; }
  else if (conflicts > 0) { text = conflicts + (conflicts === 1 ? " recipe needs" : " recipes need") + " your choice (see the Cookbook screen)."; }
  else if (syncStatus.at) { text = "All synced at " + syncStatus.at + "."; }
  else { text = "Not synced yet."; }
  accountSyncLine.textContent = text;
}

syncPill.addEventListener("click", function () {
  if (syncStatus.kind === "idle" && safeConflicts().length > 0) {
    showScreen(homeScreen);
    return;
  }
  runSync();
});

// ---------- When to sync ----------

function timeText() {
  return new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function scheduleSync(delay) {
  if (!syncUser) { return; }
  clearTimeout(syncTimer);
  syncTimer = setTimeout(runSync, delay === undefined ? 1500 : delay);
  updateSyncStatus();
}

// app.js calls this after every save of the recipe list.
function recipesChanged() {
  if (engineWriting) { return; }
  scheduleSync();
}

async function runSync() {
  if (!syncUser) { return; }
  if (syncRunning) { syncWanted = true; return; }
  if (document.body.dataset.screen === "recipe-form-screen") {
    scheduleSync(5000);              // don't change recipes under the form someone is typing in
    return;
  }
  clearTimeout(syncTimer);
  clearTimeout(retryTimer);
  syncRunning = true;
  updateSyncStatus();
  let result;
  try {
    result = await syncNow(syncEnv());
  } catch (error) {
    result = { ok: false, kind: "error", message: "Something went wrong." };
  }
  syncRunning = false;
  if (result.ok) {
    syncStatus = { kind: "idle", message: "", at: timeText() };
    retryDelay = 30000;
    if (result.pulled > 0 || result.pushed > 0) { refreshHome(); }
  } else {
    syncStatus = { kind: result.kind === "offline" ? "offline" : "error", message: result.message || "", at: null };
    retryTimer = setTimeout(runSync, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 300000);
  }
  renderConflicts();
  renderTrash();
  updateSyncStatus();
  if (syncWanted) {
    syncWanted = false;
    scheduleSync(500);
  }
}

window.addEventListener("online", function () { retryDelay = 30000; scheduleSync(500); });
window.addEventListener("offline", function () { syncStatus = { kind: "offline", message: "", at: null }; updateSyncStatus(); });
document.addEventListener("visibilitychange", function () {
  if (document.visibilityState === "visible" && syncUser) { scheduleSync(500); }
});

// ---------- Sign in / out ----------

function showAccountMessage(text) {
  accountMessage.textContent = text;
  accountMessage.hidden = !text;
}

function showSignedIn(user) {
  syncUser = user;
  signinForm.hidden = !!user;
  signedInBox.hidden = !user;
  accountName.textContent = user ? (user.email || "your account") : "";
  syncStatus = { kind: "idle", message: "", at: null };
  updateSyncStatus();
  renderConflicts();
  renderTrash();
}

async function signInOrUp(creating) {
  const email = accountEmail.value.trim().toLowerCase();
  const password = accountPassword.value;
  if (!email || !password) { showAccountMessage("Please type your email and password."); return; }
  if (creating && password.length < 8) { showAccountMessage("Please use a password of at least 8 characters."); return; }
  showAccountMessage(creating ? "Creating your account…" : "Signing in…");
  const result = creating ? await cloud.signUp(email, password) : await cloud.signIn(email, password);
  if (!result.ok) { showAccountMessage(result.message); return; }
  accountPassword.value = "";
  showAccountMessage("✓ " + (creating ? "Account created. You’re signed in." : "Signed in."));
  showSignedIn(result.user);
  scheduleSync(300);
}

signinForm.addEventListener("submit", function (event) {
  event.preventDefault();
  signInOrUp(false);
});
document.getElementById("signup-button").addEventListener("click", function () { signInOrUp(true); });
document.getElementById("sync-now-button").addEventListener("click", function () { retryDelay = 30000; runSync(); });
document.getElementById("signout-button").addEventListener("click", async function () {
  const waiting = safePending();
  const warning = waiting > 0
    ? changesWord(waiting) + " haven’t been sent yet. They stay on this phone and are sent the next time you sign in.\n\nSign out anyway?"
    : "Sign out?\n\nYour recipes stay on this phone.";
  if (!window.confirm(warning)) { return; }
  clearTimeout(syncTimer);
  clearTimeout(retryTimer);
  await cloud.signOut();
  showSignedIn(null);
  showAccountMessage("Signed out. Your recipes are still on this phone.");
});

// ---------- "Changed on two devices" ----------

function renderConflicts() {
  const items = syncUser ? safeConflicts() : [];
  conflictListBox.innerHTML = "";
  conflictCard.hidden = items.length === 0;
  items.forEach(function (item) {
    const box = document.createElement("div");
    box.className = "conflict-item";
    const title = document.createElement("h3");
    title.textContent = item.title;
    box.append(title);
    const intro = document.createElement("p");
    intro.className = "hint";
    intro.textContent = "Changed differently here and on your other device:";
    box.append(intro);
    item.lines.forEach(function (line) {
      const part = document.createElement("p");
      part.className = "conflict-part";
      const name = document.createElement("strong");
      name.textContent = partLabel(line.name);
      const here = document.createElement("span");
      here.textContent = "This device: " + line.here;
      const there = document.createElement("span");
      there.textContent = "Other device: " + line.there;
      part.append(name, here, there);
      box.append(part);
    });
    [["mine", "Keep this device’s", "button button-secondary"],
     ["theirs", "Use the other one", "button button-secondary"],
     ["both", "Keep both (make a copy)", "button button-secondary"]].forEach(function (choice) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = choice[2];
      button.textContent = choice[1];
      button.addEventListener("click", function () {
        const result = resolveConflict(syncEnv(), item.id, choice[0]);
        if (!result.ok) { showHomeMessage(result.problem); }
        refreshHome();
        renderConflicts();
        scheduleSync(300);
      });
      box.append(button);
    });
    conflictListBox.append(box);
  });
}

function partLabel(name) {
  const labels = { title: "Title", ingredients: "Ingredients", steps: "Steps", servings: "Servings", timeMinutes: "Time", tags: "Tags", notes: "Notes", source: "Source", original: "Original" };
  return labels[name] || name;
}

// ---------- "Recently deleted" ----------

function renderTrash() {
  let trash = [];
  try { trash = syncEnv().loadTrash(); } catch (error) { trash = []; }
  trashListBox.innerHTML = "";
  trashCard.hidden = trash.length === 0;
  trash.slice().sort(function (a, b) { return a.deletedAt < b.deletedAt ? 1 : -1; }).forEach(function (entry) {
    const age = Math.max(0, Math.floor((Date.now() - new Date(entry.deletedAt).getTime()) / 86400000));
    const left = Math.max(0, TRASH_DAYS - age);
    const li = document.createElement("li");
    const info = document.createElement("span");
    info.className = "trash-info";
    const title = document.createElement("span");
    title.className = "trash-title";
    title.textContent = entry.recipe.current.title;
    const when = document.createElement("span");
    when.className = "trash-when";
    when.textContent = (age === 0 ? "Deleted today" : age === 1 ? "Deleted yesterday" : "Deleted " + age + " days ago") + " · " + left + (left === 1 ? " day left" : " days left");
    info.append(title, when);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button button-secondary";
    button.textContent = "Restore";
    button.addEventListener("click", function () {
      const result = restoreFromTrash(syncEnv(), entry.recipe.id);
      if (!result.ok) { showAccountMessage(result.problem); return; }
      refreshHome();
      renderTrash();
      showAccountMessage("✓ Restored “" + entry.recipe.current.title + "”. You’ll find it in your cookbook.");
      scheduleSync();
    });
    li.append(info, button);
    trashListBox.append(li);
  });
}

// ---------- Delete (called from app.js) ----------

// Delete = move to "Recently deleted". Returns { ok } or { ok: false, problem }.
function deleteRecipeToTrash(id) {
  const result = moveToTrash(syncEnv(), id);
  if (result.ok) {
    renderTrash();
    scheduleSync();
  }
  return result;
}

// ---------- Start-up ----------

renderTrash();
cloud.currentUser().then(function (user) {
  if (user) {
    showSignedIn(user);
    scheduleSync(300);
  }
});
cloud.onAuthChange(function (event, user) {
  setTimeout(function () {
    if (event === "SIGNED_OUT" && syncUser) {
      showSignedIn(null);
      showAccountMessage("You’ve been signed out. Please sign in again.");
    }
  }, 0);
});
