// js/cookbook-views.js (Version 24): the three ways to look at your recipes on the home screen:
// Cover Flow, Grid and List, plus the tag filter row and the covers themselves.
//
// This is the first piece split out of app.js. It is loaded BEFORE app.js, so it only
// defines things here. app.js calls renderCookbookViews(...) and uses viewTag, and this
// file in turn uses a few helpers that live in app.js (knownTags, describeRecipe,
// makeRecipeButton, showRecipe, renderRecipeList). Those are only called later, when
// the page is running, so the order works out.
//
// Safety rule as everywhere: recipe text goes on the page with textContent only.

// ---------- Remembered choices (kept on the phone, not in the backup) ----------
const VIEW_SETTINGS_KEY = "cookbook.view"; // { mode: "flow" | "grid" | "list", tag: "" }

let viewMode = "flow"; // which of the three views is showing
let viewTag = "";      // "" = all recipes, otherwise only recipes with this tag

(function loadViewSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(VIEW_SETTINGS_KEY));
    if (saved && ["flow", "grid", "list"].indexOf(saved.mode) !== -1) {
      viewMode = saved.mode;
    }
    if (saved && typeof saved.tag === "string") {
      viewTag = saved.tag;
    }
  } catch (problem) {
    // Storage blocked or damaged: just use the defaults.
  }
})();

function saveViewSettings() {
  try {
    localStorage.setItem(VIEW_SETTINGS_KEY, JSON.stringify({ mode: viewMode, tag: viewTag }));
  } catch (problem) {
    // Not being able to remember the view is fine.
  }
}

// ---------- Tag colours ----------
// Each tag has one colour index 0-9 (the colours are --tagc-0 … --tagc-9 in style.css,
// with a Dark Mode version). Starter tags have fixed ones; your own tags get one of the
// last four, worked out from the tag's letters, so a tag always keeps the same colour.
const STARTER_TAG_COLORS = { breakfast: 0, lunch: 1, dinner: 2, dessert: 3, quick: 4, vegetarian: 5 };

function tagColorIndex(tag) {
  if (Object.prototype.hasOwnProperty.call(STARTER_TAG_COLORS, tag)) {
    return STARTER_TAG_COLORS[tag];
  }
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = (hash * 31 + tag.charCodeAt(i)) % 1000;
  }
  return 6 + (hash % 4);
}

function tagColor(tag) {
  return "var(--tagc-" + tagColorIndex(tag) + ")";
}

// ---------- Covers ----------
function makeIcon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "icon");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", "#icon-" + name);
  svg.append(use);
  return svg;
}

// A "book cover" drawn from the recipe: coloured by its first tag, with the tag
// in small capitals, the title, and a little kitchen icon. (Photos come in Phase 6.)
function makeCover(recipe) {
  const tags = recipe.current.tags;
  const cover = document.createElement("div");
  cover.className = "cover";
  cover.style.setProperty("--cover", tags.length > 0 ? tagColor(tags[0]) : "var(--cover-plain)");

  const inner = document.createElement("div");
  inner.className = "cover-inner";
  const tag = document.createElement("span");
  tag.className = "cover-tag";
  tag.textContent = tags.length > 0 ? tags[0] : "";
  const title = document.createElement("span");
  title.className = "cover-title";
  title.textContent = recipe.current.title;
  inner.append(tag, title, makeIcon("cook"));
  cover.append(inner);
  return cover;
}

// ---------- The tag filter row ----------
const tagFilter = document.getElementById("tag-filter");

