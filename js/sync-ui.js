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
    newId: makeId,
    photos: function () { return syncPhotos(photoEnv()); }      // Phase 6: pictures follow the recipes
  };
}

// ---------- The meal plan (Version 32, Phase 7 Part B) ----------
// The plan sync engine is js/plan-sync.js. writePlan (js/plan-ui.js) saves without starting another sync.
function planSyncEnv() {
  return {
    cloud: cloud,
    userId: syncUser ? syncUser.id : null,
    loadPlan: loadPlan,
    savePlan: writePlan,
    loadState: function () {
      try { return readJsonKey(PLAN_SYNC_KEY, null); } catch (error) { return null; }
    },
    saveState: function (state) { localStorage.setItem(PLAN_SYNC_KEY, JSON.stringify(state)); },
    now: function () { return new Date().toISOString(); }
  };
}

// js/plan-ui.js calls this after every change the person makes to the plan.
function planChanged() {
  scheduleSync();
}

// ---------- Photos (Phase 6) ----------

// Every photo any recipe, any "Recently deleted" recipe, or any open choice still uses.
function referencedPhotoIds() {
  const ids = {};
  const all = readAll(syncEnv());
  function note(recipe) { if (recipe && recipe.photo && recipe.photo.id) { ids[recipe.photo.id] = true; } }
  all.recipes.forEach(note);
  all.trash.forEach(function (t) { note(t.recipe); });
  Object.keys(all.state.conflicts).forEach(function (id) { note(all.state.conflicts[id].remote); });
  return ids;
}

function loadPhotoState() {
  try { return JSON.parse(localStorage.getItem(PHOTO_STATE_KEY)); } catch (error) { return null; }
}

function photoEnv() {
  return {
    store: photoStore,
    cloud: cloud,
    referenced: referencedPhotoIds,
    allSynced: function () {
      const all = readAll(syncEnv());
      return pendingIds(all).length === 0 && Object.keys(all.state.conflicts).length === 0;
    },
    loadState: loadPhotoState,
    saveState: function (state) { localStorage.setItem(PHOTO_STATE_KEY, JSON.stringify(state)); }
  };
}

// Settings: how many photos this phone holds and how many still wait to go up.
async function updatePhotoLine() {
  const line = document.getElementById("photo-line");
  if (!line) { return; }
  try {
    const refs = referencedPhotoIds();
    const keys = await photoStore.keys();
    let bytes = 0;
    for (const id of keys) {
      const blob = await photoStore.get(id);
      if (blob) { bytes += blob.size; }
    }
    const saved = loadPhotoState();
    const uploaded = saved && saved.uploaded ? saved.uploaded : {};
    const waiting = keys.filter(function (id) { return refs[id] && !uploaded[id]; }).length;
    const megabytes = (bytes / 1048576).toFixed(1);
    let text = keys.length === 0 ? "No photos yet." : keys.length + (keys.length === 1 ? " photo" : " photos") + " on this phone (" + megabytes + " MB).";
    if (waiting > 0 && syncUser && syncEnabled()) { text += " " + waiting + " waiting to go to the cloud."; }
    line.textContent = text;
  } catch (error) {
    line.textContent = "Photos can't be stored on this phone right now.";
  }
}

// ---------- The status pill ----------

function changesWord(n) { return n === 1 ? "1 change" : n + " changes"; }

