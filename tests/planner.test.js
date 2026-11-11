// Checks for js/planner.js ("Plan for me"). Run: node tests/planner.test.js
// Every recipe here is made up. Nothing touches real recipes, plans or the cloud.
const ing = require("../js/ingredients.js");
const plan = require("../js/plan.js");
const shop = require("../js/shopping.js");
const ps = require("../js/plan-sync.js");
const p = require("../js/planner.js");
let passed = 0, failed = 0;
function check(name, ok, extra) { if (ok) { passed++; } else { failed++; console.log("FAIL:", name, extra === undefined ? "" : JSON.stringify(extra)); } }
function eq(name, got, want) { check(name, JSON.stringify(got) === JSON.stringify(want), { got: got, want: want }); }

function recipe(id, title, lines, servings, minutes, tags) {
  return { id: id, kind: "mine", source: "", notes: "", createdAt: "2026-11-01", updatedAt: "2026-11-01", original: null,
    current: { title: title, ingredients: ing.parseIngredients(lines), steps: ["Cook it."], servings: servings, timeMinutes: minutes, tags: tags || ["dinner"] } };
}

// A made-up cookbook.
const BOOK = [
  recipe("stew", "Chicken and Potato Stew", ["1.5 lb chicken thighs", "1 lb potatoes", "1 onion", "2 carrots", "4 cups chicken broth", "salt"], 4, 60),
  recipe("frittata", "Spinach Potato Frittata", ["6 eggs", "5 oz spinach", "2 potatoes", "1 onion", "1/2 cup grated cheese", "olive oil"], 4, 30, ["dinner", "quick"]),
  recipe("curry", "Chicken Spinach Curry", ["1 lb chicken breast", "5 oz spinach", "1 can (14 oz) coconut milk", "2 tbsp curry paste", "1 onion", "1 cup rice"], 4, 35),
  recipe("friedrice", "Egg Fried Rice", ["3 eggs", "2 cups rice", "2 tbsp soy sauce", "3 green onions", "1 cup frozen peas"], 4, 20, ["dinner", "quick"]),
  recipe("chili", "Beef Chili", ["1 lb ground beef", "1 can (14 oz) kidney beans", "1 can (14 oz) diced tomatoes", "1 onion", "2 tbsp chili powder"], 6, 50),
  recipe("pasta", "Tomato Basil Pasta", ["12 oz spaghetti", "1 can (14 oz) diced tomatoes", "3 cloves garlic", "1 bunch basil", "1/4 cup parmesan"], 4, 25),
  recipe("salmon", "Lemon Salmon with Potatoes", ["4 salmon fillets", "1 lb potatoes", "1 lemon", "2 tbsp butter"], 4, 30),
  recipe("tacos", "Black Bean Tacos", ["2 cans (14 oz) black beans", "8 tortillas", "1 avocado", "1 lime", "1 cup salsa"], 4, 20, ["dinner", "vegetarian"]),
  recipe("roast", "Roast Chicken with Potatoes", ["1 whole chicken", "2 lb potatoes", "1 lemon", "4 cloves garlic", "2 tbsp butter"], 6, 90),
  recipe("soup", "Lentil Soup", ["1.5 cups lentils", "2 carrots", "1 onion", "2 stalks celery", "6 cups vegetable broth"], 6, 45, ["dinner", "vegetarian"]),
  recipe("pancakes", "Fluffy Pancakes", ["2 cups flour", "2 eggs", "1.5 cups milk", "2 tbsp sugar"], 4, 20, ["breakfast"]),
  recipe("brownies", "Fudgy Brownies", ["1 cup butter", "2 cups sugar", "4 eggs", "1 cup cocoa"], 12, 45, ["dessert"]),
  recipe("omelet", "Spinach Omelet", ["3 eggs", "2 oz spinach", "1 tbsp butter"], 1, 10, ["dinner", "quick"]),
  recipe("mystery", "Grandma's Hotpot", ["chicken", "potatoes", "whatever is around"], null, null)
];
const snapshot = JSON.stringify(BOOK);