// "All · 12" then one button per tag used on at least one recipe.
function renderTagFilter(recipes) {
  const used = knownTags().filter(function (tag) {
    return recipes.some(function (r) { return r.current.tags.indexOf(tag) !== -1; });
  });
  if (viewTag !== "" && used.indexOf(viewTag) === -1) {
    viewTag = ""; // nobody uses that tag any more
    saveViewSettings();
  }
  tagFilter.innerHTML = "";
  tagFilter.hidden = used.length === 0;

  const makeButton = function (tag, label) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "filter-chip";
    button.setAttribute("aria-pressed", String(tag === viewTag));
    if (tag !== "") {
      const dot = document.createElement("span");
      dot.className = "filter-dot";
      dot.style.background = tagColor(tag);
      button.append(dot);
    }
    button.append(label);
    button.addEventListener("click", function () {
      viewTag = tag;
      saveViewSettings();
      pickCard.hidden = true; // an old pick may not match the new filter
      renderRecipeList();
    });
    return button;
  };

  tagFilter.append(makeButton("", "All · " + recipes.length));
  used.forEach(function (tag) {
    tagFilter.append(makeButton(tag, tag));
  });
}

// ---------- The switch: Cover Flow / Grid / List ----------
const viewControls = document.getElementById("view-controls");
const flowView = document.getElementById("flow-view");
const gridView = document.getElementById("grid-view");
// (the List view is app.js's #recipe-list)

function showViewMode() {
  viewControls.querySelectorAll("[data-view]").forEach(function (button) {
    button.setAttribute("aria-pressed", String(button.dataset.view === viewMode));
  });
}

viewControls.addEventListener("click", function (event) {
  const button = event.target.closest("[data-view]");
  if (!button) {
    return;
  }
  viewMode = button.dataset.view;
  saveViewSettings();
  showViewMode();
  renderRecipeList();
});

// ---------- Cover Flow ----------
const flowTrack = document.getElementById("flow-track");
const flowPrev = document.getElementById("flow-prev");
const flowNext = document.getElementById("flow-next");
const flowTitle = document.getElementById("flow-title");
const flowMeta = document.getElementById("flow-meta");
const flowTags = document.getElementById("flow-tags");
const flowRange = document.getElementById("flow-range");
const flowPos = document.getElementById("flow-pos");
const flowTotal = document.getElementById("flow-total");

let flowRecipes = [];      // the recipes in the row, in order
let flowCurrentId = null;  // the recipe in the middle (kept when the row is rebuilt)
let flowFrame = 0;         // pending animation frame, so we work once per frame
let flowDragging = false;  // true while your finger is on the slider
let flowShownId = null;    // the recipe the caption is showing (so it only redraws when this changes)

// "Reduce Motion" in the iPhone's settings: no tilting or sliding, just a plain row.
function reduceMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function flowItemWidth() {
  const first = flowTrack.firstElementChild;
  return first ? first.offsetWidth : 0;
}

function flowCurrentIndex() {
  const width = flowItemWidth();
  if (width === 0) {
    return 0;
  }
  const index = Math.round(flowTrack.scrollLeft / width);
  return Math.max(0, Math.min(flowRecipes.length - 1, index));
}

// Jump (or glide) so the recipe at "index" is in the middle.
function flowGoTo(index, smooth) {
  const width = flowItemWidth();
  const clamped = Math.max(0, Math.min(flowRecipes.length - 1, index));
  flowTrack.scrollTo({
    left: clamped * width,
    behavior: smooth && !reduceMotion() ? "smooth" : "auto"
  });
}

