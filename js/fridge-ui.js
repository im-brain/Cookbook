// ======================================================================
// "What's in my fridge?" screen part (Version 37). The matching is in js/fridge.js.
// Loaded after app.js and js/shopping-ui.js. Nothing here is saved: the box is forgotten on restart.
// ======================================================================

const fridgeCard = document.getElementById("fridge-card");
const fridgeInput = document.getElementById("fridge-input");
const fridgeResults = document.getElementById("fridge-results");
const fridgeMessage = document.getElementById("fridge-message");

function renderFridge() {
  if (fridgeCard.hidden) { return; }
  fridgeResults.innerHTML = "";
  fridgeMessage.hidden = true;

  const items = parseFridgeText(fridgeInput.value);
  if (items.length === 0) { return; }

  const recipes = loadRecipes();
  if (recipes === null) {
    fridgeMessage.textContent = "Sorry, your saved recipes couldn't be read.";
    fridgeMessage.hidden = false;
    return;
  }
  const shopping = loadShopping();   // null if damaged: we only read, so that is fine
  const pantry = shopping ? shopping.pantry : [];
  const ranked = rankByFridge(recipes, items, pantry);

  if (ranked.length === 0) {
    fridgeMessage.textContent = "No saved recipe uses what you typed yet. Try a simpler word, like “chicken” instead of “chicken breast”.";
    fridgeMessage.hidden = false;
    return;
  }

  ranked.slice(0, 20).forEach(function (result) {
    const block = document.createElement("div");
    block.className = "fridge-result";

    const box = document.createElement("div");
    box.className = "pick-result";
    box.append(makeRecipeButton(result.recipe));
    block.append(box);

    const status = document.createElement("p");
    status.className = "fridge-status";
    if (result.missing.length === 0) {
      status.classList.add("complete");
      status.textContent = "You have everything (" + result.have.length + " of " + result.total + ")";
    } else {
      status.textContent = "You have " + result.have.length + " of " + result.total + ". Missing: " + result.missing.join(", ");
    }
    block.append(status);
    fridgeResults.append(block);
  });

  if (ranked.length > 20) {
    fridgeMessage.textContent = "Showing the best 20 of " + ranked.length + " recipes.";
    fridgeMessage.hidden = false;
  }
}

document.getElementById("fridge-button").addEventListener("click", function () {
  homeMessage.hidden = true;
  pickCard.hidden = true;
  fridgeCard.hidden = false;
  renderFridge();
  fridgeInput.focus();
});
fridgeInput.addEventListener("input", renderFridge);
document.getElementById("fridge-close").addEventListener("click", function () {
  fridgeCard.hidden = true;
});
// Opening the dice closes the fridge box, so only one box is open.
document.getElementById("pick-button").addEventListener("click", function () {
  fridgeCard.hidden = true;
});