function safePending() {
  let count = 0;
  try { count += pendingCount(syncEnv()); } catch (error) { /* counts as none */ }
  try { count += planPendingCount(planSyncEnv()); } catch (error) { /* counts as none */ }   // Version 32: planned dinners too
  return count;
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
  if (!syncUser || !syncEnabled()) {
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
  else if (!syncEnabled()) { text = "Syncing starts after you finish “Move my recipes to the cloud” below."; }
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
  if (!syncUser || !syncEnabled()) { return; }
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
  if (!syncUser || !syncEnabled()) { return; }
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
    if (result.ok) {                                  // Version 32: then the meal plan (a plan problem never stops recipes)
      const planResult = await syncPlan(planSyncEnv());
      if (planResult.ok) { result.planPulled = planResult.pulled; } else { result = planResult; }
    }
  } catch (error) {
    result = { ok: false, kind: "error", message: "Something went wrong." };
  }
  syncRunning = false;
  if (result.ok) {
    syncStatus = { kind: "idle", message: "", at: timeText() };
    retryDelay = 30000;
    if (result.pulled > 0 || result.pushed > 0 || result.photos > 0) { refreshHome(); }
    // A phone or iPad changed the plan: show it, unless a sheet is open (it would change under the person's finger).
    if (result.planPulled > 0 && !planScreen.hidden && !isAnySheetOpen()) { renderPlan(); }
    if (document.body.dataset.screen !== "recipe-form-screen") {      // (a photo picked in the open form isn't saved yet)
      removeUnusedLocalPhotos(photoStore, referencedPhotoIds()).catch(function () { /* tidying is optional */ });
    }
  } else {
    syncStatus = { kind: result.kind === "offline" ? "offline" : "error", message: result.message || "", at: null };
    retryTimer = setTimeout(runSync, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 300000);
  }
  renderConflicts();
  renderTrash();
  updateSyncStatus();
  updatePhotoLine();
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
  renderMove();
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

// ---------- Move my recipes to the cloud (Phase 5) ----------
// Syncing stays OFF until step 6 ("Finish") is tapped, so nothing reaches the cloud by surprise.
// Steps 1-3 only look. Step 4 is the only one that uploads, and only when tapped.

const MOVE_KEY = "cookbook.move";            // never rename: { userId, uploaded, verified, done, doneAt }
const moveCard = document.getElementById("move-card");
const moveSteps = document.getElementById("move-steps");
const moveMessage = document.getElementById("move-message");
const moveIntro = document.getElementById("move-intro");

let movePreview = null;        // the answer of step 2 (kept in memory only)
let moveLookedAt = false;      // step 3 confirmed
let moveBusy = false;
let moveDrawn = "";            // what is drawn now, so we only redraw when something changed

function moveState() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(MOVE_KEY)); } catch (error) { saved = null; }
  if (!saved || typeof saved !== "object" || !syncUser || saved.userId !== syncUser.id) {
    return { uploaded: false, verified: false, done: false };
  }
  return saved;
}

function saveMove(change) {
  const next = Object.assign(moveState(), change, { userId: syncUser ? syncUser.id : null });
  try { localStorage.setItem(MOVE_KEY, JSON.stringify(next)); } catch (error) { /* shown by the next step */ }
}

function syncEnabled() { return moveState().done === true; }

function showMoveMessage(text) {
  moveMessage.textContent = text;
  moveMessage.hidden = !text;
}

function backupIsCurrent() {
  const recipes = loadRecipes();
  if (recipes === null) { return false; }
  if (recipes.length === 0) { return true; }
  const last = loadLastBackup();
  return !!last && countChangesSinceBackup(recipes, last) === 0;
}

function testTaggedTitles() {
  const recipes = loadRecipes() || [];
  return recipes.filter(function (r) { return r.current && r.current.tags && r.current.tags.indexOf("sync-test") !== -1; })
    .map(function (r) { return r.current.title; });
}

function stepButton(label, enabled, onTap, secondary) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "button" + (secondary ? " button-secondary" : "");
  b.textContent = label;
  b.disabled = !enabled || moveBusy;
  b.addEventListener("click", onTap);
  return b;
}