const WEEK = plan.weekDates("2026-11-09");            // Mon 9 to Sun 15 Nov 2026
const HAVE = ["Chicken", "Potatoes", "Spinach", "Eggs"];
function suggest(extra, book) {
  return p.plannerSuggest(book || BOOK, Object.assign({ dates: WEEK, dinners: 5, eaters: 4, leftovers: true, priority: "have", available: HAVE, pantry: [], usePantry: true }, extra || {}));
}
function cooks(r) { return r.slots.filter(function (s) { return s.kind === "cook"; }); }
function lefts(r) { return r.slots.filter(function (s) { return s.kind === "leftovers"; }); }
function ids(r) { return cooks(r).map(function (s) { return s.recipeId; }); }
function byWords(a, b) { return p.plannerMatches(require("../js/fridge.js").fridgeWords(a), require("../js/fridge.js").fridgeWords(b)); }

// ----- ingredient matching -----
check("chicken has chicken thighs", byWords("chicken", "boneless chicken thighs"));
check("plural: potatoes has potato", byWords("Potatoes", "potato"));
check("eggs has egg", byWords("eggs", "egg"));
check("chicken is not chicken broth", !byWords("chicken", "chicken broth"));
check("chicken broth is not chicken", !byWords("chicken broth", "chicken"));
check("egg is not egg noodles", !byWords("eggs", "egg noodles"));
check("potato is not potato starch", !byWords("potatoes", "potato starch"));
check("compound: potato is not sweet potato", !byWords("potatoes", "sweet potatoes"));
check("compound: butter is not peanut butter", !byWords("butter", "peanut butter"));
check("compound: milk is not coconut milk", !byWords("milk", "coconut milk"));
check("spinach has baby spinach", byWords("spinach", "baby spinach"));

// ----- classifying: have / pantry / buy -----
const ctx = p.plannerContext({ available: HAVE, pantry: ["butter"], usePantry: true });
eq("typed item is 'have'", p.plannerClassify("chicken thighs", ctx).status, "have");
eq("salt is a pantry basic", p.plannerClassify("salt", ctx).status, "pantry");
eq("olive oil is a pantry basic", p.plannerClassify("olive oil", ctx).status, "pantry");
eq("'I always have this' name is pantry", p.plannerClassify("unsalted butter", ctx).status, "pantry");
eq("not listed means buy", p.plannerClassify("coconut milk", ctx).status, "buy");
eq("broth of a listed thing is still buy", p.plannerClassify("chicken broth", ctx).status, "buy");
const noPantry = p.plannerContext({ available: HAVE, pantry: ["butter"], usePantry: false });
eq("pantry off: salt must be bought", p.plannerClassify("salt", noPantry).status, "buy");
eq("pantry off: butter must be bought", p.plannerClassify("butter", noPantry).status, "buy");
eq("pantry off: typed still counts", p.plannerClassify("eggs", noPantry).status, "have");
eq("the same thing typed twice is kept once", p.plannerContext({ available: ["eggs", "Egg", "egg"] }).typed.length, 1);

// ----- profiles -----
const stewP = p.plannerProfile(BOOK[0], ctx, 4);
eq("stew: two listed things", stewP.have.length, 2);
eq("stew: salt left out of buying", stewP.buy.map(function (b) { return b.name; }), ["onion", "carrots", "chicken broth"]);
check("stew can feed a second night", stewP.leftoverOk && stewP.keepsWell === 1);
check("an omelet for one can't be leftovers", !p.plannerProfile(BOOK[12], ctx, 4).leftoverOk);
check("no servings: can't be leftovers", !p.plannerProfile(BOOK[13], ctx, 4).leftoverOk);
check("breakfast isn't a dinner", !p.plannerProfile(BOOK[10], ctx, 4).dinnerOk);
check("dessert isn't a dinner", !p.plannerProfile(BOOK[11], ctx, 4).dinnerOk);
const optional = recipe("opt", "Optional Test", ["2 eggs", "1 cup cream (optional)"], 2, 10);
eq("optional ingredients are ignored", p.plannerProfile(optional, ctx, 2).buy.length, 0);
const unsure = recipe("uns", "Unsure Test", ["2 eggs", "1 cup or 120 g flour"], 2, 10);
eq("an unsure line is counted", p.plannerProfile(unsure, ctx, 2).unsure, 1);
check("a broken recipe gives no profile", p.plannerProfile({ id: "x" }, ctx, 4) === null && p.plannerProfile(null, ctx, 4) === null);

