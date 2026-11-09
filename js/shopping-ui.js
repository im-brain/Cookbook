// js/shopping-ui.js: the Shopping screen (Version 34, Phase 8 Part A).
// Plain script, loaded AFTER app.js (it uses app.js helpers) and after js/plan-ui.js (the meal plan) and
// js/shopping.js (the sums). Recipe text goes on the page with textContent only, never innerHTML.

// ---------- Saving the shopping choices on the phone ----------
// loadShopping() returns { weeks, pantry, aisles }, or null if the saved data is damaged. If it is null, never write.
function loadShopping() {
  let raw = null;
  try { raw = localStorage.getItem(SHOPPING_KEY); } catch (error) { return null; }
  if (raw === null) { return cleanShopping(null); }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) { return null; }
    return cleanShopping(parsed);
  } catch (error) {
    return null;
  }
}

// Saves quietly (the sync engine uses this one).
function storeShopping(shopping) {
  try {
    localStorage.setItem(SHOPPING_KEY, JSON.stringify({ weeks: shopping.weeks, pantry: shopping.pantry, aisles: shopping.aisles }));
    return true;
  } catch (error) {
    return false;
  }
}

// Saves what the person did, then lets the sync know (Version 36).
function writeShopping(shopping) {
  const saved = storeShopping(shopping);
  if (saved && typeof shoppingChanged === "function") { shoppingChanged(); }
  return saved;
}

// ---------- What's on screen ----------
let shopViewStart = null;
let shopShownView = null;   // what is on screen, for Send / Copy (Version 38)   // the Monday of the week being shown

const shopList = document.getElementById("shop-list");
const shopMessage = document.getElementById("shop-message");
const shopDamaged = document.getElementById("shop-damaged");
const shopEmpty = document.getElementById("shop-empty");
const shopChanges = document.getElementById("shop-changes");

function showShopMessage(text) {
  shopMessage.textContent = text;
  shopMessage.hidden = !text;
}

function openShopScreen() {
  shopViewStart = weekStartOf(localDateText());   // always starts on the current week
  showShopMessage("");
  renderShop();
}

function shopEl(tag, className, text) {
  const node = document.createElement(tag);
  if (className) { node.className = className; }
  if (text !== undefined) { node.textContent = text; }
  return node;
}

function renderShop() {
  const thisStart = weekStartOf(localDateText());
  const nextStart = addDays(thisStart, 7);
  document.getElementById("shop-this-week").setAttribute("aria-pressed", String(shopViewStart === thisStart));
  document.getElementById("shop-next-week").setAttribute("aria-pressed", String(shopViewStart === nextStart));
  document.getElementById("shop-week-label").textContent = weekLabel(shopViewStart);

  shopList.innerHTML = "";
  shopEmpty.hidden = true;
  shopChanges.hidden = true;

  const shopping = loadShopping();
  const plan = typeof loadPlan === "function" ? loadPlan() : null;
  const damaged = shopping === null || plan === null;
  shopDamaged.hidden = !damaged;
  document.getElementById("shop-add-form").hidden = damaged;
  document.getElementById("shop-send").hidden = damaged;
  if (damaged) { document.getElementById("shop-progress").textContent = ""; return; }

  const built = buildShoppingList(plan, loadRecipes() || [], shopViewStart);
  const view = shoppingView(shopping, built, shopViewStart);
  if (view.changed) { writeShopping(withWeek(shopping, shopViewStart, view.week)); }

  shopShownView = view;
  document.getElementById("shop-progress").textContent = view.total === 0 ? "Nothing to buy yet" : view.ticked + " of " + view.total + " ticked";

  const moreCount = view.look.concat(allAisleItems(view)).filter(function (it) { return it.moreWas; }).length;
  if (view.newCount > 0 || moreCount > 0) {
    const bits = [];
    if (view.newCount > 0) { bits.push(view.newCount + (view.newCount === 1 ? " new item" : " new items")); }
    if (moreCount > 0) { bits.push(moreCount + (moreCount === 1 ? " item that needs more" : " items that need more")); }
    document.getElementById("shop-changes-text").textContent = "Your plan changed since you last looked: " + bits.join(" and ") + ".";
    shopChanges.hidden = false;
  }

  if (built.deletedRecipes > 0) {
    shopList.append(shopEl("p", "hint", built.deletedRecipes + (built.deletedRecipes === 1 ? " planned recipe was deleted, so it isn't" : " planned recipes were deleted, so they aren't") + " on this list."));
  }

  if (view.look.length > 0) { shopList.append(makeSection("Needs a look", view.look, "look")); }
  if (view.extras.length > 0) { shopList.append(makeExtrasSection(view.extras)); }
  AISLES.forEach(function (aisle) {
    if (view.aisles[aisle]) { shopList.append(makeSection(aisle, view.aisles[aisle], "")); }
  });

  if (view.leftOff.length > 0) { shopList.append(makeLeftOff(view.leftOff)); }
  if (view.gone.length > 0) { shopList.append(makeGone(view.gone)); }

  if (view.total === 0 && view.gone.length === 0 && view.leftOff.length === 0) {
    shopEmpty.textContent = built.plannedRecipes === 0
      ? "No dinners are planned for this week yet. Plan some in the This Week tab and their ingredients will show up here."
      : "Nothing to buy: the planned recipes have no ingredients.";
    shopEmpty.hidden = false;
  }
}