function renderMove() {
  if (!syncUser) { moveCard.hidden = true; return; }
  moveCard.hidden = false;
  const state = moveState();
  const recipes = loadRecipes();
  const signature = JSON.stringify([state, backupIsCurrent(), !!movePreview, moveLookedAt, moveBusy, recipes ? recipes.length : -1]);
  if (signature === moveDrawn) { return; }
  moveDrawn = signature;
  moveSteps.innerHTML = "";

  if (state.done) {
    moveIntro.textContent = "✓ Your recipes are in the cloud and syncing is on. The copy on this phone stays too.";
    showMoveMessage("");
    return;
  }
  moveIntro.textContent = "Six small steps. Your recipes stay on this phone the whole time; this only adds a safe copy in the cloud. Nothing is uploaded until step 4.";

  const backed = backupIsCurrent();
  const steps = [
    { title: "Back up your recipes", done: backed,
      text: backed ? "✓ Backed up. If anything ever goes wrong, you can import this file." : "Save a backup file to iCloud Drive first. This step stays open until the backup is up to date.",
      button: backed ? null : stepButton("Export a backup file", true, function () { document.getElementById("export-button").click(); }) },
    { title: "Check", done: !!movePreview,
      text: movePreview ? "✓ Your recipes can be read, you’re signed in, and the cloud answers." : "Checks that your saved recipes are readable and that the cloud answers. Nothing is sent.",
      button: movePreview ? null : stepButton("Run the check", backed, runMoveCheck) },
    { title: "Preview", done: moveLookedAt,
      text: movePreview ? movePreviewText() : "Shows what would be uploaded.",
      extra: movePreview && !moveLookedAt ? movePreviewList() : null,
      button: movePreview && !moveLookedAt ? stepButton("Looks right", true, function () { moveLookedAt = true; renderMove(); }) : null },
    { title: "Upload", done: state.uploaded,
      text: state.uploaded ? "✓ Uploaded." : "Sends a copy of your recipes to the cloud. Anything already in the cloud is combined with what’s here; nothing is overwritten or deleted.",
      button: !state.uploaded ? stepButton("Upload my recipes", moveLookedAt, runMoveUpload) : null },
    { title: "Verify", done: state.verified,
      text: state.verified ? "✓ Checked: every recipe in the cloud matches this phone." : "Downloads everything again and compares it with this phone, recipe by recipe.",
      button: state.uploaded && !state.verified ? stepButton("Verify", true, runMoveVerify) : null },
    { title: "Finish", done: false,
      text: "Turns syncing on. From now on changes are sent automatically. The copy on this phone is kept.",
      button: state.verified ? stepButton("Finish and turn syncing on", true, runMoveFinish) : null }
  ];
  let activeFound = false;
  steps.forEach(function (step, i) {
    const li = document.createElement("li");
    li.className = "move-step" + (step.done ? " done" : (!activeFound ? " active" : " waiting"));
    if (!step.done) { activeFound = true; }
    const head = document.createElement("strong");
    head.textContent = (i + 1) + ". " + step.title;
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = step.text;
    li.append(head, p);
    if (step.extra) { li.append(step.extra); }
    if (step.button && li.classList.contains("active")) { li.append(step.button); }
    moveSteps.append(li);
  });
}

function movePreviewText() {
  const p = movePreview;
  if (moveLookedAt) { return "✓ Looked over: " + p.toUpload + " to upload."; }
  let text = "On this phone: " + recipesWord(p.onPhone) + (p.inTrash ? " (+ " + p.inTrash + " in Recently deleted)" : "") + ". In the cloud now: " + p.inCloud + ". Will be uploaded: " + p.toUpload + ".";
  if (p.cloudOnly > 0) { text += " " + recipesWord(p.cloudOnly) + " found only in the cloud will be added to this phone."; }
  const tests = testTaggedTitles();
  if (tests.length > 0) { text += " Note: " + tests.length + " tagged “sync-test” (" + tests.join(", ") + ") would upload too. Delete them first if they’re just tests."; }
  return text;
}