// Tilt, shrink and overlap each cover by how far it is from the middle.
function flowTilt() {
  const width = flowItemWidth();
  if (width === 0) {
    return;
  }
  const middle = flowTrack.scrollLeft;
  const calm = reduceMotion();
  // The tilt is put on the cover INSIDE each item, not on the item itself: the item's box
  // stays where it is, so the row's "snap to the middle" keeps landing in the right place.
  Array.prototype.forEach.call(flowTrack.children, function (item, i) {
    const cover = item.firstElementChild;
    const d = i - middle / width;            // 0 = in the middle, ±1 = next door
    const near = Math.max(-1, Math.min(1, d));
    if (calm) {
      cover.style.transform = "";
      item.style.zIndex = "";
      cover.style.opacity = Math.abs(d) < 0.5 ? "1" : "0.8";
      return;
    }
    // Like the edges of a book's pages: the cover in the middle stands full size, its two
    // neighbours tilt away beside it, and all the rest are squeezed close together behind
    // them, so moving fast looks like riffling through pages.
    const far = Math.abs(d);
    const sign = d < 0 ? -1 : 1;
    const place = sign * (Math.min(far, 1) * 0.55 + Math.max(far - 1, 0) * 0.16) * width;
    const shift = place - d * width;         // how far to move it from where it naturally sits
    const tilt = -near * 62;
    const scale = 1 - Math.min(far, 1) * 0.18;
    cover.style.transform = "perspective(900px) translateX(" + shift.toFixed(1) + "px) rotateY(" + tilt.toFixed(1) + "deg) scale(" + scale.toFixed(3) + ")";
    item.style.zIndex = String(Math.max(1, 1000 - Math.round(far * 10)));
    cover.style.opacity = "";
  });
}

// Show the caption, counter and arrows for whichever recipe is in the middle.
function flowShowCurrent() {
  const index = flowCurrentIndex();
  const recipe = flowRecipes[index];
  if (!recipe) {
    return;
  }
  flowPos.textContent = (index + 1) + " of " + flowRecipes.length;
  flowTotal.textContent = String(flowRecipes.length);
  flowPrev.disabled = index === 0;
  flowNext.disabled = index === flowRecipes.length - 1;
  if (recipe.id === flowShownId) {
    return; // the caption is already right; don't redraw it on every frame
  }
  flowShownId = recipe.id;
  flowCurrentId = recipe.id;
  flowTitle.textContent = recipe.current.title;
  flowMeta.textContent = describeRecipe(recipe, false);
  flowTags.innerHTML = "";
  recipe.current.tags.forEach(function (tag) {
    const pill = document.createElement("span");
    pill.className = "flow-tag";
    pill.textContent = tag;
    flowTags.append(pill);
  });
  Array.prototype.forEach.call(flowTrack.children, function (item, i) {
    item.setAttribute("aria-current", i === index ? "true" : "false");
  });
}

// The slider follows the covers smoothly (a fraction of a recipe, not whole steps).
function flowShowSlider() {
  const width = flowItemWidth();
  if (width === 0 || flowDragging) {
    return;
  }
  flowRange.value = String(flowTrack.scrollLeft / width);
}

flowTrack.addEventListener("scroll", function () {
  if (flowFrame) {
    return;
  }
  flowFrame = requestAnimationFrame(function () {
    flowFrame = 0;
    flowTilt();
    flowShowSlider();
    flowShowCurrent();
  });
});

flowPrev.addEventListener("click", function () { flowGoTo(flowCurrentIndex() - 1, true); });
flowNext.addEventListener("click", function () { flowGoTo(flowCurrentIndex() + 1, true); });
// Dragging the slider moves the covers continuously. While your finger is down, the row's
// "snap to a recipe" is switched off (it would fight the slider); when you let go, the
// covers glide to the nearest recipe.
function flowDragStart() {
  flowDragging = true;
  flowTrack.classList.add("dragging");
}
function flowDragEnd() {
  if (!flowDragging) {
    return;
  }
  flowDragging = false;
  const width = flowItemWidth();
  const nearest = Math.round(Number(flowRange.value));
  flowTrack.classList.remove("dragging");
  flowGoTo(nearest, true);
  flowRange.value = String(Math.max(0, Math.min(flowRecipes.length - 1, nearest)));
}
flowRange.addEventListener("pointerdown", flowDragStart);
flowRange.addEventListener("touchstart", flowDragStart, { passive: true });
flowRange.addEventListener("keydown", function () { flowDragging = false; });
["pointerup", "pointercancel", "touchend", "touchcancel", "change"].forEach(function (name) {
  flowRange.addEventListener(name, flowDragEnd);
});
flowRange.addEventListener("input", function () {
  const width = flowItemWidth();
  if (!flowDragging && !flowTrack.classList.contains("dragging")) {
    // Keyboard or a tap on the bar: no drag started, so just go there.
    flowGoTo(Math.round(Number(flowRange.value)), false);
    return;
  }
  flowTrack.scrollLeft = Number(flowRange.value) * width;
});
// Keyboard (and iPad keyboards): arrow keys move along.
flowTrack.addEventListener("keydown", function (event) {
  if (event.key === "ArrowLeft") {
    flowGoTo(flowCurrentIndex() - 1, true);
    event.preventDefault();
  } else if (event.key === "ArrowRight") {
    flowGoTo(flowCurrentIndex() + 1, true);
    event.preventDefault();
  }
});
window.addEventListener("resize", function () {
  if (!flowView.hidden) {
    flowRestore();
  }
});