function allAisleItems(view) {
  return Object.keys(view.aisles).reduce(function (list, a) { return list.concat(view.aisles[a]); }, []);
}

function makeSection(title, items, mode) {
  const section = shopEl("section", "shop-section");
  section.append(shopEl("h2", "", title));
  const ul = shopEl("ul", "shop-items");
  items.forEach(function (it) { ul.append(makeItemRow(it, mode)); });
  section.append(ul);
  return section;
}

function makeItemRow(it, mode) {
  const li = shopEl("li", "shop-item" + (it.ticked ? " done" : ""));
  const check = shopEl("button", "shop-check");
  check.type = "button";
  check.setAttribute("aria-pressed", String(it.ticked));
  const text = shopEl("span", "shop-text");
  const top = shopEl("span", "shop-top");
  top.append(shopEl("span", "shop-name", it.name));
  top.append(shopEl("span", "shop-from", it.from.join(", ")));
  const amount = it.amount || (it.written ? "as written" : "");
  if (amount) { top.append(shopEl("span", "shop-amount", amount)); }
  text.append(top);
  if (it.isNew) { text.append(shopEl("span", "shop-badge new", "New")); }
  if (it.moreWas) { text.append(shopEl("span", "shop-badge more", "More needed · was " + it.moreWas + " when ticked")); }
  if (mode === "look" && it.look) { text.append(shopEl("span", "shop-sub", it.look)); }
  check.append(text);
  check.addEventListener("click", function () {
    const shopping = loadShopping();
    if (shopping === null) { return; }
    writeShopping(tickItem(shopping, shopViewStart, it, !it.ticked));
    renderShop();
  });
  const more = shopEl("button", "icon-button shop-more", "•••");
  more.type = "button";
  more.setAttribute("aria-label", "More about " + it.name);
  more.addEventListener("click", function () { openShopSheet(it); });
  li.append(check, more);
  return li;
}