function movePreviewList() {
  const ul = document.createElement("ul");
  ul.className = "move-titles";
  movePreview.titles.forEach(function (title) {
    const li = document.createElement("li");
    li.textContent = title;
    ul.append(li);
  });
  return ul;
}

async function withMoveBusy(work) {
  moveBusy = true;
  showMoveMessage("");
  renderMove();
  try { await work(); } finally { moveBusy = false; renderMove(); }
}

function failureText(result) {
  if (result.kind === "offline") { return "No connection. Please try again when you’re online."; }
  return result.message || "Something went wrong.";
}

function runMoveCheck() {
  return withMoveBusy(async function () {
    if (loadRecipes() === null) { showMoveMessage("Your saved recipes couldn’t be read, so the move can’t start. Please tell Claude."); return; }
    showMoveMessage("Checking…");
    const result = await previewMove(syncEnv());
    if (!result.ok) { showMoveMessage("The check didn’t pass: " + failureText(result)); return; }
    movePreview = result;
    moveLookedAt = false;
    showMoveMessage("");
  });
}

function runMoveUpload() {
  if (!backupIsCurrent()) { showMoveMessage("Recipes changed since your backup. Please back up again first."); renderMove(); return Promise.resolve(); }
  const n = movePreview ? movePreview.toUpload : 0;
  if (!window.confirm("Upload " + recipesWord(n) + " to your private cloud now?\n\nNothing on this phone is deleted.")) { return Promise.resolve(); }
  return withMoveBusy(async function () {
    showMoveMessage("Uploading…");
    const result = await syncNow(syncEnv());
    if (!result.ok) { showMoveMessage("The upload stopped: " + failureText(result) + " Nothing was lost; tap Upload again to continue."); return; }
    saveMove({ uploaded: true, verified: false });
    if (result.pulled > 0) { refreshHome(); }
    showMoveMessage("✓ Uploaded " + result.pushed + ". Next, verify.");
  });
}

function runMoveVerify() {
  return withMoveBusy(async function () {
    showMoveMessage("Verifying…");
    const result = await verifyMove(syncEnv());
    if (result.kind) { showMoveMessage("Couldn’t verify: " + failureText(result)); return; }
    if (!result.ok) {
      const parts = [];
      if (result.missing.length) { parts.push("missing in the cloud: " + result.missing.join(", ")); }
      if (result.different.length) { parts.push("different: " + result.different.join(", ")); }
      if (result.waiting) { parts.push(changesWord(result.waiting) + " still waiting"); }
      if (result.conflicts) { parts.push(result.conflicts + " need your choice on the Cookbook screen"); }
      saveMove({ uploaded: false, verified: false });
      showMoveMessage("Not finished: " + parts.join("; ") + ". Tap Upload again, then Verify.");
      return;
    }
    saveMove({ verified: true });
    showMoveMessage("✓ All " + result.total + " match.");
  });
}

function runMoveFinish() {
  if (!window.confirm("Turn syncing on?\n\nFrom now on, changes are sent to the cloud automatically.")) { return Promise.resolve(); }
  saveMove({ done: true, doneAt: new Date().toISOString() });
  showMoveMessage("");
  moveDrawn = "";
  renderMove();
  updateSyncStatus();
  scheduleSync(300);
  return Promise.resolve();
}

// A backup made in Settings changes step 1; look again when the person comes back to the app.
setInterval(function () { if (!moveCard.hidden && !document.hidden) { renderMove(); } }, 1500);

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
  const labels = { title: "Title", ingredients: "Ingredients", steps: "Steps", servings: "Servings", timeMinutes: "Time", tags: "Tags", notes: "Notes", source: "Source", original: "Original", photo: "Photo" };
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
// Photos picked and then cancelled (or replaced) leave a picture behind on the phone; tidy those up once.
try { removeUnusedLocalPhotos(photoStore, referencedPhotoIds()).catch(function () { /* optional */ }); } catch (error) { /* damaged data: leave everything */ }
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