// Put the row back on the remembered recipe and redraw it. Also called when the
// home screen comes back (a hidden screen forgets how far it was scrolled).
function flowRestore() {
  if (flowView.hidden || flowRecipes.length === 0) {
    return;
  }
  let index = flowRecipes.findIndex(function (r) { return r.id === flowCurrentId; });
  if (index === -1) {
    index = 0;
  }
  flowGoTo(index, false);
  flowTilt();
  flowShowSlider();
  flowShowCurrent();
}

function renderFlow(recipes) {
  flowRecipes = recipes;
  flowTrack.innerHTML = "";
  flowRange.max = String(Math.max(0, recipes.length - 1));
  flowRange.disabled = recipes.length < 2;
  flowShownId = null; // the row was rebuilt, so redraw the caption
  recipes.forEach(function (recipe) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "flow-item";
    item.setAttribute("aria-label", recipe.current.title);
    item.append(makeCover(recipe));
    item.addEventListener("click", function () {
      const index = flowRecipes.indexOf(recipe);
      if (index === flowCurrentIndex()) {
        showRecipe(recipe.id);        // the one in the middle: open it
      } else {
        flowGoTo(index, true);        // a neighbour: bring it to the middle
      }
    });
    flowTrack.append(item);
  });
}

// ---------- Grid ----------
function renderGrid(recipes) {
  gridView.innerHTML = "";
  recipes.forEach(function (recipe) {
    const cell = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "grid-item";
    button.append(makeCover(recipe));
    const title = document.createElement("span");
    title.className = "grid-title";
    title.textContent = recipe.current.title;
    button.append(title);
    const details = describeRecipe(recipe, false);
    if (details) {
      const meta = document.createElement("span");
      meta.className = "grid-meta";
      meta.textContent = details;
      button.append(meta);
    }
    button.addEventListener("click", function () { showRecipe(recipe.id); });
    cell.append(button);
    gridView.append(cell);
  });
}

// ---------- Draw the chosen view ----------
// "recipes" = the recipes to show (already searched, filtered and sorted A–Z).
// "allRecipes" = everything saved (for the filter row and the switch).
function renderCookbookViews(recipes, allRecipes, list) {
  renderTagFilter(allRecipes);
  viewControls.hidden = allRecipes.length === 0;
  showViewMode();

  flowView.hidden = viewMode !== "flow" || recipes.length === 0;
  gridView.hidden = viewMode !== "grid" || recipes.length === 0;
  list.hidden = viewMode !== "list" || recipes.length === 0;

  // Only draw the view you can see (the others are drawn when you switch to them).
  if (viewMode === "flow") {
    renderFlow(recipes);
    flowRestore();
  } else if (viewMode === "grid") {
    renderGrid(recipes);
  } else {
    recipes.forEach(function (recipe) {
      const row = document.createElement("li");
      row.append(makeRecipeButton(recipe));
      list.append(row);
    });
  }
}