// ----- the default week: five dinners, four cooked and one leftovers -----
const week = suggest();
eq("five dinners", week.planned, 5);
eq("four cooking nights", cooks(week).length, 4);
eq("one leftovers night", lefts(week).length, 1);
check("no recipe twice", new Set(ids(week)).size === 4);
check("never a breakfast or dessert", ids(week).indexOf("pancakes") === -1 && ids(week).indexOf("brownies") === -1);
check("only saved recipes", ids(week).every(function (id) { return BOOK.some(function (r) { return r.id === id; }); }));
check("dinners are in date order on free days", week.slots.every(function (s, i) { return WEEK.indexOf(s.date) !== -1 && (i === 0 || week.slots[i - 1].date < s.date); }));
check("all four listed things get used", week.unused.length === 0, week.unused);
check("every dinner says why", week.slots.every(function (s) { return s.reasons.length > 0; }));
check("a reason names what you have", cooks(week).some(function (s) { return /^Uses your /.test(s.reasons[0]); }));
eq("same question, same answer", JSON.stringify(suggest().slots), JSON.stringify(week.slots));
eq("the recipes were not changed", JSON.stringify(BOOK), snapshot);

// ----- leftovers are tied to their dinner -----
const left = lefts(week)[0];
const source = cooks(week).find(function (s) { return s.recipeId === left.recipeId; });
check("the leftovers night names a cooked dinner", !!source);
eq("the link goes both ways", [left.sourceDate, source.leftoverDates], [source.date, [left.date]]);
const gap = (Date.parse(left.date) - Date.parse(source.date)) / 86400000;
check("leftovers are eaten 1 to 3 days later", gap >= 1 && gap <= 3, gap);
eq("the source is cooked for both nights", source.servings, 8);
check("other dinners are cooked for four", cooks(week).filter(function (s) { return s !== source; }).every(function (s) { return s.servings === 4; }));
check("the source is one that keeps", ["stew", "curry", "chili", "roast", "soup", "pasta", "salmon", "friedrice", "frittata"].indexOf(source.recipeId) !== -1 && source.recipeId !== "omelet");
check("the reason says so", source.reasons.some(function (r) { return /bigger batch/.test(r); }) && /^From /.test(left.reasons[0]));

const noLeft = suggest({ leftovers: false });
eq("leftovers off: five cooking nights", [cooks(noLeft).length, lefts(noLeft).length], [5, 0]);
const six = suggest({ dinners: 7 });
eq("seven dinners: two leftovers nights", [six.planned, lefts(six).length], [7, 2]);
const two = suggest({ dinners: 2 });
eq("two dinners: no leftovers night", [two.planned, lefts(two).length], [2, 0]);
const three = suggest({ eaters: 9 });
check("too big a batch is never promised", lefts(three).every(function (l) {
  const src = BOOK.find(function (r) { return r.id === l.recipeId; });
  return 18 / src.current.servings <= 3;
}));
const onlyBad = [BOOK[12], BOOK[13], recipe("s2", "Garden Salad", ["1 lettuce", "2 tomatoes"], 4, 10), recipe("t2", "Cheese Toast", ["4 slices bread", "1 cup cheese"], 4, 10)];
const bad = suggest({ dinners: 4 }, onlyBad);
eq("no honest source: no leftovers night", lefts(bad).length, 0);
check("and it says so", bad.notes.some(function (n) { return /No leftovers night/.test(n); }), bad.notes);

