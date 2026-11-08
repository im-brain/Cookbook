// Checks for the photo parts of js/photos.js and js/sync.js. Run: node tests/photos.test.js
const sync = require("../js/sync.js");
const photos = require("../js/photos.js");
let passed = 0, failed = 0;
function check(name, ok, extra) { if (ok) { passed++; } else { failed++; console.log("FAIL:", name, extra || ""); } }

function recipe(photo) {
  const r = { id: "r1", kind: "mine", source: "", current: { title: "Soup", ingredients: [], steps: [], servings: null, timeMinutes: null, tags: [] }, original: null, notes: "", createdAt: "2026-11-01", updatedAt: "2026-11-01" };
  if (photo) { r.photo = photo; }
  return r;
}

// ----- the note on a recipe -----
check("clean note keeps id/w/h", JSON.stringify(sync.cleanPhotoNote({ id: "abc123", w: 800.4, h: 600, extra: 1 })) === '{"id":"abc123","w":800,"h":600}');
check("bad note is dropped", sync.cleanPhotoNote({ id: "../x" }) === null && sync.cleanPhotoNote(null) === null && sync.cleanPhotoNote({ id: 5 }) === null);
check("no photo => no field (old fingerprints stay the same)", !("photo" in sync.canonicalRecipe(recipe(null), "2026-11-01")));
const withPhoto = sync.canonicalRecipe(recipe({ id: "abc123", w: 10, h: 20 }), "2026-11-01");
check("photo is the last field", Object.keys(withPhoto).pop() === "photo");
check("row carries the note", sync.toRow(withPhoto, 1, null).photo.id === "abc123" && sync.toRow(recipe(null), 1, null).photo === null);
check("row round trip", sync.fromRow(sync.toRow(withPhoto, 1, null), "x").photo.id === "abc123");
check("row without photo round trip", !("photo" in sync.fromRow(sync.toRow(recipe(null), 1, null), "x")));

// ----- combining two copies -----
const base = recipe(null), a = recipe({ id: "aaaaaa", w: 1, h: 1 }), b = recipe({ id: "bbbbbb", w: 1, h: 1 });
let m = sync.mergeRecipes(base, a, base);
check("photo added here only: kept", m.conflicts.length === 0 && m.merged.photo.id === "aaaaaa");
m = sync.mergeRecipes(base, base, a);
check("photo added there only: taken", m.conflicts.length === 0 && m.merged.photo.id === "aaaaaa");
m = sync.mergeRecipes(a, base, a);
check("photo removed here only: stays removed", m.conflicts.length === 0 && !("photo" in m.merged));
m = sync.mergeRecipes(a, a, base);
check("photo removed there only: removed", m.conflicts.length === 0 && !("photo" in m.merged));
m = sync.mergeRecipes(base, a, b);
check("different photos on both: a choice", m.conflicts.join() === "photo");
check("describe photo", sync.describePart(a, "photo") === "a photo" && sync.describePart(base, "photo") === "no photo");

// ----- syncing the pictures -----
function makeStore(initial) {
  const m = Object.assign({}, initial || {});
  return { m: m, get: async (id) => m[id] || null, put: async (id, b) => { m[id] = b; }, delete: async (id) => { delete m[id]; }, keys: async () => Object.keys(m) };
}
function makeCloud() {
  const files = {};
  return { files: files, offline: false,
    uploadPhoto: async (id, b) => { if (this.offline) { throw { offline: true }; } files[id] = b; },
    downloadPhoto: async (id) => files[id] || null,
    removePhoto: async (id) => { delete files[id]; } };
}
function envFor(store, cloud, refs, state, synced) {
  return { store, cloud, referenced: () => refs, allSynced: () => synced !== false,
    loadState: () => state.v, saveState: (s) => { state.v = JSON.parse(JSON.stringify(s)); } };
}
(async function () {
  // Phone A has a new picture; the cloud is empty.
  const cloud = makeCloud();
  const A = makeStore({ p1: "PIC1" }), stateA = {};
  let r = await photos.syncPhotos(envFor(A, cloud, { p1: true }, stateA));
  check("uploads the new picture", cloud.files.p1 === "PIC1" && r.uploaded === 1 && stateA.v.uploaded.p1 === true);
  r = await photos.syncPhotos(envFor(A, cloud, { p1: true }, stateA));
  check("second round does nothing", r.uploaded === 0 && r.downloaded === 0);

  // Phone B knows the note but not the picture.
  const B = makeStore(), stateB = {};
  r = await photos.syncPhotos(envFor(B, cloud, { p1: true }, stateB));
  check("downloads what's missing", B.m.p1 === "PIC1" && r.downloaded === 1);

  // A picture that's not in the cloud yet is simply waited for.
  r = await photos.syncPhotos(envFor(B, cloud, { p1: true, p9: true }, stateB));
  check("missing picture is skipped, no error", r.downloaded === 0 && !B.m.p9);

  // The recipe changes photo: the old one leaves the cloud only when everything is in step.
  A.m.p2 = "PIC2";
  await photos.syncPhotos(envFor(A, cloud, { p2: true }, stateA, false));
  check("old picture kept while changes are waiting", cloud.files.p1 === "PIC1" && cloud.files.p2 === "PIC2");
  await photos.syncPhotos(envFor(A, cloud, { p2: true }, stateA, true));
  check("old picture removed once in step", !cloud.files.p1 && cloud.files.p2 === "PIC2" && !stateA.v.uploaded.p1);

  // Local tidy-up.
  const removed = await photos.removeUnusedLocalPhotos(A, { p2: true });
  check("unused local picture removed", removed === 1 && !A.m.p1 && A.m.p2 === "PIC2");

  console.log(passed + " passed, " + failed + " failed");
  process.exit(failed ? 1 : 0);
})();