function makeExtrasSection(extras) {
  const section = shopEl("section", "shop-section");
  section.append(shopEl("h2", "", "Your extras"));
  const ul = shopEl("ul", "shop-items");
  extras.forEach(function (x) {
    const li = shopEl("li", "shop-item" + (x.ticked ? " done" : ""));
    const check = shopEl("button", "shop-check");
    check.type = "button";
    check.setAttribute("aria-pressed", String(x.ticked));
    const text = shopEl("span", "shop-text");
    const top = shopEl("span", "shop-top");
    top.append(shopEl("span", "shop-name", x.text));
    text.append(top);
    check.append(text);
    check.addEventListener("click", function () {
      const shopping = loadShopping();
      if (shopping === null) { return; }
      writeShopping(tickExtra(shopping, shopViewStart, x.id, !x.ticked));
      renderShop();
    });
    const remove = shopEl("button", "icon-button shop-more", "×");
    remove.type = "button";
    remove.setAttribute("aria-label", "Remove " + x.text);
    remove.addEventListener("click", function () {
      const shopping = loadShopping();
      if (shopping === null) { return; }
      writeShopping(removeExtra(shopping, shopViewStart, x.id));
      renderShop();
    });
    li.append(check, remove);
    ul.append(li);
  });
  section.append(ul);
  return section;
}

// Things left off because they are in the pantry.
function makeLeftOff(rows) {
  const details = shopEl("details", "shop-section shop-fold");
  details.append(shopEl("summary", "", "Left off: you always have these (" + rows.length + ")"));
  const ul = shopEl("ul", "shop-items");
  rows.forEach(function (r) {
    const li = shopEl("li", "shop-item");
    const text = shopEl("span", "shop-text");
    const top = shopEl("span", "shop-top");
    top.append(shopEl("span", "shop-name", r.name));
    const amount = rowAmountText(r);
    if (amount) { top.append(shopEl("span", "shop-amount", amount)); }
    text.append(top);
    const back = shopEl("button", "button button-secondary shop-small", "Put back on the list");
    back.type = "button";
    back.addEventListener("click", function () {
      const shopping = loadShopping();
      if (shopping === null) { return; }
      writeShopping(setPantry(shopping, r.key, r.name, false));
      renderShop();
    });
    li.append(text, back);
    ul.append(li);
  });
  details.append(ul);
  return details;
}

// Things that were on the list but the plan no longer needs.
function makeGone(gone) {
  const details = shopEl("details", "shop-section shop-fold");
  details.append(shopEl("summary", "", "No longer needed (" + gone.length + ")"));
  const ul = shopEl("ul", "shop-items");
  gone.forEach(function (g) {
    const li = shopEl("li", "shop-item");
    const text = shopEl("span", "shop-text");
    text.append(shopEl("span", "shop-name", g.label));
    const remove = shopEl("button", "button button-secondary shop-small", "Remove");
    remove.type = "button";
    remove.addEventListener("click", function () {
      const shopping = loadShopping();
      if (shopping === null) { return; }
      writeShopping(forgetItem(shopping, shopViewStart, g.key));
      renderShop();
    });
    li.append(text, remove);
    ul.append(li);
  });
  details.append(ul);
  return details;
}

// ---------- Buttons on the screen ----------
function goShopWeek(start) {
  shopViewStart = start;
  showShopMessage("");
  renderShop();
}
document.getElementById("shop-this-week").addEventListener("click", function () { goShopWeek(weekStartOf(localDateText())); });
document.getElementById("shop-next-week").addEventListener("click", function () { goShopWeek(addDays(weekStartOf(localDateText()), 7)); });
document.getElementById("shop-prev").addEventListener("click", function () { goShopWeek(addDays(shopViewStart, -7)); });
document.getElementById("shop-next").addEventListener("click", function () { goShopWeek(addDays(shopViewStart, 7)); });

document.getElementById("shop-add-form").addEventListener("submit", function (event) {
  event.preventDefault();
  const input = document.getElementById("shop-add-text");
  const shopping = loadShopping();
  if (shopping === null || input.value.trim() === "") { return; }
  if (!writeShopping(addExtra(shopping, shopViewStart, input.value, makeId()))) {
    showShopMessage("Sorry, that couldn't be saved. The phone's storage may be full.");
    return;
  }
  input.value = "";
  showShopMessage("");
  renderShop();
});