// ----- what you have steers the week -----
const beefWeek = suggest({ available: ["ground beef", "kidney beans", "salmon"], dinners: 3, leftovers: false });
check("having beef and salmon brings chili and salmon in", ids(beefWeek).indexOf("chili") !== -1 && ids(beefWeek).indexOf("salmon") !== -1, ids(beefWeek));
const nothing = suggest({ available: [] });
eq("nothing typed still gives a week", nothing.planned, 5);
check("unused things are named", suggest({ available: ["chicken", "dragonfruit"] }).unused.indexOf("dragonfruit") !== -1);

// ----- an ingredient isn't endless: the second use is worth much less -----
const env = { weights: { have: 3, buy: 1, share: 0.5, same: 1.5, time: 0.05 }, recent: {}, shown: {}, seed: 0 };
const pr = function (id) { return p.plannerProfile(BOOK.find(function (r) { return r.id === id; }), p.plannerContext({ available: HAVE }), 4); };
const one = p.plannerScore([pr("stew")], [], env).parts.have;
const twice = p.plannerScore([pr("stew"), pr("roast")], [], env).parts.have;
check("two chicken+potato dinners earn far less than double", twice < one * 2 * 0.8, [one, twice]);
check("the same kind of dinner twice is counted", p.plannerScore([pr("stew"), pr("roast")], [], env).parts.same === 1);

// ----- whole-week scoring: shared shopping and less shopping -----
const shareA = recipe("a", "Bean Bowl", ["1 can black beans", "1 lime", "1 avocado"], 4, 20);
const shareB = recipe("b", "Bean Wraps", ["1 can black beans", "1 lime", "1 avocado", "4 tortillas"], 4, 20);
const shareC = recipe("c", "Mushroom Barley", ["1 lb mushrooms", "1 cup barley", "1 leek", "1 cup cream"], 4, 20);
const cx0 = p.plannerContext({ available: [] });
const sAB = p.plannerScore([p.plannerProfile(shareA, cx0, 4), p.plannerProfile(shareB, cx0, 4)], [], env);
const sAC = p.plannerScore([p.plannerProfile(shareA, cx0, 4), p.plannerProfile(shareC, cx0, 4)], [], env);
eq("shared things are bought once", [sAB.parts.buy, sAB.parts.shared], [4, 3]);
eq("no overlap: everything is bought", [sAC.parts.buy, sAC.parts.shared], [7, 0]);
check("the overlapping pair scores higher", sAB.score > sAC.score);
const picked = p.plannerSuggest([shareA, shareB, shareC, recipe("d", "Leek Pie", ["2 leeks", "1 cup cream", "1 lb mushrooms", "1 pie crust"], 4, 20)],
  { dates: WEEK, dinners: 2, eaters: 4, leftovers: false, priority: "shopping", available: [] });
check("least shopping picks a pair that shares", JSON.stringify(ids(picked).sort()) === '["a","b"]', ids(picked));

// ----- priorities change the week -----
const quick = suggest({ priority: "quick", leftovers: false, dinners: 3, available: [] });
const totalTime = function (r) { return cooks(r).reduce(function (n, s) { return n + (s.time || 40); }, 0); };
check("quickest is no slower than the default", totalTime(quick) <= totalTime(suggest({ leftovers: false, dinners: 3, available: [] })));
check("quickest keeps to short recipes", cooks(quick).every(function (s) { return s.time <= 30; }), cooks(quick).map(function (s) { return s.time; }));
const variety = suggest({ priority: "variety", leftovers: false });
const groupsOf = function (r) { return ids(r).map(function (id) { return pr(id).group; }).filter(Boolean); };
check("most variety: no kind of dinner twice", new Set(groupsOf(variety)).size === groupsOf(variety).length, groupsOf(variety));

// ----- recently planned dinners are suggested less -----
const first = ids(suggest({ leftovers: false, dinners: 2 }));
const recent = {}; recent[first[0]] = 1;
check("a dinner planned last week steps back", ids(suggest({ leftovers: false, dinners: 2, recent: recent })).indexOf(first[0]) === -1);

