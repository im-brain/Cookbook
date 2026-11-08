// ======================================================================
// Sign-in and the cloud connection (redesign Phase 4). Plain script, loaded after vendor/supabase.js.
//
// This is the ONLY file that talks to Supabase. js/sync.js uses it through the `cloud` object.
// The address and the "publishable" key below are meant to be public (Supabase designs them to sit in
// web pages); what keeps recipes private is the sign-in plus the privacy rules in supabase/schema.sql.
// The secret "service" key must NEVER be put in this file.
//
// Phase 5: this points at the REAL project. (Phase 4 used a separate test project with made-up recipes.)
// ======================================================================

const SUPABASE_URL = "https://aaiidfelgcbsmbrydoal.supabase.co";
const SUPABASE_KEY = "sb_publishable_1mDjU3llsX8ZsahRuaN75w_O8h6cgDN";

let supabaseClient = null;

function getClient() {
  if (!supabaseClient && window.supabase) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,              // sign-in is by email + password, never by a link
        storageKey: "cookbook.auth2"      // new name: the Phase 4 test sign-in belongs to the old project
      }
    });
  }
  return supabaseClient;
}

// Is this error "the phone can't reach the internet" (as opposed to "the server said no")?
function looksOffline(error) {
  if (!error) { return false; }
  if (typeof navigator !== "undefined" && navigator.onLine === false) { return true; }
  const text = String(error.message || error);
  return /failed to fetch|load failed|network|offline|timed out|timeout/i.test(text) ||
    (error.status === 0) || (error.name === "AuthRetryableFetchError");
}

// Turn any error into something the sync engine understands.
function cloudError(error) {
  if (looksOffline(error)) { return { offline: true, message: "No connection" }; }
  return { kind: "error", message: friendlyMessage(error) };
}

function friendlyMessage(error) {
  const text = String((error && error.message) || error || "");
  const code = error && (error.code || error.status);
  if (/invalid login credentials/i.test(text)) { return "That email and password don't match."; }
  if (/already registered|already been registered/i.test(text)) { return "That email already has an account. Tap Sign in."; }
  if (/signups? (not allowed|are disabled)|signup is disabled/i.test(text)) { return "New accounts are switched off. Sign in with your existing account."; }
  if (/password should be at least|weak password/i.test(text)) { return "That password is too short. Use at least 8 characters."; }
  if (/valid email|invalid format|unable to validate email/i.test(text)) { return "That doesn't look like an email address."; }
  if (/rate limit|too many/i.test(text)) { return "Too many tries. Please wait a minute and try again."; }
  if (code === 401 || code === "PGRST301" || /jwt/i.test(text)) { return "Please sign in again."; }
  if (code === "42P01" || /relation .* does not exist|schema cache/i.test(text)) { return "The cloud tables aren't set up yet."; }
  if (code === 503 || code === 502 || code === 504 || /paused|unavailable|upstream/i.test(text)) { return "The cloud is not answering right now (it may be paused)."; }
  return text ? text : "Something went wrong.";
}

const PAGE_SIZE = 500;

const cloud = {
  // ----- sign-in -----
  async currentUser() {
    const client = getClient();
    if (!client) { return null; }
    try {
      const result = await client.auth.getSession();
      return result.data && result.data.session ? result.data.session.user : null;
    } catch (error) {
      return null;
    }
  },

  async signIn(email, password) {
    const client = getClient();
    if (!client) { return { ok: false, message: "The sign-in library didn't load. Please close and reopen the app." }; }
    try {
      const result = await client.auth.signInWithPassword({ email: email, password: password });
      if (result.error) { return { ok: false, message: looksOffline(result.error) ? "No connection. Please try again when you're online." : friendlyMessage(result.error) }; }
      return { ok: true, user: result.data.user };
    } catch (error) {
      return { ok: false, message: looksOffline(error) ? "No connection. Please try again when you're online." : friendlyMessage(error) };
    }
  },

  async signUp(email, password) {
    const client = getClient();
    if (!client) { return { ok: false, message: "The sign-in library didn't load. Please close and reopen the app." }; }
    try {
      const result = await client.auth.signUp({ email: email, password: password });
      if (result.error) { return { ok: false, message: looksOffline(result.error) ? "No connection. Please try again when you're online." : friendlyMessage(result.error) }; }
      if (!result.data.session) {
        return { ok: false, message: "Account created, but it needs email confirmation first. Check your email, then tap Sign in." };
      }
      return { ok: true, user: result.data.user };
    } catch (error) {
      return { ok: false, message: looksOffline(error) ? "No connection. Please try again when you're online." : friendlyMessage(error) };
    }
  },

  async signOut() {
    const client = getClient();
    if (!client) { return; }
    try { await client.auth.signOut(); } catch (error) { /* signing out locally is enough */ }
  },

  onAuthChange(callback) {
    const client = getClient();
    if (client) { client.auth.onAuthStateChange(function (event, session) { callback(event, session ? session.user : null); }); }
  },

  // ----- recipes -----
  // Every row changed since `since` (a time the server gave us earlier; null = everything).
  async pullChanges(since) {
    const client = getClient();
    if (!client) { throw cloudError("no library"); }
    const rows = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      let query = client.from("recipes").select("*").order("modified_at", { ascending: true }).order("id", { ascending: true });
      if (since) { query = query.gte("modified_at", since); }
      const result = await query.range(from, from + PAGE_SIZE - 1);
      if (result.error) { throw cloudError(result.error); }
      rows.push.apply(rows, result.data);
      if (result.data.length < PAGE_SIZE) { break; }
    }
    return rows;
  },

  async fetchRow(id) {
    const client = getClient();
    const result = await client.from("recipes").select("*").eq("id", id).maybeSingle();
    if (result.error) { throw cloudError(result.error); }
    return result.data;
  },

  // A brand-new recipe. { ok: false } if the cloud already has that id.
  async insertRow(row) {
    const client = getClient();
    const result = await client.from("recipes").insert(row);
    if (result.error) {
      if (result.error.code === "23505") { return { ok: false }; }       // already there
      throw cloudError(result.error);
    }
    return { ok: true };
  },

  // A change based on `baseVersion`. Accepted only if the cloud is still at that version.
  async updateRow(id, baseVersion, row) {
    const client = getClient();
    const patch = Object.assign({}, row);
    delete patch.id;
    const result = await client.from("recipes").update(patch).eq("id", id).eq("version", baseVersion).select("version");
    if (result.error) { throw cloudError(result.error); }
    return { ok: result.data.length === 1 };
  },

  // Remove a recipe that has been in "Recently deleted" for 30 days (the rules only allow removing deleted ones).
  async purgeRow(id) {
    const client = getClient();
    const result = await client.from("recipes").delete().eq("id", id).not("deleted_at", "is", null);
    if (result.error) { throw cloudError(result.error); }
  }
};