document.getElementById("shop-gotit").addEventListener("click", function () {
  const shopping = loadShopping();
  const plan = loadPlan();
  if (shopping === null || plan === null) { return; }
  const built = buildShoppingList(plan, loadRecipes() || [], shopViewStart);
  writeShopping(markAllSeen(shopping, shopViewStart, shoppingView(shopping, built, shopViewStart)));
  renderShop();
});

// ---------- The ••• sheet for one item ----------
const shopSheet = document.getElementById("shop-sheet");
const shopSheetAisle = document.getElementById("shop-sheet-aisle");
let shopSheetItem = null;

shopSheet.addEventListener("click", function (event) { if (event.target === shopSheet) { closeBackdrop(shopSheet); } });
document.addEventListener("keydown", function (event) { if (event.key === "Escape") { closeBackdrop(shopSheet); } });
document.getElementById("shop-sheet-close").addEventListener("click", function () { closeBackdrop(shopSheet); });

function openShopSheet(it) {
  shopSheetItem = it;
  const shopping = loadShopping();
  if (shopping === null) { return; }
  document.getElementById("shop-sheet-title").textContent = it.name;
  document.getElementById("shop-sheet-sub").textContent = it.amount || "";
  shopSheetAisle.innerHTML = "";
  const auto = document.createElement("option");
  auto.value = "";
  auto.textContent = "Automatic (" + guessAisle(it.name) + ")";
  shopSheetAisle.append(auto);
  AISLES.forEach(function (aisle) {
    const option = document.createElement("option");
    option.value = aisle;
    option.textContent = aisle;
    shopSheetAisle.append(option);
  });
  shopSheetAisle.value = shopping.aisles[it.key] || "";
  openBackdrop(shopSheet);
}

shopSheetAisle.addEventListener("change", function () {
  const shopping = loadShopping();
  if (shopping === null || !shopSheetItem) { return; }
  writeShopping(setAisle(shopping, shopSheetItem.key, shopSheetAisle.value));
  closeBackdrop(shopSheet);
  renderShop();
});

document.getElementById("shop-sheet-pantry").addEventListener("click", function () {
  const shopping = loadShopping();
  if (shopping === null || !shopSheetItem) { return; }
  writeShopping(setPantry(shopping, shopSheetItem.key, shopSheetItem.name, true));
  closeBackdrop(shopSheet);
  renderShop();
});


// ---------- Send the list to another shopping app (Version 38) ----------
// Only unticked items go, one per line. Nothing is saved or ticked by sending.
function currentExport() {
  if (!shopShownView) { return { text: "", count: 0 }; }
  return shoppingExportText(shopShownView);
}

async function copyShoppingText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    return false;
  }
}

document.getElementById("shop-copy-button").addEventListener("click", async function () {
  const out = currentExport();
  if (out.count === 0) { showShopMessage("Nothing left to send: everything is ticked or the list is empty."); return; }
  const ok = await copyShoppingText(out.text);
  showShopMessage(ok ? "Copied " + out.count + (out.count === 1 ? " item." : " items.") + " Paste it into your shopping app."
                     : "Couldn't copy. Try the Send button instead.");
});

document.getElementById("shop-send-button").addEventListener("click", async function () {
  const out = currentExport();
  if (out.count === 0) { showShopMessage("Nothing left to send: everything is ticked or the list is empty."); return; }
  if (navigator.share) {
    try {
      await navigator.share({ text: out.text });
      return;
    } catch (error) {
      if (error && error.name === "AbortError") { return; }   // the person closed the Share menu
    }
  }
  const ok = await copyShoppingText(out.text);
  showShopMessage(ok ? "Sharing isn't available here, so the list (" + out.count + (out.count === 1 ? " item" : " items") + ") was copied instead. Paste it into your shopping app."
                     : "Couldn't send or copy the list.");
});