// ----- too few recipes: it says so and doesn't invent any -----
const small = suggest({}, BOOK.slice(0, 2));
check("two recipes can't make five dinners", small.planned < 5 && small.planned >= 2, small.planned);
check("it explains the limit", small.notes.some(function (n) { return /Only \d of 5 dinners/.test(n); }), small.notes);
check("still only saved recipes", ids(small).every(function (id) { return id === "stew" || id === "frittata"; }));
check("short on recipes: leftovers fill in", lefts(small).length >= 1);
const empty = suggest({}, []);
eq("an empty cookbook suggests nothing", empty.planned, 0);
check("and says why", /no recipes yet/.test(empty.notes[0]));
const sweet = suggest({}, [BOOK[10], BOOK[11]]);
check("only breakfast and dessert: nothing, with a reason", sweet.planned === 0 && /looks like a dinner/.test(sweet.notes[0]));
check("damaged recipes are skipped, not crashed on", suggest({}, [null, { id: "z" }, { id: "y", current: {} }].concat(BOOK)).planned === 5);

// ----- free days -----
const fewDays = suggest({ dates: ["2026-11-13", "2026-11-14", "2026-11-15"] });
eq("three free days: three dinners", [fewDays.wanted, fewDays.planned], [3, 3]);
check("only free days are used", fewDays.slots.every(function (s) { return s.date >= "2026-11-13"; }));
const apart = suggest({ dates: ["2026-11-09", "2026-11-14"], dinners: 2 });
check("days too far apart: no leftovers night", lefts(apart).length === 0 && apart.planned === 2);
eq("no free days: nothing", suggest({ dates: [] }).planned, 0);

// ----- locking and suggesting again -----
const keep = cooks(week)[1];
const lockOne = [{ date: keep.date, kind: "cook", recipeId: keep.recipeId, servings: keep.servings }];
const again = suggest({ locked: lockOne, seed: 1, shown: Object.fromEntries(ids(week).filter(function (id) { return id !== keep.recipeId; }).map(function (id) { return [id, 1]; })) });
const kept = again.slots.find(function (s) { return s.date === keep.date; });
check("a locked dinner stays on its day", kept && kept.recipeId === keep.recipeId && kept.locked === true);
check("the others change", JSON.stringify(ids(again)) !== JSON.stringify(ids(week)), ids(again));
eq("still five dinners", again.planned, 5);
eq("the same seed gives the same week", JSON.stringify(suggest({ locked: lockOne, seed: 1 }).slots), JSON.stringify(suggest({ locked: lockOne, seed: 1 }).slots));
check("another seed can differ", [2, 3, 4, 5].some(function (seed) { return JSON.stringify(ids(suggest({ seed: seed }))) !== JSON.stringify(ids(week)); }));
const lockPair = [
  { date: source.date, kind: "cook", recipeId: source.recipeId, servings: source.servings },
  { date: left.date, kind: "leftovers", sourceDate: source.date }
];
const pair = suggest({ locked: lockPair, seed: 3 });
const pairLeft = pair.slots.find(function (s) { return s.date === left.date; });
check("a locked leftovers night stays with its dinner", pairLeft.kind === "leftovers" && pairLeft.recipeId === source.recipeId && pairLeft.sourceDate === source.date);
eq("no second leftovers night appears", lefts(pair).length, 1);
const allLocked = week.slots.map(function (s) { return s.kind === "cook" ? { date: s.date, kind: "cook", recipeId: s.recipeId, servings: s.servings } : { date: s.date, kind: "leftovers", sourceDate: s.sourceDate }; });
eq("everything locked: nothing changes", JSON.stringify(suggest({ locked: allLocked, seed: 9 }).slots.map(function (s) { return [s.date, s.kind, s.recipeId]; })),
  JSON.stringify(week.slots.map(function (s) { return [s.date, s.kind, s.recipeId]; })));
check("a lock on a deleted recipe is ignored", suggest({ locked: [{ date: WEEK[0], kind: "cook", recipeId: "gone" }] }).planned === 5);
const lockedServings = suggest({ locked: [{ date: keep.date, kind: "cook", recipeId: keep.recipeId, servings: 6 }] });
eq("locked servings are kept", lockedServings.slots.find(function (s) { return s.date === keep.date; }).servings, 6);
const forcedDessert = suggest({ locked: [{ date: WEEK[0], kind: "cook", recipeId: "brownies" }] });
check("a dinner you chose yourself is kept, even a dessert", forcedDessert.slots[0].recipeId === "brownies");

// ----- swapping one dinner -----
const swapDate = cooks(week)[0].date;
const alts = p.plannerAlternatives(BOOK, { available: HAVE, eaters: 4, priority: "have" }, week.slots, swapDate);
check("alternatives leave out the week's dinners", alts.every(function (a) { return ids(week).indexOf(a.recipeId) === -1; }));
eq("every other saved recipe is offered", alts.length, BOOK.length - 4);
check("dinners come before desserts", alts.findIndex(function (a) { return !a.suitable; }) > alts.findIndex(function (a) { return a.suitable; }) && !alts[0].suitable === false);
check("alternatives say what you have and what to buy", alts.every(function (a) { return Array.isArray(a.have) && Array.isArray(a.buy); }));

// ----- shopping impact uses the Shopping list's own sums -----
const opts = { available: HAVE, pantry: ["butter"], usePantry: true };
const slotsFixed = [
  { date: "2026-11-09", kind: "cook", recipeId: "stew", title: "Chicken and Potato Stew", servings: 8, baseServings: 4, leftoverDates: ["2026-11-11"] },
  { date: "2026-11-10", kind: "cook", recipeId: "frittata", title: "Spinach Potato Frittata", servings: 4, baseServings: 4, leftoverDates: [] },
  { date: "2026-11-11", kind: "leftovers", recipeId: "stew", title: "Chicken and Potato Stew", sourceDate: "2026-11-09", servings: null, leftoverDates: [] },
  { date: "2026-11-12", kind: "cook", recipeId: "curry", title: "Chicken Spinach Curry", servings: 4, baseServings: 4, leftoverDates: [] }
];
const impact = p.plannerShoppingImpact(BOOK, slotsFixed, opts);
const find = function (group, name) { return impact[group].find(function (i) { return i.name === name; }); };
eq("eggs: listed, one normal dinner", find("have", "eggs").amount, "6");
check("onion is bought once for three dinners, doubled in the stew", find("buy", "onion") && find("buy", "onion").amount === "4" && find("buy", "onion").from.length === 3, find("buy", "onion"));
eq("the bigger batch doubles the broth (8 cups)", find("buy", "chicken broth").amount, "8 cups");
check("spinach in two dinners: may need more, added up", find("more", "spinach") && find("more", "spinach").amount === "10 oz" && /2 dinners/.test(find("more", "spinach").why), impact.more);
check("potatoes in a bigger batch: may need more", !!impact.more.find(function (i) { return /potato/.test(i.name); }), impact.more);
check("a listed thing is never in 'buy'", !impact.buy.some(function (i) { return /chicken thigh|chicken breast|spinach|egg|potato/.test(i.name); }), impact.buy);
check("salt and oil are pantry staples", !!find("pantry", "salt") && !!find("pantry", "olive oil"));
check("the package size doesn't scale", find("buy", "coconut milk").amount === "1 can (14 oz)", find("buy", "coconut milk"));
const impactNoPantry = p.plannerShoppingImpact(BOOK, slotsFixed, { available: HAVE, usePantry: false });
check("pantry off: salt is on the buy list", impactNoPantry.pantry.length === 0 && !!impactNoPantry.buy.find(function (i) { return i.name === "salt"; }));
const rangeBook = [recipe("r", "Range Test", ["2-3 cloves garlic", "1 cup or 120 g flour", "1 cup stock", "200 ml stock"], 2, 10)];
const rangeImpact = p.plannerShoppingImpact(rangeBook, [{ date: "2026-11-09", kind: "cook", recipeId: "r", title: "Range Test", servings: 2, baseServings: 2, leftoverDates: [] }], { available: [] });
eq("a range uses its upper amount", rangeImpact.buy.find(function (i) { return i.name === "garlic"; }).amount, "3 cloves");
check("an unsure line needs a look", rangeImpact.look.length === 1 && rangeImpact.look[0].why === "Shown as written", rangeImpact.look);
check("cups and ml are added together", /cup/.test(rangeImpact.buy.find(function (i) { return i.name === "stock"; }).amount));
eq("no cooking nights: nothing to show", p.plannerShoppingImpact(BOOK, [], opts).dinners, 0);
check("the preview matches the real Shopping list", (function () {
  const entries = p.plannerEntries(slotsFixed, (function () { let n = 0; return function () { return "x" + (++n); }; })());
  const built = shop.buildShoppingList({ entries: entries }, BOOK, "2026-11-09");
  const all = impact.have.concat(impact.more, impact.buy, impact.pantry, impact.look);
  return built.items.length === all.length && built.items.every(function (row) {
    const it = all.find(function (i) { return i.name === row.name; });
    return it && it.amount === shop.rowAmountText(row);
  });
})());

// ----- saving: only into free days, by the planner's own rules -----
let n = 0;
const newId = function () { return "new" + (++n); };
const existing = plan.addEntry(plan.addEntry({ entries: [] }, "2026-11-10", { kind: "out", note: "Pizza with Sam" }, "old1"), "2026-11-10",
  { kind: "recipe", role: "side", recipeId: "soup", title: "Lentil Soup", servings: 4 }, "old2");
const before = JSON.stringify(existing);
const changes = p.plannerChanges(existing, slotsFixed, true);
eq("the preview says add, skip, add, add", changes.map(function (c) { return c.action; }), ["add", "skip", "add", "add"]);
eq("it names what is already there", changes[1].was, "Eating out");
const applied = p.plannerApply(existing, slotsFixed, true, newId);
eq("three added, one left alone", [applied.added, applied.replaced, applied.skipped], [3, 0, 1]);
eq("the old plan object was not touched", JSON.stringify(existing), before);
eq("the existing dinner and its side are still there", [plan.dayOf(applied.plan, "2026-11-10").main.id, plan.dayOf(applied.plan, "2026-11-10").sides.length], ["old1", 1]);
const stewEntry = plan.dayOf(applied.plan, "2026-11-09").main;
eq("a cooking night is a normal recipe entry", [stewEntry.kind, stewEntry.role, stewEntry.recipeId, stewEntry.title, stewEntry.servings, stewEntry.meal], ["recipe", "main", "stew", "Chicken and Potato Stew", 8, "dinner"]);
const leftEntry = plan.dayOf(applied.plan, "2026-11-11").main;
eq("a leftovers night is a normal leftovers entry naming its dinner", [leftEntry.kind, leftEntry.note, leftEntry.recipeId, leftEntry.servings], ["leftovers", "Chicken and Potato Stew", "", null]);
eq("the saved plan passes the plan's own cleaning unchanged", JSON.stringify(plan.cleanPlan(applied.plan)), JSON.stringify(applied.plan));
eq("the plan's own leftovers guess agrees", plan.guessLeftoversOf(applied.plan, "2026-11-11"), "Chicken and Potato Stew");
const replaced = p.plannerApply(existing, slotsFixed, false, newId);
eq("replace mode: the busy day is replaced", [replaced.added, replaced.replaced, replaced.skipped], [3, 1, 0]);
eq("its side dish stays", plan.dayOf(replaced.plan, "2026-11-10").sides.length, 1);
eq("one main per day", replaced.plan.entries.filter(function (e) { return e.date === "2026-11-10" && e.role === "main"; }).length, 1);
const busySource = plan.addEntry({ entries: [] }, "2026-11-09", { kind: "note", note: "Guests" }, "old3");
eq("if the source day is taken, its leftovers night is skipped too", p.plannerChanges(busySource, slotsFixed, true).map(function (c) { return c.action; }), ["skip", "add", "skip", "add"]);
eq("nothing to save, nothing changes", JSON.stringify(p.plannerApply(existing, [], true, newId).plan), before);
eq("the recipes were still not changed", JSON.stringify(BOOK), snapshot);

// ----- the real Shopping list reads the saved plan -----
const built = shop.buildShoppingList(applied.plan, BOOK, "2026-11-09");
check("the Shopping list scales the bigger batch", shop.rowAmountText(built.items.find(function (r) { return r.name === "chicken broth"; })) === "8 cups");
check("leftovers add nothing to the Shopping list", built.plannedRecipes === 3, built.plannedRecipes);

// ----- backups: a plan with suggested dinners merges like any other -----
const merged = plan.mergePlans({ entries: [] }, plan.cleanPlan(JSON.parse(JSON.stringify(applied.plan))));
eq("a backup round trip keeps every dinner", merged.added, applied.plan.entries.length);

// ----- sync: suggested dinners travel like hand-planned ones -----
function makeCloud() {
  let clock = 0;
  const cloud = {
    rows: {},
    stamp() { clock++; return "2026-11-09T10:00:" + String(clock).padStart(2, "0") + ".000Z"; },
    async pullPlan(since) { return Object.values(cloud.rows).filter(function (r) { return !since || r.modified_at >= since; }).map(function (r) { return Object.assign({}, r); }); },
    async fetchPlanRow(id) { return cloud.rows[id] ? Object.assign({}, cloud.rows[id]) : null; },
    async insertPlan(row) { if (cloud.rows[row.id]) { return { ok: false }; } cloud.rows[row.id] = Object.assign({}, row, { modified_at: cloud.stamp() }); return { ok: true, modified_at: cloud.rows[row.id].modified_at }; },
    async updatePlan(id, base, patch) { const row = cloud.rows[id]; if (!row || row.version !== base) { return { ok: false }; } const q = Object.assign({}, patch); delete q.id; Object.assign(row, q, { modified_at: cloud.stamp() }); return { ok: true, modified_at: row.modified_at }; },
    async purgeOldPlan() {}
  };
  return cloud;
}
function makePhone(cloud, start) {
  const phone = { plan: start, state: null };
  phone.env = function () {
    return { cloud: cloud, userId: "u1",
      loadPlan: function () { return JSON.parse(JSON.stringify(phone.plan)); },
      savePlan: function (x) { phone.plan = JSON.parse(JSON.stringify(x)); return true; },
      loadState: function () { return phone.state ? JSON.parse(JSON.stringify(phone.state)) : null; },
      saveState: function (s) { phone.state = JSON.parse(JSON.stringify(s)); },
      now: function () { return "2026-11-09T12:00:00.000Z"; } };
  };
  return phone;
}
(async function () {
  const cloud = makeCloud();
  const a = makePhone(cloud, existing);
  const b = makePhone(cloud, { entries: [] });
  await ps.syncPlan(a.env()); await ps.syncPlan(b.env());
  a.plan = p.plannerApply(a.plan, slotsFixed, false, newId).plan;     // replaces "Eating out" on the 10th
  await ps.syncPlan(a.env()); await ps.syncPlan(b.env());
  const sortById = function (x) { return x.entries.slice().sort(function (m, k) { return m.id < k.id ? -1 : 1; }); };
  eq("the second device gets the same week", JSON.stringify(sortById(b.plan)), JSON.stringify(sortById(a.plan)));
  check("the replaced dinner is gone there too", !b.plan.entries.some(function (e) { return e.id === "old1"; }));
  eq("nothing is left waiting", ps.planPendingCount(a.env()), 0);

  // ----- speed: a big cookbook is still quick -----
  const big = [];
  for (let i = 0; i < 400; i++) {
    const r = BOOK[i % 10];
    big.push(recipe("big" + i, r.current.title + " " + i, r.current.ingredients.map(function (x) { return x.text; }).concat(["1 cup thing" + (i % 37)]), 4, 20 + (i % 50)));
  }
  const t0 = Date.now();
  const bigWeek = suggest({ dinners: 7 }, big);
  const ms = Date.now() - t0;
  check("400 recipes, 7 dinners, under a second", bigWeek.planned === 7 && ms < 1000, ms);

  console.log(passed + " passed, " + failed + " failed");
  if (failed > 0) { process.exit(1); }
})();
