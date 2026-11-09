import {
  ADDENDUM_STRATEGIES,
  FEE_TIERS,
  audienceById,
  audiencesForSeller,
  buildLinearSchedule,
  buyerInGeo,
  buyerMayEnter,
  clearBook,
  firstBidderReward,
  listingPhase,
  nextStep,
  orderMoney,
  priceAtQuantity,
  priceBands,
  projectSale,
  roundMoney,
  sensitivityCheck,
  settlement,
  validateSchedule,
} from "./engine.js";
import { createSeed } from "./seed.js";

const KEY = "ram.prototype.v1";
const TOUR_KEY = "ram.prototype.tourSeen";
const PRESENTER_KEY = "ram.prototype.presenter";
const SELLER_LABEL = { manufacturer: "Manufacturer", wholesaler: "Wholesaler", retailer: "Retailer", individual: "Individual" };
const BUYER_LABEL = { wholesaler: "Wholesaler", retailer: "Retailer", individual: "Individual" };
const AUDIENCE_SHORT = {
  "mfr-wholesaler": "Maker → wholesaler",
  "mfr-trade": "Maker → trade",
  "mfr-individual": "Maker → individual",
  "wh-retail": "Wholesale → shops",
  "wh-individual": "Wholesale → individual",
  "ret-individual": "Shop → individual",
  "ind-individual": "Individual",
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LOT_MEDIA = {
  "lot-example": ["towels", "Drawn mark for Millhouse shop towels"],
  "lot-gloves": ["gloves", "A blue nitrile exam glove"],
  "lot-lights": ["lights", "Drawn mark for Northbeam shop lights"],
  "lot-paint": ["paint", "A paint roller and metal frame"],
  "lot-cases": ["cases", "Silicone phone cases in several colours"],
  "lot-batteries": ["batteries", "Alkaline batteries in a case"],
  "lot-oil": ["oil", "Bottles of yellow cooking oil"],
  "lot-filters": ["filters", "Drawn mark for Airlane HVAC filters"],
  "lot-closed": ["paper", "Stacks of white copy paper"],
  "lot-bottles": ["bottles", "A matte stainless water bottle"],
  "lot-mugs": ["mugs", "A plain white ceramic mug"],
  "lot-lamp": ["lamp", "A metal desk lamp"],
  "lot-tumbler": ["tumbler", "Drawn mark for a Harbor enamel tumbler"],
  "lot-earbuds": ["earbuds", "White wireless earbuds in an open case"],
  "lot-headphones": ["headphones", "Black over-ear headphones"],
};

let state = loadState();
const ui = {
  q: "",
  manufacturer: "",
  brand: "",
  model: "",
  sellerType: "",
  status: "",
  filtersOpen: false,
  menu: null,
  toast: "",
  presenter: false,
  playing: false,
  bid: {},
  sell: null,
  calc: null,
  welcome: false,
  about: false,
  tour: null,
};
let route = { name: "catalogue" };
let playTimer = 0;
let toastTimer = 0;
let lastSig = "";
let menuStamp = 0;

function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return createSeed();
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.listings) || !Array.isArray(parsed.users)) return createSeed();
    return parsed;
  } catch (err) {
    return createSeed();
  }
}

function loadPresenter() {
  try { ui.presenter = localStorage.getItem(PRESENTER_KEY) === "1"; } catch (err) { ui.presenter = false; }
}

function persist() {
  localStorage.setItem(KEY, JSON.stringify(state));
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function isNativeApp() {
  return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
}

function tourSeen() {
  try { return localStorage.getItem(TOUR_KEY) === "1"; } catch (err) { return false; }
}

function markTourSeen() {
  try { localStorage.setItem(TOUR_KEY, "1"); } catch (err) { /* private mode */ }
}

const TOUR = [
  { title: "This menu picks who you are", body: "There is no login. This menu picks a sample person. Morgan sells wholesale. Jordan runs a shop and can bid on those lots.", target: "role", hash: "#/" },
  { title: "The catalogue", body: "Every card is a lot of the same item. Most are wholesalers selling to shops. Open a card to see the price and how much time is left.", target: "catalogue", hash: "#/" },
  { title: "Start with the shop towels", body: "Open Shop towel cases, then press Play the price clock. The price starts at $100 and steps down as sample bids come in.", target: "start", hash: "#/" },
  { title: "The price clock", body: "The big number is the price right now. It drops when more units are claimed. The boxes show the price at each quantity. Press Play the price clock to watch it move.", target: "clock", hash: "#/listing/lot-example" },
  { title: "Placing a bid", body: "You are now Jordan, a shop owner. Enter how many you want and the most you will pay per unit. If that is at least the price on the clock, you are in right away.", target: "bid", hash: "#/listing/lot-example", user: "u-jordan" },
  { title: "Pending bids", body: "A lower bid waits. On the glove lot, some bids are waiting. If enough waiting bids reach their price together, they all get in and the price drops. If time runs out first, they do not get the item.", target: "pending", hash: "#/listing/lot-gloves", user: "u-jordan" },
  { title: "Sellers list a lot", body: "You are Morgan again. A seller sets how many, the high price, the lowest price, who may buy, and shipping. The unit cost stays private.", target: "sell", hash: "#/sell", user: "u-morgan" },
  { title: "The profit calculator", body: "Only the seller sees this. It estimates the final price, the profit per day, and what happens if 20% fewer units sell. The figures are a sample, not a forecast.", target: "calc", hash: "#/calculator/lot-example", user: "u-morgan" },
  { title: "The wish list", body: "Buyers write what they want and how many. Sellers see the same counts. When a matching lot appears, a buyer who asked for an alert gets one.", target: "wishlist", hash: "#/wishlist", user: "u-morgan" },
];

function money(n) {
  return roundMoney(n).toLocaleString("en-US", { style: "currency", currency: "USD" });
}
function pct(rate) { return `${(rate * 100).toFixed(1)}%`; }
function me() {
  return state.users.find((user) => user.id === state.activeUserId && user.switchable) || state.users.find((user) => user.switchable);
}
function userById(id) { return state.users.find((user) => user.id === id); }
function findListing(id) { return state.listings.find((listing) => listing.id === id); }
function bidsFor(listing) { return state.bids.filter((bid) => bid.listingId === listing.id); }
function bookOf(listing) { return clearBook({ quantity: listing.quantity, schedule: listing.schedule, bids: bidsFor(listing) }); }
function phaseOf(listing, now = Date.now()) { return listingPhase(listing, bookOf(listing), now); }
function signature() { return state.listings.map((listing) => `${listing.id}:${phaseOf(listing)}:${listing.end}`).join("|"); }
function isOwnListing(listing) { return me().id === listing.sellerId; }
function canSeePending(listing) { return listing.showPending || isOwnListing(listing); }
function typeLabel(user) { return user.role === "seller" ? SELLER_LABEL[user.sellerType] : BUYER_LABEL[user.buyerType]; }

function formatRemain(ms) {
  const total = Math.max(0, Math.floor(Number(ms) / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  return hours > 0 ? `${hours}h ${mins}m ${secs}s` : `${mins}m ${secs}s`;
}

function clockText(phase, start, end, now = Date.now()) {
  if (phase === "upcoming") return `Opens in ${formatRemain(start - now)}`;
  if (phase === "live") return `${formatRemain(end - now)} left`;
  return "Closed";
}

function stamp(ms) {
  const date = new Date(ms);
  let hours = date.getHours();
  const ap = hours >= 12 ? "p.m." : "a.m.";
  hours = hours % 12 || 12;
  const mins = String(date.getMinutes()).padStart(2, "0");
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}, ${hours}:${mins}\u202F${ap}`;
}

function stars(n) {
  const full = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
  return `${"★".repeat(full)}${"☆".repeat(5 - full)}`;
}

function geoText(geo) {
  if (!geo) return "No geographic limit";
  const parts = [geo.countries?.length ? geo.countries.join(", ") : "Any country"];
  if (geo.regions?.length) parts.push(geo.regions.join(", "));
  if (geo.cities?.length) parts.push(geo.cities.join(", "));
  return parts.join(" · ");
}

function bonusText(bonus) {
  if (!bonus || bonus.type === "none") return "No first-bidder bonus.";
  if (bonus.type === "free-unit") return "If the lot sells out at the floor, the first bidder's first unit is free.";
  if (bonus.type === "percent") return `If the lot sells out at the floor, the first bidder gets an extra ${bonus.percent}% off.`;
  return `If the lot sells out at the floor, the first bidder gets ${money(bonus.amount)} off.`;
}

function pendingUnits(listing, book) {
  return book.pendingBidIds.reduce((sum, id) => sum + (state.bids.find((row) => row.id === id)?.quantity || 0), 0);
}

function averageStars(userId) {
  const rows = state.ratings.filter((rating) => rating.toUserId === userId);
  if (!rows.length) return null;
  return rows.reduce((sum, row) => sum + row.stars, 0) / rows.length;
}

function wishMatches(listing, wish) {
  const blob = `${listing.title} ${listing.brand} ${listing.manufacturer} ${listing.model} ${listing.description}`.toLowerCase();
  const brand = (wish.brand || "").trim().toLowerCase();
  const model = (wish.model || "").trim().toLowerCase();
  const name = (wish.name || "").trim().toLowerCase();
  if (brand && !blob.includes(brand)) return false;
  if (model && !blob.includes(model)) return false;
  if (!brand && !model) {
    const words = name.split(/\s+/).filter((word) => word.length > 3);
    if (!words.length) return false;
    return words.filter((word) => blob.includes(word)).length >= Math.min(2, words.length);
  }
  return true;
}

function unitSpan(from, to) {
  if (from === to) return from === 1 ? "1 unit" : `${from} units`;
  return `${from}–${to} units`;
}

function publicUrl(hash) {
  const path = hash || "#/";
  if (isNativeApp()) return `https://rangeroadtech.com/demos/reverse-auction/${path}`;
  let base = location.pathname;
  if (base.endsWith(".html")) base = base.replace(/[^/]+$/, "");
  else if (!base.endsWith("/")) base = `${base}/`;
  return `${location.origin}${base}${path}`;
}

function shareRow(url, text) {
  const facebook = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
  const x = `https://x.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  const native = typeof navigator !== "undefined" && typeof navigator.share === "function";
  return `<div class="share-row">
    <a class="btn" target="_blank" rel="noopener noreferrer" href="${esc(facebook)}">Facebook</a>
    <a class="btn" target="_blank" rel="noopener noreferrer" href="${esc(x)}">X</a>
    <button type="button" class="btn" data-action="copy" data-url="${esc(url)}">Copy link</button>
    ${native ? `<button type="button" class="btn" data-action="native-share" data-url="${esc(url)}" data-text="${esc(text)}">Share…</button>` : ""}
  </div>`;
}

function icon(name) {
  const paths = {
    bell: `<path d="M12 4a4.5 4.5 0 0 0-4.5 4.5V11c0 .7-.3 1.4-.8 1.9L5.2 15h13.6l-1.5-2.1a2.8 2.8 0 0 1-.8-1.9V8.5A4.5 4.5 0 0 0 12 4z"/><path d="M10 17.5a2 2 0 0 0 4 0"/>`,
    more: `<circle cx="6" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.3" fill="currentColor" stroke="none"/>`,
    filter: `<path d="M4 6h16M7 12h10M10 18h4"/>`,
    chevron: `<path d="M6 9l6 6 6-6"/>`,
  };
  return `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
}

function mark() {
  return `<svg class="mark" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#172033"/><path d="M14 20h36L32 38 14 20z" fill="#c9853a"/><path d="M22 42h20M26 48h12" stroke="#f4efe6" stroke-width="3" stroke-linecap="round"/></svg>`;
}

function picture(listing, sizes, eager) {
  const media = LOT_MEDIA[listing.id];
  if (!media) {
    const initials = String(listing.brand || listing.title || "RAM").split(/\s+/).slice(0, 2).map((word) => word[0] || "").join("").toUpperCase() || "RAM";
    return `<div class="ph" role="img" aria-label="${esc(listing.title)}"><span>${esc(initials)}</span></div>`;
  }
  const [file, alt] = media;
  const set = (ext) => [480, 800, 1200].map((w) => `images/${file}-${w}.${ext} ${w}w`).join(", ");
  return `<picture>
    <source type="image/avif" srcset="${set("avif")}" sizes="${sizes}">
    <source type="image/webp" srcset="${set("webp")}" sizes="${sizes}">
    <img src="images/${file}-800.webp" alt="${esc(alt)}" width="1200" height="900" decoding="async"${eager ? "" : " loading=\"lazy\""}>
  </picture>`;
}

function fieldBlock({ id, label, hint, control, wide = false }) {
  return `<div class="field${wide ? " wide" : ""}">
    <label for="${esc(id)}">${esc(label)}</label>
    ${control}
    <p class="field-hint" id="${esc(id)}-hint">${esc(hint)}</p>
  </div>`;
}

function toast(text) {
  ui.toast = text;
  const node = document.getElementById("toast");
  if (node) node.textContent = text;
  else render({ keepScroll: true });
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    ui.toast = "";
    const live = document.getElementById("toast");
    if (live) live.textContent = "";
  }, 2800);
}

function stopPlay() {
  ui.playing = false;
  window.clearTimeout(playTimer);
}

function resetDemo() {
  stopPlay();
  state = createSeed();
  ui.sell = null;
  ui.calc = null;
  ui.bid = {};
  ui.menu = null;
  ui.about = false;
  persist();
  if (location.hash !== "#/") location.hash = "#/";
  else render({ top: true });
  toast("Sample data restored");
}

function makeSimUser(listing) {
  state.simSerial = (state.simSerial || 0) + 1;
  const audience = audienceById(listing.audienceId);
  const cities = [["Calgary", "Alberta", "T2P 1A1"], ["Edmonton", "Alberta", "T5J 0N3"], ["Red Deer", "Alberta", "T4N 1X2"], ["Lethbridge", "Alberta", "T1J 2B4"]];
  const [city, region, postal] = cities[state.simSerial % cities.length];
  const user = {
    id: `sim-${state.simSerial}`,
    switchable: false,
    simulated: true,
    role: "buyer",
    buyerType: audience?.buyers[0] || "retailer",
    name: `Sample bidder ${state.simSerial}`,
    company: "Sample shopper",
    city, region, country: "Canada",
    address1: `${120 + state.simSerial} Demo Avenue`,
    address2: "", postal, approved: true,
  };
  state.users.push(user);
  return user;
}

function addSampleBid(listing, mode) {
  const book = bookOf(listing);
  const remaining = listing.quantity - book.units;
  if (remaining <= 0 || phaseOf(listing) !== "live") return;
  const upcoming = nextStep(listing.schedule, book.units);
  let quantity = 1;
  let maxPrice = book.clockPrice;
  if (mode === "floor") {
    quantity = remaining;
    maxPrice = listing.floorPrice;
  } else if (!listing.example && upcoming) {
    quantity = Math.min(remaining, Math.max(1, upcoming.unitsNeeded));
  }
  const user = makeSimUser(listing);
  state.bids.push({
    id: `sim-bid-${state.simSerial}-${Date.now().toString(36)}`,
    listingId: listing.id,
    userId: user.id,
    quantity,
    maxPrice,
    time: Date.now(),
    shippingMethodId: listing.shipping[0].id,
    extendedWarranty: false,
    simulated: true,
  });
  persist();
}

function startPlay(listingId) {
  stopPlay();
  ui.playing = true;
  const step = () => {
    const listing = findListing(listingId);
    if (!ui.playing || !listing || phaseOf(listing) !== "live") {
      stopPlay();
      render({ keepScroll: true });
      return;
    }
    addSampleBid(listing, "step");
    render({ keepScroll: true });
    playTimer = window.setTimeout(step, 1100);
  };
  step();
}

function ordersFor(listing) {
  if (phaseOf(listing) !== "closed") return [];
  const book = bookOf(listing);
  const reward = firstBidderReward({ bonus: listing.bonus, floorPrice: listing.floorPrice, quantity: listing.quantity, book });
  return book.fills.map((fill) => {
    const bid = state.bids.find((row) => row.id === fill.bidId);
    const buyer = userById(bid.userId);
    const method = listing.shipping.find((row) => row.id === bid.shippingMethodId) || listing.shipping[0];
    const bonusOff = reward && reward.bidId === fill.bidId ? reward.amountOff : 0;
    const warranty = bid.extendedWarranty && listing.extended ? listing.extended.perUnit : 0;
    const bill = orderMoney({
      unitPrice: book.clockPrice, quantity: fill.quantity, bonusOff,
      shippingCost: method.cost, insuranceRate: listing.insuranceRate, insuranceMin: listing.insuranceMin, warrantyPerUnit: warranty,
    });
    return { fill, bid, buyer, method, reward: bonusOff ? reward : null, bill };
  });
}

function notifyMatches(listing) {
  for (const wish of state.wishes) {
    if (!wish.notify || wish.userId === listing.sellerId || !wishMatches(listing, wish)) continue;
    state.notifications.unshift({
      id: `n-${Date.now().toString(36)}-${wish.id}`,
      userId: wish.userId,
      listingId: listing.id,
      title: `${listing.brand} ${listing.model} is listed`,
      body: `${listing.title} is on the catalogue. You asked for ${wish.quantity}.`,
      createdAt: Date.now(),
      read: false,
    });
  }
}

function routeOf() {
  const parts = (location.hash.replace(/^#/, "") || "/").split("/").filter(Boolean).map(decodeURIComponent);
  const head = parts[0] || "catalogue";
  if (head === "listing" && parts[1]) return { name: "listing", id: parts[1] };
  if (head === "label" && parts[1] && parts[2]) return { name: "label", listingId: parts[1], userId: parts[2] };
  if (head === "calculator") return { name: "calculator", id: parts[1] || "" };
  if (["wishlist", "sell", "orders", "how"].includes(head)) return { name: head };
  return { name: "catalogue" };
}

function navOn(name) {
  if (name === "catalogue") return route.name === "catalogue" || route.name === "listing";
  if (name === "orders") return route.name === "orders" || route.name === "label";
  return route.name === name;
}

function developerSiteLink() {
  const external = isNativeApp() ? "" : ` target="_blank" rel="noopener noreferrer"`;
  return `<a class="developer-link" href="https://rangeroadtech.com/"${external} data-action="developer-site">Range Road Technologies</a>`;
}

function openDeveloperSite() {
  const url = "https://rangeroadtech.com/";
  if (window.RamAndroid && typeof window.RamAndroid.openExternal === "function") {
    window.RamAndroid.openExternal(url);
    return;
  }
  window.location.assign(url);
}

function suggestEntrant(listing) {
  const audience = audienceById(listing.audienceId);
  return state.users.find((user) => user.switchable && user.role === "buyer" && audience?.buyers.includes(user.buyerType) && buyerInGeo(listing.geo, user)) || null;
}

function personLine(user) {
  if (!user) return "someone who can buy this lot";
  return `${user.name} · ${user.company} · ${typeLabel(user)}`;
}

function applyTourStep() {
  const step = TOUR[ui.tour.step];
  if (step.user && state.activeUserId !== step.user) {
    state.activeUserId = step.user;
    ui.sell = null;
    ui.calc = null;
    persist();
  }
  const hash = step.hash || "#/";
  if (location.hash !== hash) {
    location.hash = hash;
    return;
  }
  render({ tour: true, top: true });
}

function startTour() {
  markTourSeen();
  ui.welcome = false;
  ui.about = false;
  ui.menu = null;
  ui.tour = { step: 0, returnUser: me().id };
  applyTourStep();
}

function endTour() {
  const back = ui.tour && ui.tour.returnUser;
  ui.tour = null;
  ui.welcome = false;
  markTourSeen();
  if (back) {
    state.activeUserId = back;
    ui.sell = null;
    ui.calc = null;
    persist();
  }
  if ((location.hash || "#/") !== "#/") location.hash = "#/";
  else render({ top: true, restore: "start-open" });
}

function dismissWelcome() {
  ui.welcome = false;
  markTourSeen();
  render({ keepScroll: true, restore: "start-open" });
}

function aboutCopy() {
  const pages = {
    catalogue: ["About the catalogue", "Each card is one lot of the same item. A live card shows the price now, how many are left, the time left, and the next lower price. Search hides lots that do not match. Manufacturer, brand, and model are how buyers look things up. Seller type matters because the audience rules depend on who is selling. Only a live lot has a moving price."],
    listing: ["About this lot", "The price starts high and can only step down. Everyone who is filled pays the same final price. A bid at the current price is taken now. A lower bid waits. Shipping and insurance are added after the unit price, and you see them before you bid. Your maximum is the most you will pay per unit. You may pay less. You will not pay more."],
    how: ["About this guide", "Read this once, then open Shop towel cases and press Play the price clock. You can replay the tour from the More menu."],
    sell: ["About listing a lot", "There are four short steps: the goods, the price clock, who may buy and how it ships, then your private cost. Buyers never see the unit cost. There is no fee to list. Example: 10 units, start at $100, floor at $70, drops at 2, 5, and 9."],
    wishlist: ["About the wish list", "A match uses the brand and model when you fill them in. Example: MedPro and GL-200 matches the glove lot. Leave the alert on if you want a notice under the bell. Sellers see the same demand counts. Share buttons point friends at a matching lot."],
    orders: ["About orders", "Nothing here is a real shipment. The copy-paper lot is already closed, so the seller can open a sample mailing label and both sides can leave a rating. A live bid stays in the list until the lot ends."],
    label: ["About this label", "This is a sample mailing label. It does not book a shipment. Check the ship-to address, the quantity, and the total with shipping and insurance."],
    calculator: ["About the calculator", "Only the seller sees this. Compare up to three setups. Your unit cost stays in this browser. There is no fee to list. The fee in the result is a sample percent of the goods, higher on small prices. Shipping is charged to the buyer and is not in this profit."],
  };
  return pages[route.name] || pages.catalogue;
}

function shell(title, body) {
  document.title = `${title} · Reverse Auction Marketing`;
  const user = me();
  const unread = state.notifications.filter((note) => note.userId === user.id && !note.read);
  const seller = user.role === "seller";
  const nav = [
    ["how", "#/how", "How it works"],
    ["catalogue", "#/", "Catalogue"],
    ["wishlist", "#/wishlist", "Wish list"],
    seller ? ["sell", "#/sell", "Sell"] : null,
    ["orders", "#/orders", "Orders"],
    seller ? ["calculator", "#/calculator", "Calculator"] : null,
  ].filter(Boolean);
  const groups = [
    ["Sellers", state.users.filter((row) => row.switchable && row.role === "seller")],
    ["Buyers", state.users.filter((row) => row.switchable && row.role === "buyer")],
  ];
  const notes = state.notifications.filter((note) => note.userId === user.id);
  const open = (name) => ui.menu === name;
  const panel = (name) => open(name) ? "" : " hidden";
  return `<div class="shell" id="shell">
    <header class="topbar">
      <div class="bar">
        <a class="brand" href="#/">${mark()}<span class="brand-lockup"><span class="brand-ram">RAM</span><span class="brand-name">Reverse Auction Marketing</span></span></a>
        <div class="tools">
          <div class="pop">
            <button type="button" class="icon-btn" data-menu="alerts" aria-expanded="${open("alerts") ? "true" : "false"}" aria-label="Alerts">${icon("bell")}${unread.length ? `<span class="count">${unread.length}</span>` : ""}</button>
            <div class="pop-panel notif-list" data-panel="alerts"${panel("alerts")}>
              ${notes.length ? notes.map((note) => `<a class="${note.read ? "" : "unread"}" href="#/listing/${esc(note.listingId)}" data-action="read-note" data-id="${esc(note.id)}"><strong>${esc(note.title)}</strong><span class="menu-note">${esc(note.body)}</span></a>`).join("") : `<p class="menu-note">No alerts yet. A buyer is notified when a wish matches a new lot.</p>`}
              ${notes.some((note) => !note.read) ? `<button type="button" class="btn" data-action="read-all">Mark all read</button>` : ""}
            </div>
          </div>
          <div class="pop">
            <button type="button" class="icon-btn" data-menu="more" aria-expanded="${open("more") || open("reset") ? "true" : "false"}" aria-label="More">${icon("more")}</button>
            <div class="pop-panel" data-panel="more"${panel("more")}>
              <button type="button" class="menu-item" data-action="tour-start">Take the tour</button>
              <button type="button" class="menu-item" data-action="presenter" role="menuitemcheckbox" aria-checked="${ui.presenter ? "true" : "false"}">Presenter tools</button>
              <p class="menu-note">Turns sample bids on for every live lot. The shop-towel lesson stays available either way.</p>
              <button type="button" class="menu-item" data-action="about">About this screen</button>
              <button type="button" class="menu-item" data-action="reset-arm">Reset demo</button>
            </div>
            <div class="pop-panel" data-panel="reset"${panel("reset")}>
              <p>Restore the original sample lots and bids?</p>
              <div class="btn-row"><button type="button" class="btn primary" data-action="reset-confirm">Reset demo</button><button type="button" class="btn" data-action="menu-close">Cancel</button></div>
            </div>
          </div>
        </div>
        <div class="role" data-tour="role">
          <span id="role-caption" class="visually-hidden">You are viewing as</span>
          <button type="button" id="role-switch" class="role-btn" data-menu="role" aria-haspopup="listbox" aria-expanded="${open("role") ? "true" : "false"}" aria-labelledby="role-caption role-value" title="${esc(user.company)}">
            <span id="role-value" class="role-line">${esc(user.name)} · ${esc(typeLabel(user))}</span>${icon("chevron")}
          </button>
          <div class="role-list" id="role-list" role="listbox" aria-labelledby="role-caption" data-panel="role"${panel("role")}>
            ${groups.map(([label, rows]) => `<p class="role-group">${label}</p>${rows.map((row) => `<button type="button" class="role-opt" role="option" data-action="switch-user" data-user="${esc(row.id)}" aria-selected="${row.id === user.id ? "true" : "false"}"><span>${esc(row.name)}</span><span class="role-meta">${esc(row.company)} · ${esc(typeLabel(row))}</span></button>`).join("")}`).join("")}
          </div>
        </div>
      </div>
      <p class="prototype">Sample data · fictional companies · no real payments</p>
      <nav class="nav" aria-label="Demo">${nav.map(([name, href, label]) => `<a href="${href}"${navOn(name) ? ' aria-current="page"' : ""}>${label}</a>`).join("")}</nav>
    </header>
    <main id="main">${body}</main>
    <footer class="foot">
      <p class="credit">Platform developed by ${developerSiteLink()}.</p>
      <p>Illustrative fees and profit figures are not a quote. Nothing on this demo charges a card or books a shipment.</p>
    </footer>
  </div>
  <div id="toast" class="toast" role="status">${esc(ui.toast)}</div>
  ${ui.welcome ? welcomeDialog() : ""}
  ${ui.about ? aboutDialog() : ""}
  ${ui.tour ? tourDialog() : ""}`;
}

function welcomeDialog() {
  return `<div class="modal-root" data-dialog="welcome">
    <div class="welcome" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <p class="kicker">First visit</p>
      <h2 id="welcome-title">See how a lot gets cheaper</h2>
      <p>The price starts high. It drops as more units are claimed. Everyone who gets one pays that same final price. Nothing here is a real payment.</p>
      <div class="btn-row">
        <button type="button" class="btn primary" data-autofocus data-action="tour-start">Take the tour</button>
        <button type="button" class="btn" data-action="tour-dismiss">Skip for now</button>
        <button type="button" class="btn" data-action="tour-read">Read how it works</button>
      </div>
    </div>
  </div>`;
}

function aboutDialog() {
  const [heading, text] = aboutCopy();
  return `<div class="modal-root" data-dialog="about">
    <div class="about-card" role="dialog" aria-modal="true" aria-labelledby="about-title">
      <h2 id="about-title">${esc(heading)}</h2>
      <p>${esc(text)}</p>
      <button type="button" class="btn primary" data-autofocus data-action="about-close">Close</button>
    </div>
  </div>`;
}

function tourDialog() {
  const step = TOUR[ui.tour.step];
  return `<div id="tour-ring" class="tour-ring" hidden></div>
    <div class="tour-card" data-dialog="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <p class="kicker">Step ${ui.tour.step + 1} of ${TOUR.length}</p>
      <h2 id="tour-title">${esc(step.title)}</h2>
      <p>${esc(step.body)}</p>
      <div class="btn-row">
        <button type="button" class="btn" data-action="tour-back"${ui.tour.step === 0 ? " disabled" : ""}>Back</button>
        <button type="button" class="btn primary" data-autofocus data-action="tour-next">${ui.tour.step === TOUR.length - 1 ? "Done" : "Next"}</button>
        <button type="button" class="btn" data-action="tour-skip">Close tour</button>
      </div>
    </div>`;
}

function pageHead(title) {
  return `<div class="page-head"><h1 class="page-title">${esc(title)}</h1><button type="button" class="text-btn" id="about-open" data-action="about">About</button></div>`;
}

function howView() {
  return `${pageHead("How it works")}
    <p class="screen-hint">The price starts high, drops as more units are claimed, and everyone pays the final price.</p>
    <div class="guide">
      <section class="panel"><h2>The price falls as the lot fills</h2><p>Reverse Auction Marketing offers a set of the same item. The price starts at the top. Each time more units are claimed, the price can step down. When the sale ends, everyone who got units pays that one lowest price. You never pay more than the most you offered.</p></section>
      <section class="panel">
        <h2>Ten units, from $100 down to $70</h2>
        <p>This is the sample used on the shop-towel lot. The price depends on how many units are claimed.</p>
        <ol class="bands" aria-label="Price for each quantity">
          <li class="band on"><span class="price">$100</span><span class="seller-line">1 unit</span></li>
          <li class="band"><span class="price">$90</span><span class="seller-line">2 to 4</span></li>
          <li class="band"><span class="price">$80</span><span class="seller-line">5 to 8</span></li>
          <li class="band"><span class="price">$70</span><span class="seller-line">9 or 10</span></li>
        </ol>
        <p>If 5 units sell, everyone who got one pays $80. If all 10 sell, everyone pays $70. Press play on the live lot to watch it happen.</p>
        <p><a class="btn primary" href="#/listing/lot-example">Open the shop-towel lot</a></p>
      </section>
      <section class="panel">
        <h2>A bid now, or a bid that waits</h2>
        <p><strong>Immediate.</strong> Your top price is at least the price on the clock. You are in right away. If the price later falls, you pay the lower price too.</p>
        <p><strong>Pending.</strong> Your top price is lower than the clock. You wait. If enough waiting bids together reach that price, they are all taken and the price drops. One buyer can even take the whole lot at the lowest price and end it at once. If the sale ends before the price falls that far, a waiting bid does not get the item.</p>
        <p>Higher offers are filled first. If two offers match, the earlier one is first.</p>
      </section>
      <section class="panel"><h2>What a seller sets</h2><p>How many units, how they are packed, the high price, the lowest price they will take, and the steps in between. Also when it starts, how long it runs, who may buy, where it ships, the shipping choices, the warranty, and an optional thank-you for the first bidder if the lot sells out at the lowest price. The seller’s own cost is private. There is no fee to list.</p></section>
      <section class="panel"><h2>What a buyer does</h2><p>Look through the catalogue. Check the lowest price before you bid. Enter a quantity and the most you will pay. Shipping and insurance are shown first, then added to the final price. You can also list what you want. Sellers see how many people asked, and you can be told when a match is listed.</p></section>
      <section class="panel"><h2>Why both sides use it</h2><p>Buyers pool their orders and are not afraid of overpaying: the price only goes down, and never above the max they set. Sellers move a group of units at once, choose who they sell to, and can check the profit before they publish.</p><p><button type="button" class="btn" data-action="tour-start">Take the tour</button></p></section>
    </div>`;
}

function unique(key) {
  return [...new Set(state.listings.map((listing) => listing[key]))].sort((a, b) => a.localeCompare(b));
}
function selectOptions(values, current, anyLabel) {
  return [`<option value="">${esc(anyLabel)}</option>`].concat(values.map((value) => `<option value="${esc(value)}"${value === current ? " selected" : ""}>${esc(value)}</option>`)).join("");
}
function filtered() {
  const q = ui.q.trim().toLowerCase();
  return state.listings.filter((listing) => {
    const seller = userById(listing.sellerId);
    const phase = phaseOf(listing);
    if (ui.manufacturer && listing.manufacturer !== ui.manufacturer) return false;
    if (ui.brand && listing.brand !== ui.brand) return false;
    if (ui.model && listing.model !== ui.model) return false;
    if (ui.sellerType && seller?.sellerType !== ui.sellerType) return false;
    if (ui.status && phase !== ui.status) return false;
    if (!q) return true;
    return [listing.title, listing.brand, listing.manufacturer, listing.model, listing.description, seller?.company].join(" ").toLowerCase().includes(q);
  }).sort((a, b) => {
    const diff = rank(a) - rank(b);
    if (diff) return diff;
    if (a.example !== b.example) return a.example ? -1 : 1;
    return a.start - b.start;
  });
}
function rank(listing) {
  const phase = phaseOf(listing);
  return (phase === "live" ? 0 : phase === "upcoming" ? 1 : 2) * 2 + (listing.audienceId === "wh-retail" ? 0 : 1);
}
function catalogueHint() {
  const rows = filtered();
  const filtersOn = Boolean(ui.q.trim() || ui.manufacturer || ui.brand || ui.model || ui.sellerType || ui.status);
  if (!rows.length) return "No lots match these filters.";
  const wholesale = rows.filter((listing) => listing.audienceId === "wh-retail").length;
  if (!filtersOn) return `${state.listings.length} lots, ${wholesale} of them wholesale to shops.`;
  return `${rows.length} ${rows.length === 1 ? "lot matches" : "lots match"} these filters, ${wholesale} wholesale to shops.`;
}
function catalogueResults() {
  const rows = filtered();
  if (!rows.length) {
    return `<div class="empty" data-tour="catalogue"><p>No lots match. Clear the search and filters, or <a href="#/listing/lot-example">open the shop-towel lot</a> and press Play the price clock.</p><button type="button" class="btn" data-action="filters-clear">Clear filters</button></div>`;
  }
  return `<div class="grid">${rows.map((listing, index) => card(listing, index === 0)).join("")}</div>`;
}
function catalogue() {
  const filtersOn = Boolean(ui.manufacturer || ui.brand || ui.model || ui.sellerType);
  return `${pageHead("Catalogue")}
    <p class="screen-hint" id="screen-hint">${esc(catalogueHint())}</p>
    <div class="finder">
      <div class="grow"><label class="visually-hidden" for="filter-q">Search</label><input id="filter-q" data-filter="q" value="${esc(ui.q)}" placeholder="Search" /></div>
      <label class="visually-hidden" for="filter-status">Status</label>
      <select id="filter-status" data-filter="status" aria-label="Status"><option value="">All</option>${[["live", "Live"], ["upcoming", "Upcoming"], ["closed", "Closed"]].map(([key, label]) => `<option value="${key}"${ui.status === key ? " selected" : ""}>${label}</option>`).join("")}</select>
      <button type="button" class="icon-btn" id="filter-toggle" data-action="filters-toggle" aria-expanded="${ui.filtersOpen ? "true" : "false"}" aria-controls="filter-extra" aria-label="Filter lots">${icon("filter")}${filtersOn ? `<span class="count">•</span>` : ""}</button>
    </div>
    <div id="filter-extra" class="filter-extra"${ui.filtersOpen ? "" : " hidden"}>
      ${fieldBlock({ id: "filter-manufacturer", label: "Manufacturer", hint: "The company that made the goods.", control: `<select id="filter-manufacturer" data-filter="manufacturer">${selectOptions(unique("manufacturer"), ui.manufacturer, "All")}</select>` })}
      ${fieldBlock({ id: "filter-brand", label: "Brand", hint: "The name printed on the goods.", control: `<select id="filter-brand" data-filter="brand">${selectOptions(unique("brand"), ui.brand, "All")}</select>` })}
      ${fieldBlock({ id: "filter-model", label: "Model", hint: "The model code.", control: `<select id="filter-model" data-filter="model">${selectOptions(unique("model"), ui.model, "All")}</select>` })}
      ${fieldBlock({ id: "filter-sellerType", label: "Seller type", hint: "Who is selling.", control: `<select id="filter-sellerType" data-filter="sellerType"><option value="">All</option>${Object.entries(SELLER_LABEL).map(([key, label]) => `<option value="${key}"${ui.sellerType === key ? " selected" : ""}>${label}</option>`).join("")}</select>` })}
      <div class="wide"><button type="button" class="btn" data-action="filters-clear">Clear filters</button></div>
    </div>
    <aside class="start-here" data-tour="start">
      <p><strong>Start here.</strong> Open the shop-towel lot and press Play the price clock. The price starts at $100 and steps down toward $70.</p>
      <div class="btn-row"><a class="btn primary" id="start-open" href="#/listing/lot-example">Open shop towels</a><a class="btn" href="#/how">How it works</a></div>
    </aside>
    <div id="catalogue-results">${catalogueResults()}</div>`;
}

function card(listing, first) {
  const seller = userById(listing.sellerId);
  const phase = phaseOf(listing);
  const book = bookOf(listing);
  const upcoming = nextStep(listing.schedule, book.units);
  const rating = averageStars(listing.sellerId);
  const left = listing.quantity - book.units;
  const shown = phase === "closed" ? book.clockPrice : phase === "live" ? book.clockPrice : listing.schedule[0].price;
  const facts = phase === "live"
    ? `<div><dt>Left</dt><dd>${left} of ${listing.quantity}</dd></div><div><dt>Time left</dt><dd><time data-clock data-phase="live" data-start="${listing.start}" data-end="${listing.end}">${esc(clockText("live", listing.start, listing.end))}</time></dd></div><div><dt>Now</dt><dd>${money(book.clockPrice)}</dd></div><div><dt>Next step</dt><dd>${upcoming ? `${money(upcoming.price)} at ${upcoming.qty}` : "Floor"}</dd></div>`
    : phase === "upcoming"
      ? `<div><dt>Opens</dt><dd>${esc(stamp(listing.start))}</dd></div><div><dt>Closes</dt><dd>${esc(stamp(listing.end))}</dd></div><div><dt>Quantity</dt><dd>${listing.quantity}</dd></div><div><dt>Start / floor</dt><dd>${money(listing.schedule[0].price)} / ${money(listing.floorPrice)}</dd></div>`
      : `<div><dt>Cleared</dt><dd>${money(book.clockPrice)}</dd></div><div><dt>Filled</dt><dd>${book.units} of ${listing.quantity}</dd></div><div><dt>Closed</dt><dd>${esc(stamp(listing.end))}</dd></div><div><dt>Floor</dt><dd>${money(listing.floorPrice)}</dd></div>`;
  return `<a class="card" href="#/listing/${esc(listing.id)}"${first ? ' data-tour="catalogue"' : ""}>
    <div class="card-photo">${picture(listing, "(min-width: 1100px) 360px, (min-width: 700px) 46vw, 100vw", first)}</div>
    <div class="card-body">
      <div class="card-top"><p class="kicker">${esc(AUDIENCE_SHORT[listing.audienceId] || "")}</p><span class="pill ${phase}">${phase}</span></div>
      <h2>${esc(listing.title)}</h2>
      <p class="model">${esc(listing.brand)} · ${esc(listing.model)}</p>
      <p class="price">${money(shown)}</p>
      <p class="seller-line">${esc(seller.company)} · ${esc(SELLER_LABEL[seller.sellerType])}${rating ? ` · <span class="stars" aria-label="${rating.toFixed(1)} stars">${stars(rating)}</span>` : ""}</p>
      <dl class="meta">${facts}</dl>
      ${phase === "live" && canSeePending(listing) && pendingUnits(listing, book) ? `<p class="seller-line">${pendingUnits(listing, book)} units waiting below the clock</p>` : ""}
    </div>
  </a>`;
}

function listingView(id) {
  const listing = findListing(id);
  if (!listing) {
    return `${pageHead("Lot not found")}<p class="screen-hint">This link is not in the sample catalogue.</p><p class="empty">Start here: <a href="#/listing/lot-example">open the shop-towel lot</a>.</p>`;
  }
  const seller = userById(listing.sellerId);
  const audience = audienceById(listing.audienceId);
  const phase = phaseOf(listing);
  const book = bookOf(listing);
  const bands = priceBands(listing.schedule, listing.quantity);
  const probe = Math.max(book.units, 1);
  const upcoming = nextStep(listing.schedule, book.units);
  const rating = averageStars(listing.sellerId);
  const comments = state.ratings.filter((row) => row.toUserId === listing.sellerId && row.listingId === listing.id);
  const left = listing.quantity - book.units;
  const bandHtml = bands.map((band) => {
    const on = probe >= band.from && probe <= band.to;
    return `<li class="band${on ? " on" : ""}"><span class="price">${money(band.price)}</span><span class="seller-line">${unitSpan(band.from, band.to)}</span></li>`;
  }).join("");
  const priceLabel = phase === "live" ? "Current price" : phase === "upcoming" ? "Opens at" : "Clearing price";
  const priceValue = phase === "upcoming" ? listing.schedule[0].price : book.clockPrice;
  return `<nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Catalogue</a><span aria-hidden="true">·</span><span>${esc(audience.label)}</span></nav>
    ${pageHead(listing.title)}
    <p class="screen-hint">${listing.example ? "This is the $100 to $70 example. Press Play the price clock." : "The big price is what a filled buyer would pay right now."}</p>
    <p class="lede">${esc(listing.manufacturer)} · ${esc(listing.brand)} · <span class="model">${esc(listing.model)}</span> · ${esc(listing.packaging)}</p>
    <div class="listing-hero">${picture(listing, "(min-width: 800px) 720px, 100vw", true)}</div>
    <div class="listing-layout">
      <section class="clock-card">
        <div class="card-top"><span class="pill ${phase}">${phase === "live" ? "Live" : phase === "upcoming" ? "Upcoming" : "Closed"}</span><span class="seller-line">${esc(seller.company)}</span></div>
        <p class="kicker">${priceLabel}</p>
        <p class="now-price" id="clock-price" data-tour="clock">${money(priceValue)}</p>
        <div class="meter" aria-hidden="true"><span style="width:${Math.max(0, Math.min(100, (book.units / listing.quantity) * 100))}%"></span></div>
        <dl class="meta">
          <div><dt>Start</dt><dd>${esc(stamp(listing.start))}</dd></div>
          <div><dt>End</dt><dd>${esc(stamp(listing.end))}</dd></div>
          <div><dt>Quantity</dt><dd>${listing.quantity} · ${esc(listing.packaging)}</dd></div>
          <div><dt>Start price</dt><dd>${money(listing.schedule[0].price)}</dd></div>
          <div><dt>Floor</dt><dd>${money(listing.floorPrice)}</dd></div>
          ${phase === "live" ? `<div><dt>Left</dt><dd id="qty-left">${left}</dd></div><div><dt>Time left</dt><dd><time data-clock data-phase="live" data-start="${listing.start}" data-end="${listing.end}">${esc(clockText("live", listing.start, listing.end))}</time></dd></div><div><dt>Next step</dt><dd id="next-step">${upcoming ? `${money(upcoming.price)} · ${upcoming.unitsNeeded} more` : "Floor reached"}</dd></div>` : ""}
          ${phase === "upcoming" ? `<div><dt>Opens in</dt><dd><time data-clock data-phase="upcoming" data-start="${listing.start}" data-end="${listing.end}">${esc(clockText("upcoming", listing.start, listing.end))}</time></dd></div>` : ""}
          ${phase === "closed" ? `<div><dt>Filled</dt><dd>${book.units} of ${listing.quantity}</dd></div><div><dt>Reason</dt><dd>${book.soldOut ? "Sold out" : "Time expired"}</dd></div>` : ""}
        </dl>
        <ol class="bands">${bandHtml}</ol>
        <p id="clock-status" class="seller-line" aria-live="polite">${phase === "live" ? `${book.units} filled · ${canSeePending(listing) ? `${pendingUnits(listing, book)} units pending` : "Pending count hidden by the seller"}` : ""}</p>
        ${phase === "live" && showDemo(listing) ? demoBar(listing, book) : ""}
        ${shareRow(publicUrl(`#/listing/${listing.id}`), `${listing.brand} ${listing.model} — ${listing.title} on Reverse Auction Marketing`)}
      </section>
      <aside class="bid-card">${bidBox(listing, phase, book)}</aside>
      <section class="detail-card">
        <h2 class="section-title">Lot details</h2>
        <p class="measure">${esc(listing.description)}</p>
        <dl class="meta">
          <div><dt>Seller</dt><dd>${esc(seller.company)} · ${esc(SELLER_LABEL[seller.sellerType])}${rating ? ` · ${rating.toFixed(1)}` : ""}</dd></div>
          <div><dt>Audience</dt><dd>${esc(audience.label)}</dd></div>
          <div><dt>Ships to</dt><dd>${esc(geoText(listing.geo))}</dd></div>
          <div><dt>Warranty</dt><dd>${esc(listing.warranty)}</dd></div>
          <div><dt>Shipping</dt><dd>${listing.shipping.map((method) => `${esc(method.name)} ${money(method.cost)} (${esc(method.eta)})`).join("<br />")}</dd></div>
          <div><dt>Insurance</dt><dd>${pct(listing.insuranceRate)} of the goods, minimum ${money(listing.insuranceMin)}</dd></div>
          <div><dt>First bidder</dt><dd>${esc(bonusText(listing.bonus))}</dd></div>
          ${listing.extended ? `<div><dt>Extended warranty</dt><dd>${esc(listing.extended.label)} · ${money(listing.extended.perUnit)} / unit</dd></div>` : ""}
        </dl>
        ${isOwnListing(listing) ? `<p class="private">Your private unit cost is ${money(listing.unitCost)}. Buyers do not see this. <a href="#/calculator/${esc(listing.id)}">Open the profit calculator</a>.</p>` : ""}
        ${listing.example ? exampleTable(listing, book, isOwnListing(listing)) : ""}
        <div>
          <h2 class="section-title">Bids</h2>
          <p class="field-hint">Higher offers fill first. The same offer goes to whoever bid earlier.</p>
          ${bidHistory(listing, book, phase)}
        </div>
        ${comments.length ? `<h2 class="section-title">Comments</h2>${comments.map((row) => `<p class="comment"><span class="stars">${stars(row.stars)}</span> ${esc(userById(row.fromUserId)?.name || "Buyer")} — ${esc(row.comment)}</p>`).join("")}` : ""}
        ${phase === "closed" ? orderBlock(listing) : ""}
      </section>
    </div>`;
}

function exampleTable(listing, book, sellerView) {
  const rows = [];
  for (let units = 1; units <= listing.quantity; units += 1) {
    const price = priceAtQuantity(listing.schedule, units);
    rows.push(`<tr class="${book.units === units ? "on" : ""}"><td>${units}</td><td>${money(price)}</td><td>${money(price * units)}</td></tr>`);
  }
  return `<h2 class="section-title">Worked example</h2>
    <p>Ten units, drops at 2, 5, and 9. One price for every filled unit. A full clear at the $70 floor is $700.</p>
    ${sellerView ? `<p class="private">Your unit cost on this lot is $50. Ten units at $70 is a $200 yield before the platform fee — the figure from the concept sheet. Open the calculator for the fee and the 20% volume case.</p>` : ""}
    <table class="preview-table" id="example-table"><thead><tr><th>Units</th><th>Clearing price</th><th>Gross</th></tr></thead><tbody>${rows.join("")}</tbody></table>`;
}

function showDemo(listing) {
  if (phaseOf(listing) !== "live") return false;
  if (listing.example || ui.presenter) return true;
  return bidsFor(listing).some((bid) => bid.simulated);
}

function demoBar(listing, book) {
  const playing = ui.playing;
  const upcoming = nextStep(listing.schedule, book.units);
  const stepQty = listing.example || !upcoming ? 1 : Math.min(listing.quantity - book.units, Math.max(1, upcoming.unitsNeeded));
  const stopped = !playing && bidsFor(listing).some((bid) => bid.simulated);
  const line = stepQty === 1
    ? "These bids are pretend shoppers, not you. Each step adds one unit so you can see the price fall."
    : `These bids are pretend shoppers, not you. Each step adds ${stepQty} units so you can see the price fall.`;
  return `<div class="demo-bar">
    <p><strong>Watch a sample sale.</strong> ${line}</p>
    ${stopped ? `<p id="playback-note">Playback stopped. Press Play to continue from here.</p>` : ""}
    <div class="btn-row">
      ${playing ? `<button type="button" class="btn primary" id="play-toggle" data-action="sim-stop">Stop</button>` : `<button type="button" class="btn primary" id="play-toggle" data-action="sim-play" data-id="${esc(listing.id)}">Play the price clock</button>`}
      <button type="button" class="btn" data-action="sim-one" data-id="${esc(listing.id)}">Add a sample bid</button>
      <button type="button" class="btn" data-action="sim-floor" data-id="${esc(listing.id)}">Group bid at the floor</button>
      <button type="button" class="btn" data-action="sim-end" data-id="${esc(listing.id)}">Jump to close</button>
    </div>
  </div>`;
}

function bidDraft(listing) {
  if (!ui.bid[listing.id]) {
    ui.bid[listing.id] = { quantity: 1, maxPrice: bookOf(listing).clockPrice, shippingMethodId: listing.shipping[0].id, extendedWarranty: false };
  }
  return ui.bid[listing.id];
}

function bidProblems(listing, draft) {
  const problems = [];
  const quantity = Math.floor(Number(draft.quantity));
  const maxPrice = Number(draft.maxPrice);
  const start = listing.schedule[0].price;
  if (!(quantity >= 1)) problems.push("Enter at least 1 unit.");
  if (!Number.isFinite(maxPrice) || roundMoney(maxPrice) < listing.floorPrice || roundMoney(maxPrice) > start) {
    problems.push(`Your maximum has to sit between ${money(listing.floorPrice)} and ${money(start)}.`);
  }
  return problems;
}

function bidQuoteInner(listing, phase, book) {
  const draft = bidDraft(listing);
  const problems = bidProblems(listing, draft);
  const quantity = Math.max(0, Math.floor(Number(draft.quantity) || 0));
  const maxPrice = roundMoney(draft.maxPrice);
  const method = listing.shipping.find((row) => row.id === draft.shippingMethodId) || listing.shipping[0];
  const warranty = draft.extendedWarranty && listing.extended ? listing.extended.perUnit : 0;
  if (problems.length) {
    return `${problems.map((line) => `<p class="field-error" role="alert">${esc(line)}</p>`).join("")}
      <p>The most the goods can cost: ${money(0)}</p>
      <p>Shipping ${money(0)} · insurance ${money(0)}</p>
      <p><strong>Highest total ${money(0)}</strong></p>`;
  }
  const atMax = orderMoney({ unitPrice: maxPrice, quantity, shippingCost: method.cost, insuranceRate: listing.insuranceRate, insuranceMin: listing.insuranceMin, warrantyPerUnit: warranty });
  const atClock = orderMoney({ unitPrice: book.clockPrice, quantity, shippingCost: method.cost, insuranceRate: listing.insuranceRate, insuranceMin: listing.insuranceMin, warrantyPerUnit: warranty });
  const immediate = maxPrice + 0.001 >= book.clockPrice && maxPrice <= listing.schedule[0].price + 0.001;
  return `<p>${immediate ? `<span class="ok">Immediate bid.</span> Your maximum meets the current ${money(book.clockPrice)}.` : `<span class="warn">Pending bid.</span> It waits until the clock reaches ${money(maxPrice)}.`}</p>
    <p>The most the goods can cost: ${money(atMax.gross)} at your maximum.</p>
    <p>Shipping ${money(atMax.shipping)} · insurance ${money(atMax.insurance)}${warranty ? ` · warranty ${money(atMax.warranty)}` : ""}</p>
    <p><strong>Highest total ${money(atMax.total)}</strong>${immediate ? ` · about ${money(atClock.total)} if it cleared right now` : ""}</p>
    <p class="seller-line">You pay the final clearing price, never more than your maximum, plus shipping and insurance. ${esc(bonusText(listing.bonus))}</p>`;
}

function bidBox(listing, phase, book) {
  const user = me();
  if (phase === "upcoming") return `<h2 class="section-title">Bidding opens later</h2><p class="field-hint">You can read the lowest price now. Bids open when the start time arrives.</p><p>The lowest price is ${money(listing.floorPrice)}. Shipping is quoted once the lot is live.</p>`;
  if (phase === "closed") return `<h2 class="section-title">This lot has closed</h2><p class="field-hint">No more bids. Filled buyers all pay the final price.</p><p>${book.units ? `${book.units} units sold at ${money(book.clockPrice)}.` : "No bids were filled."} ${book.soldOut ? "It sold out." : "Time ran out."}</p><p><a href="#/orders">See the orders</a></p>`;
  if (user.role !== "buyer") {
    const who = suggestEntrant(listing);
    return `<h2 class="section-title">You are viewing as the seller</h2><p>Sellers do not bid on their own lot. Switch to ${esc(personLine(who))}. Or press Play the price clock and watch sample bids move the price.</p>`;
  }
  const audienceOk = buyerMayEnter(listing.audienceId, user.buyerType);
  const geoOk = buyerInGeo(listing.geo, user);
  if (!audienceOk || !geoOk) {
    const who = suggestEntrant(listing);
    const why = !audienceOk
      ? `This audience is ${audienceById(listing.audienceId).label}. A ${BUYER_LABEL[user.buyerType].toLowerCase()} can't enter it.`
      : `The seller limited this lot to ${geoText(listing.geo)}. Your profile is ${user.city}, ${user.region}, ${user.country}.`;
    return `<div class="blocked"><h2 class="section-title">You can't bid on this lot</h2><p>${esc(why)}</p><p>Switch to ${esc(personLine(who))}.</p>${who ? `<button type="button" class="btn primary" data-action="switch-user" data-user="${esc(who.id)}">Switch to ${esc(who.name)}</button>` : ""}</div>`;
  }
  const draft = bidDraft(listing);
  const problems = bidProblems(listing, draft);
  const immediate = !problems.length && roundMoney(draft.maxPrice) + 0.001 >= book.clockPrice;
  const existing = state.bids.find((row) => row.listingId === listing.id && row.userId === user.id);
  const label = problems.length ? (existing ? "Update bid" : "Place a bid") : existing ? "Update bid" : immediate ? "Place immediate bid" : "Place pending bid";
  return `<h2 class="section-title">${existing ? "Update your bid" : "Place a bid"}</h2>
    <p class="seller-line">${esc(user.company)} · ${esc(BUYER_LABEL[user.buyerType])} · ${esc(user.city)}, ${esc(user.region)}</p>
    ${user.approved ? `<p class="ok">Approved buyer for this demo.</p>` : ""}
    <form data-form="bid" data-listing="${esc(listing.id)}" class="stack" autocomplete="off" novalidate>
      <div id="bid-fields" data-tour="bid">
        ${fieldBlock({ id: "bid-qty", label: "Quantity", hint: "How many units you want. At least 1.", control: `<input id="bid-qty" data-bid="${esc(listing.id)}" data-field="quantity" inputmode="numeric" type="number" min="1" step="1" value="${esc(draft.quantity)}" aria-describedby="bid-qty-hint" />` })}
        ${fieldBlock({ id: "bid-max", label: "Your maximum, per unit", hint: `Between ${money(listing.floorPrice)} and ${money(listing.schedule[0].price)}. A bid at the price now is taken immediately. A lower bid waits.`, control: `<input id="bid-max" data-bid="${esc(listing.id)}" data-field="maxPrice" inputmode="decimal" type="number" min="${listing.floorPrice}" max="${listing.schedule[0].price}" step="0.01" value="${esc(draft.maxPrice)}" aria-describedby="bid-max-hint" />` })}
      </div>
      ${fieldBlock({ id: "bid-ship", label: "Shipping", hint: "Added to the goods. Shown before you bid.", control: `<select id="bid-ship" data-bid="${esc(listing.id)}" data-field="shippingMethodId">${listing.shipping.map((method) => `<option value="${esc(method.id)}"${method.id === draft.shippingMethodId ? " selected" : ""}>${esc(method.name)} · ${money(method.cost)} · ${esc(method.eta)}</option>`).join("")}</select>` })}
      ${listing.extended ? `<label class="check" for="bid-warranty"><input id="bid-warranty" data-bid="${esc(listing.id)}" data-field="extendedWarranty" type="checkbox"${draft.extendedWarranty ? " checked" : ""} /><span>Add ${esc(listing.extended.label)} (${money(listing.extended.perUnit)} / unit)</span></label><p class="field-hint">Optional. Added only if you are filled.</p>` : ""}
      <div class="quote" id="bid-quote">${bidQuoteInner(listing, phase, book)}</div>
      <button class="btn primary" id="bid-submit" type="submit"${problems.length ? " disabled" : ""}>${label}</button>
    </form>`;
}

function bidHistory(listing, book, phase) {
  const rows = settlement({ closed: phase === "closed", book, bids: bidsFor(listing) });
  const visible = rows.filter((row) => {
    const bid = state.bids.find((item) => item.id === row.bidId);
    if (row.status === "pending" && !canSeePending(listing) && bid.userId !== me().id) return false;
    return true;
  });
  if (!visible.length) {
    const hidden = rows.some((row) => row.status === "pending") && !canSeePending(listing);
    return `<p class="empty" data-tour="pending">${hidden ? "The seller hid the waiting bids. Your own waiting bid still shows here." : "No bids yet. If this lot is live, press Play the price clock, or place a bid if you are viewing as a buyer."}</p>`;
  }
  return `<ul class="bid-list">${visible.map((row, index) => {
    const bid = state.bids.find((item) => item.id === row.bidId);
    const buyer = userById(bid.userId);
    const showPrice = row.status !== "pending" || isOwnListing(listing) || bid.userId === me().id;
    const pendingMark = index === 0 || row.status === "pending" ? ' data-tour="pending"' : "";
    const useMark = row.status === "pending" && !visible.slice(0, index).some((item) => item.status === "pending");
    return `<li${useMark || (index === 0 && !visible.some((item) => item.status === "pending")) ? pendingMark : ""}><strong>${esc(buyer?.name || "Buyer")}</strong> · ${esc(buyer?.company || "")}<br />${row.quantity || bid.quantity} units · ${esc(row.status)}${showPrice ? ` · max ${money(bid.maxPrice)}` : ""} · ${esc(stamp(bid.time))}${bid.simulated ? " · sample" : ""}</li>`;
  }).join("")}</ul>`;
}

function orderBlock(listing) {
  const orders = ordersFor(listing);
  if (!orders.length) return `<h2 class="section-title">Orders</h2><p class="empty">Nothing was filled, so there is nothing to ship. Open a live lot, such as the shop towels, if you want to see a sale finish.</p>`;
  const mine = isOwnListing(listing) ? orders : orders.filter((order) => order.buyer.id === me().id);
  if (!mine.length) return "";
  return `<h2 class="section-title">${isOwnListing(listing) ? "Orders to ship" : "Your order"}</h2>${mine.map((order) => orderCard(listing, order)).join("")}`;
}

function orderCard(listing, order) {
  const seller = isOwnListing(listing);
  return `<article class="panel" style="margin-top:10px">
    <div class="spread"><strong>${esc(order.buyer.company)}</strong><span>${money(order.bill.total)}</span></div>
    <p>${order.fill.quantity} × ${money(order.bill.gross / order.fill.quantity)} = ${money(order.bill.gross)}${order.reward ? ` · bonus −${money(order.reward.amountOff)}` : ""}</p>
    <p>Shipping ${esc(order.method.name)} ${money(order.bill.shipping)} · insurance ${money(order.bill.insurance)}${order.bill.warranty ? ` · warranty ${money(order.bill.warranty)}` : ""}</p>
    <p class="seller-line">${esc(order.buyer.address1)}, ${esc(order.buyer.city)} ${esc(order.buyer.region)} ${esc(order.buyer.postal)}</p>
    ${order.reward ? `<p class="ok">${esc(order.reward.note)}</p>` : ""}
    ${seller ? `<p><a class="btn" href="#/label/${esc(listing.id)}/${esc(order.buyer.id)}">Mailing label</a></p>` : ""}
    ${ratingForm(listing, order)}
  </article>`;
}

function ratingForm(listing, order) {
  const user = me();
  const seller = userById(listing.sellerId);
  const pairs = [];
  if (user.id === order.buyer.id) pairs.push([seller, "Rate the seller"]);
  if (user.id === seller.id) pairs.push([order.buyer, "Rate the buyer"]);
  return pairs.map(([target, label]) => {
    const existing = state.ratings.find((row) => row.listingId === listing.id && row.fromUserId === user.id && row.toUserId === target.id);
    if (existing) return `<p class="comment">Your rating: <span class="stars">${stars(existing.stars)}</span> ${esc(existing.comment)}</p>`;
    return `<form data-form="rate" data-listing="${esc(listing.id)}" data-to="${esc(target.id)}" class="stack" style="margin-top:8px">
      ${fieldBlock({ id: `stars-${listing.id}-${target.id}`, label, hint: "1 is poor, 5 is excellent.", control: `<select id="stars-${listing.id}-${target.id}" name="stars">${[5, 4, 3, 2, 1].map((n) => `<option value="${n}">${n} star${n > 1 ? "s" : ""}</option>`).join("")}</select>` })}
      ${fieldBlock({ id: `comment-${listing.id}-${target.id}`, label: "Comment", hint: "A sentence the other person will see.", control: `<textarea id="comment-${listing.id}-${target.id}" name="comment" maxlength="280" placeholder="e.g. The cases arrived sealed."></textarea>` })}
      <button class="btn primary" type="submit">Save rating</button>
    </form>`;
  }).join("");
}

function blankSell() {
  const seller = me();
  const choices = audiencesForSeller(seller.sellerType);
  const startPrice = 100;
  const floorPrice = 70;
  const quantity = 10;
  const stepCount = 3;
  return {
    title: "", manufacturer: seller.sellerType === "manufacturer" ? seller.company : "", brand: "", model: "", packaging: "", description: "",
    quantity, startPrice, floorPrice, stepMode: "linear", stepCount,
    schedule: buildLinearSchedule({ startPrice, floorPrice, stepCount, quantity }),
    start: toLocalInput(Date.now() + 15 * 60 * 1000), hours: 24, audienceId: choices[0]?.id || "",
    countries: ["Canada"], regions: "", cities: "",
    shipping: [{ id: "ground", name: "Ground", cost: 12, eta: "4–7 days" }],
    insuranceRate: 2, insuranceMin: 1.5, warranty: "Manufacturer warranty, 1 year, on new sealed goods.",
    extendedLabel: "", extendedPerUnit: "", bonusType: "none", bonusAmount: 10, bonusPercent: 10,
    showPending: true, unitCost: "", expectedUnits: 10, expectedDays: 1, errors: [], step: 0,
  };
}

function toLocalInput(ms) {
  const date = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function ensureSell() {
  if (!ui.sell || ui.sell.sellerId !== me().id) ui.sell = { ...blankSell(), sellerId: me().id };
  if (ui.sell.step == null) ui.sell.step = 0;
  return ui.sell;
}
function currentSchedule(draft) {
  const quantity = Math.floor(Number(draft.quantity));
  if (draft.stepMode === "linear") {
    return buildLinearSchedule({ startPrice: Number(draft.startPrice), floorPrice: Number(draft.floorPrice), stepCount: Number(draft.stepCount), quantity });
  }
  const schedule = draft.schedule.map((row) => ({ qty: Math.floor(Number(row.qty)), price: roundMoney(row.price) }));
  if (schedule.length) {
    schedule[0] = { qty: 0, price: roundMoney(draft.startPrice) };
    schedule[schedule.length - 1] = { ...schedule[schedule.length - 1], price: roundMoney(draft.floorPrice) };
  }
  return schedule;
}
function goodsErrors(draft) {
  const errors = [];
  if (!String(draft.title).trim()) errors.push("Add a title.");
  if (!String(draft.manufacturer).trim() || !String(draft.brand).trim() || !String(draft.model).trim()) errors.push("Manufacturer, brand, and model are how the catalogue is indexed.");
  if (!String(draft.packaging).trim()) errors.push("Describe the packaging.");
  if (!(Math.floor(Number(draft.quantity)) >= 1)) errors.push("Quantity has to be at least 1.");
  return errors;
}
function priceErrors(draft) {
  const quantity = Math.floor(Number(draft.quantity));
  const errors = [...validateSchedule(currentSchedule(draft), { startPrice: Number(draft.startPrice), floorPrice: Number(draft.floorPrice), quantity })];
  if (!Number.isFinite(new Date(draft.start).getTime())) errors.push("Choose a start time.");
  const hours = Number(draft.hours);
  if (!(hours >= 0.5) || hours > 336) errors.push("Duration has to be between 30 minutes and 14 days.");
  return errors;
}
function buyerErrors(draft) {
  const errors = [];
  const audience = audienceById(draft.audienceId);
  if (!audience || audience.sellerType !== me().sellerType) errors.push("Choose an audience that matches your seller type.");
  if (!draft.shipping.length || draft.shipping.some((method) => !String(method.name).trim() || !(Number(method.cost) >= 0))) errors.push("Each shipping method needs a name and a cost.");
  if (!String(draft.warranty).trim()) errors.push("State the warranty.");
  return errors;
}
function costErrors(draft) {
  if (draft.unitCost === "" || !(Number(draft.unitCost) >= 0)) return ["Enter your private unit cost. Buyers never see it."];
  return [];
}
function errorsForStep(draft, step) {
  if (step === 0) return goodsErrors(draft);
  if (step === 1) return priceErrors(draft);
  if (step === 2) return buyerErrors(draft);
  return costErrors(draft);
}

function sellView() {
  if (me().role !== "seller") {
    return `${pageHead("Sell")}<p class="screen-hint">Only a seller can list a lot.</p><p class="empty">Switch to Morgan Hale. Morgan is the sample wholesaler. Elena lists as a manufacturer, Pat as a person, and Rene as a shop.</p>`;
  }
  const draft = ensureSell();
  const steps = ["Goods", "Price", "Buyers", "Cost"];
  return `${pageHead("List a lot")}
    <p class="screen-hint">Four short steps. There is no fee to list, and buyers never see your cost.</p>
    <ol class="stepper">${steps.map((label, index) => `<li><button type="button" data-action="sell-goto" data-step="${index}"${draft.step === index ? ' aria-current="step"' : ""}>${index + 1} ${label}</button></li>`).join("")}</ol>
    ${draft.errors.length ? `<div class="errors" id="sell-errors">${draft.errors.map((error) => `<p>${esc(error)}</p>`).join("")}</div>` : ""}
    <form data-form="sell" id="sell-pane" class="stack" autocomplete="off" novalidate>${sellPane(draft)}</form>`;
}

function sellPane(draft) {
  const choices = audiencesForSeller(me().sellerType);
  if (draft.step === 0) {
    return `<p class="field-hint">What you are selling. Buyers see this on the card.</p>
      <div class="form-grid" data-tour="sell">
        ${fieldBlock({ id: "sell-title", label: "Title", hint: "The name on the catalogue card.", control: `<input id="sell-title" data-sell="title" value="${esc(draft.title)}" placeholder="e.g. Shop towel cases" />` })}
        ${fieldBlock({ id: "sell-packaging", label: "Packaging", hint: "How one unit is packed.", control: `<input id="sell-packaging" data-sell="packaging" value="${esc(draft.packaging)}" placeholder="e.g. Case of 12 rolls" />` })}
        ${fieldBlock({ id: "sell-manufacturer", label: "Manufacturer", hint: "Who made it.", control: `<input id="sell-manufacturer" data-sell="manufacturer" value="${esc(draft.manufacturer)}" placeholder="e.g. Millhouse Paper" />` })}
        ${fieldBlock({ id: "sell-brand", label: "Brand", hint: "The brand on the package.", control: `<input id="sell-brand" data-sell="brand" value="${esc(draft.brand)}" placeholder="e.g. Millhouse" />` })}
        ${fieldBlock({ id: "sell-model", label: "Model", hint: "The model code.", control: `<input id="sell-model" data-sell="model" value="${esc(draft.model)}" placeholder="e.g. ST-12" />` })}
        ${fieldBlock({ id: "sell-quantity", label: "Quantity", hint: "How many units are for sale.", control: `<input id="sell-quantity" data-sell="quantity" type="number" min="1" step="1" value="${esc(draft.quantity)}" />` })}
        ${fieldBlock({ id: "sell-description", label: "Description", hint: "A sentence or two. Say if it is new and sealed.", wide: true, control: `<textarea id="sell-description" data-sell="description" placeholder="e.g. Bleached shop towels in sealed cases.">${esc(draft.description)}</textarea>` })}
      </div>
      <div class="btn-row"><button class="btn primary" type="button" data-action="sell-next">Continue</button></div>`;
  }
  if (draft.step === 1) {
    return `<p class="field-hint">The price starts high and steps down as units are claimed.</p>
      <div class="form-grid">
        ${fieldBlock({ id: "sell-start", label: "Start price", hint: "The high price, before any units are claimed.", control: `<input id="sell-start" data-sell="startPrice" type="number" min="0" step="0.01" value="${esc(draft.startPrice)}" />` })}
        ${fieldBlock({ id: "sell-floor", label: "Floor price", hint: "The lowest price you will take.", control: `<input id="sell-floor" data-sell="floorPrice" type="number" min="0" step="0.01" value="${esc(draft.floorPrice)}" />` })}
        <fieldset class="wide" style="border:0;padding:0;margin:0">
          <legend class="kicker">Price steps</legend>
          <p class="field-hint">Even steps, or your own quantities. Example: drop to $90 at 2 units, $80 at 5, and $70 at 9.</p>
          <label class="check"><input type="radio" name="stepMode" data-sell="stepMode" value="linear"${draft.stepMode === "linear" ? " checked" : ""} /> Even steps</label>
          <label class="check"><input type="radio" name="stepMode" data-sell="stepMode" value="custom"${draft.stepMode === "custom" ? " checked" : ""} /> My own quantity thresholds</label>
          <div id="step-extra">${draft.stepMode === "linear" ? fieldBlock({ id: "sell-steps", label: "Number of downward steps", hint: "How many times the price drops.", control: `<input id="sell-steps" data-sell="stepCount" type="number" min="1" max="12" step="1" value="${esc(draft.stepCount)}" />` }) : stepEditor(draft)}</div>
        </fieldset>
        <div class="wide" id="schedule-preview">${schedulePreview(draft)}</div>
        ${fieldBlock({ id: "sell-start-time", label: "Start time", hint: "When bids can begin.", control: `<input id="sell-start-time" data-sell="start" type="datetime-local" value="${esc(draft.start)}" />` })}
        ${fieldBlock({ id: "sell-hours", label: "Duration in hours", hint: "How long the sale stays open. Example: 24 for one day.", control: `<input id="sell-hours" data-sell="hours" type="number" min="0.5" max="336" step="0.5" value="${esc(draft.hours)}" />` })}
      </div>
      <div class="btn-row"><button class="btn" type="button" data-action="sell-back">Back</button><button class="btn primary" type="button" data-action="sell-next">Continue</button></div>`;
  }
  if (draft.step === 2) {
    return `<p class="field-hint">Who may bid, and the shipping they will see before they bid.</p>
      <fieldset style="border:0;padding:0">
        <legend class="kicker">Who can buy</legend>
        <p class="field-hint">The choices depend on your seller type. Switch person in the header to see the others.</p>
        ${choices.map((choice) => `<label class="check"><input type="radio" name="audience" data-sell="audienceId" value="${esc(choice.id)}"${draft.audienceId === choice.id ? " checked" : ""} /> ${esc(choice.label)}</label>`).join("")}
      </fieldset>
      <fieldset style="border:0;padding:0">
        <legend class="kicker">Where it can ship</legend>
        <p class="field-hint">Leave both countries unchecked for no country limit.</p>
        ${["Canada", "United States"].map((country) => `<label class="check"><input type="checkbox" data-sell="country" value="${esc(country)}"${draft.countries.includes(country) ? " checked" : ""} /> ${esc(country)}</label>`).join("")}
        <div class="form-grid">
          ${fieldBlock({ id: "sell-regions", label: "Provinces or states", hint: "Optional. Separate with commas.", control: `<input id="sell-regions" data-sell="regions" value="${esc(draft.regions)}" placeholder="e.g. Alberta" />` })}
          ${fieldBlock({ id: "sell-cities", label: "Cities", hint: "Optional. Separate with commas.", control: `<input id="sell-cities" data-sell="cities" value="${esc(draft.cities)}" placeholder="e.g. Calgary" />` })}
        </div>
      </fieldset>
      <div class="stack" id="ship-list">
        <p class="kicker">Shipping methods</p>
        <p class="field-hint">At least one method. The buyer picks one before bidding.</p>
        ${draft.shipping.map((method, index) => `<div class="ship-row">
          ${fieldBlock({ id: `ship-${index}-name`, label: "Method", hint: "A name the buyer will recognize.", control: `<input id="ship-${index}-name" data-ship="${index}" data-ship-field="name" value="${esc(method.name)}" />` })}
          ${fieldBlock({ id: `ship-${index}-cost`, label: "Cost", hint: "What the buyer pays to ship.", control: `<input id="ship-${index}-cost" data-ship="${index}" data-ship-field="cost" type="number" min="0" step="0.01" value="${esc(method.cost)}" />` })}
          ${fieldBlock({ id: `ship-${index}-eta`, label: "Timing", hint: "How long delivery usually takes.", control: `<input id="ship-${index}-eta" data-ship="${index}" data-ship-field="eta" value="${esc(method.eta)}" />` })}
          <button type="button" class="btn" data-action="remove-ship" data-index="${index}"${draft.shipping.length === 1 ? " disabled" : ""}>Remove</button>
        </div>`).join("")}
        <button type="button" class="btn" data-action="add-ship">Add a method</button>
      </div>
      <div class="form-grid">
        ${fieldBlock({ id: "sell-insure", label: "Insurance percent", hint: "A percent of the goods, paid by the buyer.", control: `<input id="sell-insure" data-sell="insuranceRate" type="number" min="0" step="0.1" value="${esc(draft.insuranceRate)}" />` })}
        ${fieldBlock({ id: "sell-insure-min", label: "Insurance minimum", hint: "The least the buyer pays for insurance.", control: `<input id="sell-insure-min" data-sell="insuranceMin" type="number" min="0" step="0.01" value="${esc(draft.insuranceMin)}" />` })}
        ${fieldBlock({ id: "sell-warranty", label: "Warranty", hint: "The maker’s warranty, in plain words.", wide: true, control: `<textarea id="sell-warranty" data-sell="warranty">${esc(draft.warranty)}</textarea>` })}
        ${fieldBlock({ id: "sell-ext-name", label: "Optional extra warranty", hint: "Leave blank if you do not offer one.", control: `<input id="sell-ext-name" data-sell="extendedLabel" value="${esc(draft.extendedLabel)}" placeholder="e.g. Third-party 1-year extension" />` })}
        ${fieldBlock({ id: "sell-ext-price", label: "Extra warranty price per unit", hint: "Charged only if the buyer adds it.", control: `<input id="sell-ext-price" data-sell="extendedPerUnit" type="number" min="0" step="0.01" value="${esc(draft.extendedPerUnit)}" />` })}
      </div>
      <div class="btn-row"><button class="btn" type="button" data-action="sell-back">Back</button><button class="btn primary" type="button" data-action="sell-next">Continue</button></div>`;
  }
  return `<p class="field-hint">Your cost stays private. It feeds the profit snapshot.</p>
    <div class="form-grid">
      ${fieldBlock({ id: "sell-bonus", label: "First-bidder bonus", hint: "Pays only if the lot sells out at the floor.", control: `<select id="sell-bonus" data-sell="bonusType"><option value="none"${draft.bonusType === "none" ? " selected" : ""}>None</option><option value="free-unit"${draft.bonusType === "free-unit" ? " selected" : ""}>First unit free if it sells out at the floor</option><option value="amount"${draft.bonusType === "amount" ? " selected" : ""}>Fixed amount off</option><option value="percent"${draft.bonusType === "percent" ? " selected" : ""}>Extra percent off</option></select>` })}
      ${draft.bonusType === "amount" ? fieldBlock({ id: "sell-bonus-amt", label: "Bonus amount", hint: "Dollars off the first bidder’s goods.", control: `<input id="sell-bonus-amt" data-sell="bonusAmount" type="number" min="0" step="0.01" value="${esc(draft.bonusAmount)}" />` }) : ""}
      ${draft.bonusType === "percent" ? fieldBlock({ id: "sell-bonus-pct", label: "Bonus percent", hint: "Extra percent off the first bidder’s goods.", control: `<input id="sell-bonus-pct" data-sell="bonusPercent" type="number" min="0" step="1" value="${esc(draft.bonusPercent)}" />` }) : ""}
      <div class="field wide"><label class="check" for="sell-pending"><input id="sell-pending" data-sell="showPending" type="checkbox"${draft.showPending ? " checked" : ""} /><span>Show buyers how many units are waiting</span></label><p class="field-hint">You always see the count. Buyers see it only if this is on.</p></div>
      ${fieldBlock({ id: "sell-cost", label: "Private unit cost", hint: "Only you see this. Buyers never do.", control: `<input id="sell-cost" data-sell="unitCost" type="number" min="0" step="0.01" value="${esc(draft.unitCost)}" placeholder="e.g. 50" />` })}
      ${fieldBlock({ id: "sell-units", label: "Expected units for the snapshot", hint: "How many you think will sell.", control: `<input id="sell-units" data-sell="expectedUnits" type="number" min="0" step="1" value="${esc(draft.expectedUnits)}" />` })}
      ${fieldBlock({ id: "sell-days", label: "Expected days", hint: "How long you think the sale will take.", control: `<input id="sell-days" data-sell="expectedDays" type="number" min="0.25" step="0.25" value="${esc(draft.expectedDays)}" />` })}
    </div>
    <div id="sell-snapshot">${sellSnapshot(draft)}</div>
    <div class="btn-row"><button class="btn" type="button" data-action="sell-back">Back</button><button class="btn primary" type="submit">Publish listing</button></div>`;
}

function stepEditor(draft) {
  return `<div class="stack"><p class="field-hint">The first row is the start price, at zero units. The last row is the floor.</p>${draft.schedule.map((row, index) => `<div class="step-row">
      ${fieldBlock({ id: `step-${index}-qty`, label: index === 0 ? "Starting quantity" : "At quantity", hint: index === 0 ? "Stays at 0." : "Units claimed before this price applies.", control: `<input id="step-${index}-qty" data-step="${index}" data-step-field="qty" type="number" min="0" step="1" value="${esc(row.qty)}"${index === 0 ? " disabled" : ""} />` })}
      ${fieldBlock({ id: `step-${index}-price`, label: "Price", hint: "Lower than the row above.", control: `<input id="step-${index}-price" data-step="${index}" data-step-field="price" type="number" min="0" step="0.01" value="${esc(row.price)}" />` })}
      ${index > 0 && index < draft.schedule.length - 1 ? `<button type="button" class="btn" data-action="remove-step" data-index="${index}">Remove</button>` : `<span></span>`}
    </div>`).join("")}
    <button type="button" class="btn" data-action="add-step">Add a threshold</button></div>`;
}

function schedulePreview(draft) {
  const quantity = Math.floor(Number(draft.quantity)) || 0;
  const schedule = currentSchedule(draft);
  const errors = validateSchedule(schedule, { startPrice: Number(draft.startPrice), floorPrice: Number(draft.floorPrice), quantity });
  if (errors.length || quantity < 1) return `<p class="warn">${esc(errors[0] || "Set a quantity and a price range to preview the clock.")}</p>`;
  const bands = priceBands(schedule, quantity);
  return `<table class="preview-table"><thead><tr><th>Units filled</th><th>Clock price</th></tr></thead><tbody>${bands.map((band) => `<tr><td>${unitSpan(band.from, band.to)}</td><td>${money(band.price)}</td></tr>`).join("")}</tbody></table>`;
}

function sellSnapshot(draft) {
  const quantity = Math.floor(Number(draft.quantity)) || 0;
  const schedule = currentSchedule(draft);
  const errors = validateSchedule(schedule, { startPrice: Number(draft.startPrice), floorPrice: Number(draft.floorPrice), quantity });
  if (errors.length || draft.unitCost === "" || !(Number(draft.unitCost) >= 0)) {
    return `<div class="private"><strong>Private snapshot.</strong> Enter a unit cost and a valid clock to see an illustrative profit. The full comparison is on the calculator after you publish.</div>`;
  }
  const projection = projectSale({ unitCost: Number(draft.unitCost), schedule, quantity, expectedUnits: Number(draft.expectedUnits), expectedDays: Number(draft.expectedDays) });
  return `<div class="private"><strong>Illustrative, only you see this.</strong> At ${projection.units} units the clock would be ${money(projection.clearingPrice)}. Profit after the sample fee is ${money(projection.profit)} · ${money(projection.profitPerDay)} per day. Fee ${money(projection.fees)} (${pct(projection.feeRate)}). No listing fee.</div>`;
}

function syncLinear(draft) {
  const start = Number(draft.startPrice);
  const floor = Number(draft.floorPrice);
  const quantity = Math.floor(Number(draft.quantity));
  const stepCount = Math.max(1, Math.floor(Number(draft.stepCount) || 1));
  draft.stepCount = stepCount;
  if (start > floor && quantity >= 1) draft.schedule = buildLinearSchedule({ startPrice: start, floorPrice: floor, stepCount, quantity });
}

function publish() {
  const draft = ensureSell();
  const quantity = Math.floor(Number(draft.quantity));
  const schedule = currentSchedule(draft);
  draft.schedule = schedule;
  const bundles = [goodsErrors(draft), priceErrors(draft), buyerErrors(draft), costErrors(draft)];
  const first = bundles.findIndex((rows) => rows.length);
  const errors = bundles.flat();
  draft.errors = errors;
  if (errors.length) {
    if (first >= 0) draft.step = first;
    render({ keepScroll: true });
    document.getElementById("sell-errors")?.scrollIntoView({ block: "center" });
    return;
  }
  let bonus = { type: "none" };
  if (draft.bonusType === "free-unit") bonus = { type: "free-unit" };
  if (draft.bonusType === "amount") bonus = { type: "amount", amount: roundMoney(draft.bonusAmount) };
  if (draft.bonusType === "percent") bonus = { type: "percent", percent: Number(draft.bonusPercent) || 0 };
  const startMs = new Date(draft.start).getTime();
  const listing = {
    id: `lot-${Date.now().toString(36)}`,
    sellerId: me().id,
    title: draft.title.trim(),
    manufacturer: draft.manufacturer.trim(),
    brand: draft.brand.trim(),
    model: draft.model.trim(),
    packaging: draft.packaging.trim(),
    description: draft.description.trim() || draft.title.trim(),
    quantity,
    floorPrice: roundMoney(draft.floorPrice),
    schedule,
    stepMode: draft.stepMode,
    start: startMs,
    end: startMs + Number(draft.hours) * 60 * 60 * 1000,
    audienceId: draft.audienceId,
    unitCost: roundMoney(draft.unitCost),
    geo: { countries: [...draft.countries], regions: splitList(draft.regions), cities: splitList(draft.cities) },
    shipping: draft.shipping.map((method) => ({ id: method.id || `ship-${Date.now().toString(36)}`, name: String(method.name).trim(), cost: roundMoney(method.cost), eta: String(method.eta).trim() || "See seller" })),
    insuranceRate: Math.max(0, Number(draft.insuranceRate) || 0) / 100,
    insuranceMin: roundMoney(draft.insuranceMin),
    warranty: draft.warranty.trim(),
    extended: draft.extendedLabel.trim() && Number(draft.extendedPerUnit) > 0 ? { label: draft.extendedLabel.trim(), perUnit: roundMoney(draft.extendedPerUnit) } : null,
    bonus,
    showPending: !!draft.showPending,
  };
  state.listings.unshift(listing);
  const beforeNotes = state.notifications.length;
  notifyMatches(listing);
  const noted = state.notifications.length - beforeNotes;
  ui.sell = null;
  persist();
  location.hash = `#/listing/${listing.id}`;
  toast(noted ? "Listing published. Matching wishes just got an alert." : "Listing published.");
}

function splitList(value) {
  return String(value || "").split(",").map((part) => part.trim()).filter(Boolean);
}

function listingColumn(listing, tweak = {}) {
  const start0 = listing.schedule[0].price;
  const floor0 = listing.floorPrice;
  let start = roundMoney(start0 * (tweak.startMul || 1));
  let floor = roundMoney(floor0 + (tweak.floorLift || 0) * (start0 - floor0));
  if (!(floor < start)) floor = roundMoney(start - 0.01);
  const stepCount = Math.max(1, listing.schedule.length - 1);
  const schedule = tweak.keep ? listing.schedule.map((row) => ({ ...row })) : buildLinearSchedule({ startPrice: start, floorPrice: floor, stepCount, quantity: listing.quantity });
  if (tweak.keep) { start = schedule[0].price; floor = schedule[schedule.length - 1].price; }
  const durationDays = Math.max(0.5, (listing.end - listing.start) / 86400000);
  return {
    name: tweak.name, blurb: tweak.blurb || "", startPrice: start, floorPrice: floor, stepCount, quantity: listing.quantity,
    unitCost: listing.unitCost, expectedUnits: Math.max(0, Math.round(listing.quantity * (tweak.fill ?? 1))),
    expectedDays: tweak.days != null ? tweak.days : (listing.example ? 1 : Math.round(durationDays * 10) / 10),
    schedule, unsold: false,
  };
}

function makeCalc(listingId, source) {
  const listing = findListing(listingId);
  const columns = source === "addendum"
    ? ADDENDUM_STRATEGIES.map((strategy) => ({
      name: strategy.name, blurb: strategy.blurb, startPrice: strategy.schedule[0].price,
      floorPrice: strategy.schedule[strategy.schedule.length - 1].price, stepCount: strategy.schedule.length - 1,
      quantity: strategy.quantity, unitCost: strategy.unitCost, expectedUnits: strategy.expectedUnits,
      expectedDays: strategy.expectedDays, schedule: strategy.schedule.map((row) => ({ ...row })), unsold: false,
    }))
    : [
      listingColumn(listing, { name: "This listing", keep: true, fill: 1, blurb: "The lot as you configured it, including your private cost." }),
      listingColumn(listing, { name: "Faster turnover", startMul: 0.94, fill: 0.9, days: listing.example ? 1 : undefined, blurb: "A lower start and a high fill, on even steps." }),
      listingColumn(listing, { name: "Higher floor", startMul: 1.06, floorLift: 0.45, fill: 0.5, days: listing.example ? 4 : undefined, blurb: "Wait for a higher price. Volume is thinner." }),
    ];
  return { listingId, source: source || "listing", annual: 8, columns, routeStamp: listingId };
}

function ensureCalc() {
  if (me().role !== "seller") return null;
  const mine = state.listings.filter((listing) => listing.sellerId === me().id);
  if (!mine.length) return null;
  const routePick = mine.some((listing) => listing.id === route.id) ? route.id : "";
  if (!ui.calc || !mine.some((listing) => listing.id === ui.calc.listingId)) ui.calc = makeCalc(routePick || mine[0].id);
  else if (routePick && ui.calc.routeStamp !== routePick) ui.calc = makeCalc(routePick);
  return ui.calc;
}

function rebuildColumn(column) {
  const start = Number(column.startPrice);
  const floor = Number(column.floorPrice);
  const quantity = Math.floor(Number(column.quantity));
  const stepCount = Math.max(1, Math.floor(Number(column.stepCount) || 1));
  column.stepCount = stepCount;
  column.quantity = quantity;
  if (start > floor && quantity >= 1) {
    column.schedule = buildLinearSchedule({ startPrice: start, floorPrice: floor, stepCount, quantity });
    column.startPrice = column.schedule[0].price;
    column.floorPrice = column.schedule[column.schedule.length - 1].price;
  }
}

function calculatorView() {
  if (me().role !== "seller") return `${pageHead("Profit calculator")}<p class="screen-hint">Only the seller of a lot can open this.</p><p class="empty">Switch to Morgan Hale, then open the shop-towel calculator.</p>`;
  const calc = ensureCalc();
  if (!calc) return `${pageHead("Profit calculator")}<p class="screen-hint">The calculator needs a lot you listed.</p><p class="empty">No lot yet. <a href="#/sell">List one</a>, or switch to Morgan Hale.</p>`;
  const mine = state.listings.filter((listing) => listing.sellerId === me().id);
  return `${pageHead("Private profit calculator")}
    <p class="screen-hint">A sample estimate of the final price, profit per day, and a 20% miss. Not a forecast.</p>
    <div class="calc-head" data-tour="calc">
      ${fieldBlock({ id: "calc-listing", label: "Lot", hint: "One of your listings.", control: `<select id="calc-listing">${mine.map((listing) => `<option value="${esc(listing.id)}"${listing.id === calc.listingId ? " selected" : ""}>${esc(listing.title)}</option>`).join("")}</select>` })}
      ${fieldBlock({ id: "calc-annual", label: "If this money earned something else, % per year", hint: "What this money could earn somewhere else, as a yearly percent.", control: `<input id="calc-annual" data-calc-global="annual" type="number" min="0" step="0.5" value="${esc(calc.annual)}" />` })}
      <div class="btn-row wide">
        <button type="button" class="btn" data-action="calc-listing">Compare two other setups</button>
        <button type="button" class="btn" data-action="calc-paper">Load the three sample strategies used in How it works</button>
      </div>
    </div>
    <div class="private" style="margin-top:12px">No listing fee and no registration fee. The sample fee is a percent of the goods only, higher on small unit prices: ${FEE_TIERS.map((tier) => `${esc(tier.label)} ${pct(tier.rate)}`).join(" · ")}. Shipping is charged to the buyer and is not in this profit.</div>
    <div class="calc-grid">${calc.columns.map((column, index) => calcCard(column, index, Number(calc.annual) || 0)).join("")}</div>`;
}

function calcCard(column, index, annual) {
  const quantity = Math.floor(Number(column.quantity)) || 0;
  const broken = !(Number(column.startPrice) > Number(column.floorPrice)) || quantity < 1;
  let body = `<p class="warn">Start price has to stay above the floor, and quantity has to be at least 1.</p>`;
  if (!broken) {
    const units = column.unsold ? 0 : Math.floor(Number(column.expectedUnits) || 0);
    const check = sensitivityCheck({ unitCost: Number(column.unitCost) || 0, schedule: column.schedule, quantity, expectedUnits: units, expectedDays: Number(column.expectedDays) || 0 });
    const base = check.base;
    const alt = (base.capitalTiedUp * (annual / 100)) / 365;
    const paper = ADDENDUM_STRATEGIES.find((strategy) => strategy.paperPerUnitPerDay === base.profitPerUnitPerDay);
    const concept = base.profitBeforeFees === 200 && base.clearingPrice === 70 && base.units === 10;
    body = `${column.blurb ? `<p class="seller-line">${esc(column.blurb)}</p>` : ""}
      <div class="stat"><span>Expected clearing price</span><b>${units ? money(base.clearingPrice) : "—"}</b></div>
      <div class="stat"><span>Expected units</span><b>${base.units} of ${quantity}</b></div>
      <div class="stat"><span>Profit before fees</span><b>${money(base.profitBeforeFees)}</b></div>
      <div class="stat"><span>Platform fee</span><b>${money(base.fees)} · ${pct(base.feeRate)}</b></div>
      <div class="stat"><span>Profit after fee</span><b>${money(base.profit)}</b></div>
      <div class="stat"><span>Profit per day</span><b>${money(base.profitPerDay)}</b></div>
      <div class="stat"><span>Per unit per day, before fees</span><b>${money(base.profitPerUnitPerDay)}</b></div>
      <div class="stat"><span>Capital tied up</span><b>${money(base.capitalTiedUp)}</b></div>
      <div class="stat"><span>Daily return on that capital</span><b>${(base.dailyReturn * 100).toFixed(2)}%</b></div>
      <div class="stat"><span>Alternative at ${annual}% a year</span><b>${money(alt)} / day</b></div>
      <p>${base.profitPerDay >= alt ? `This configuration earns ${money(base.profitPerDay - alt)} more per day than parking the capital at ${annual}%.` : `The alternative earns ${money(alt - base.profitPerDay)} more per day than this configuration.`}</p>
      ${concept ? `<p class="ok">This is the concept sheet's case: $50 cost, 10 units, $70 clear, $200 before fees in a day.</p>` : ""}
      ${paper ? `<p class="ok">Matches the discussion paper's ${money(paper.paperPerUnitPerDay)} per unit per day, before fees.</p>` : ""}
      <div class="sens">${column.unsold || units === 0 ? "Treated as unsold: profit is zero, and the capital is still tied up." : check.priceStepped ? `If volume is 20% lower (${check.lower.units} units), the price steps to the next level, ${money(check.lower.clearingPrice)}. Profit per day becomes ${money(check.lower.profitPerDay)}.` : `If volume is 20% lower (${check.lower.units} units), the clock stays ${money(check.lower.clearingPrice)}. Profit per day becomes ${money(check.lower.profitPerDay)}.`}
      </div>
      <p class="seller-line">${scheduleLine(column.schedule, quantity)}</p>`;
  }
  return `<article class="calc-card panel">
    ${fieldBlock({ id: `calc-${index}-name`, label: "Configuration", hint: "A name for this column.", control: `<input id="calc-${index}-name" data-calc="${index}" data-field="name" value="${esc(column.name)}" />` })}
    <div class="form-grid">
      ${fieldBlock({ id: `calc-${index}-start`, label: "Start", hint: "High price.", control: `<input id="calc-${index}-start" data-calc="${index}" data-field="startPrice" type="number" step="0.01" value="${esc(column.startPrice)}" />` })}
      ${fieldBlock({ id: `calc-${index}-floor`, label: "Floor", hint: "Lowest price.", control: `<input id="calc-${index}-floor" data-calc="${index}" data-field="floorPrice" type="number" step="0.01" value="${esc(column.floorPrice)}" />` })}
      ${fieldBlock({ id: `calc-${index}-steps`, label: "Steps", hint: "How many drops.", control: `<input id="calc-${index}-steps" data-calc="${index}" data-field="stepCount" type="number" min="1" max="12" step="1" value="${esc(column.stepCount)}" />` })}
      ${fieldBlock({ id: `calc-${index}-qty`, label: "Quantity", hint: "Units in the lot.", control: `<input id="calc-${index}-qty" data-calc="${index}" data-field="quantity" type="number" min="1" step="1" value="${esc(column.quantity)}" />` })}
      ${fieldBlock({ id: `calc-${index}-cost`, label: "Unit cost", hint: "Private. Only you see it.", control: `<input id="calc-${index}-cost" data-calc="${index}" data-field="unitCost" type="number" min="0" step="0.01" value="${esc(column.unitCost)}" />` })}
      ${fieldBlock({ id: `calc-${index}-units`, label: "Expected units", hint: "How many you think will sell.", control: `<input id="calc-${index}-units" data-calc="${index}" data-field="expectedUnits" type="number" min="0" step="1" value="${esc(column.expectedUnits)}" />` })}
      ${fieldBlock({ id: `calc-${index}-days`, label: "Days", hint: "How long until it sells.", control: `<input id="calc-${index}-days" data-calc="${index}" data-field="expectedDays" type="number" min="0.25" step="0.25" value="${esc(column.expectedDays)}" />` })}
    </div>
    <label class="check" for="calc-${index}-unsold"><input id="calc-${index}-unsold" data-calc="${index}" data-field="unsold" type="checkbox"${column.unsold ? " checked" : ""} /><span>Assume it does not sell</span></label>
    <p class="field-hint">Turn this on if you want the “nothing sold” case.</p>
    ${body}
  </article>`;
}

function scheduleLine(schedule, quantity) {
  try { return priceBands(schedule, quantity).map((band) => `${unitSpan(band.from, band.to)} @ ${money(band.price)}`).join(" · "); }
  catch (err) { return ""; }
}

function wishlistView() {
  const user = me();
  const groups = demandGroups();
  return `${pageHead("Wish list")}
    <p class="screen-hint">${user.role === "buyer" ? "Write what you want and how many. Sellers see the same count." : "Buyers and sellers see the same demand counts."}</p>
    ${user.role === "buyer" ? `<form id="wish-form" data-form="wish" data-tour="wishlist" class="form-grid panel" autocomplete="off" style="padding:14px;margin-bottom:16px">
      ${fieldBlock({ id: "wish-name", label: "Item", hint: "What you want to buy.", control: `<input id="wish-name" name="name" required placeholder="e.g. Nitrile exam gloves" />` })}
      ${fieldBlock({ id: "wish-qty", label: "Quantity", hint: "How many you would buy.", control: `<input id="wish-qty" name="quantity" type="number" min="1" step="1" value="1" required />` })}
      ${fieldBlock({ id: "wish-mfr", label: "Manufacturer", hint: "Optional.", control: `<input id="wish-mfr" name="manufacturer" />` })}
      ${fieldBlock({ id: "wish-brand", label: "Brand", hint: "Optional, but better for a match.", control: `<input id="wish-brand" name="brand" placeholder="e.g. MedPro" />` })}
      ${fieldBlock({ id: "wish-model", label: "Model", hint: "Optional model code.", control: `<input id="wish-model" name="model" placeholder="e.g. GL-200" />` })}
      <div class="field wide"><label class="check" for="wish-notify"><input id="wish-notify" name="notify" type="checkbox" checked /><span>Notify me when a match is listed</span></label><p class="field-hint">The alert shows under the bell for your sample person.</p></div>
      <div class="wide"><button class="btn primary" type="submit">Add to wish list</button></div>
    </form>` : `<p class="private">You are a seller, so this page is the demand board. Switch to a buyer, such as Jordan Blake, to add a wish.</p>`}
    <div class="orders">${groups.length ? groups.map((group, index) => {
      const match = state.listings.find((listing) => phaseOf(listing) !== "closed" && group.wishes.some((wish) => wishMatches(listing, wish)));
      const shareTarget = match ? publicUrl(`#/listing/${match.id}`) : publicUrl("#/");
      const text = match ? `${match.title} on Reverse Auction Marketing` : `Looking for ${group.units} × ${group.sample.name} on Reverse Auction Marketing`;
      return `<article class="panel"${user.role !== "buyer" && index === 0 ? ' data-tour="wishlist"' : ""}>
        <div class="spread"><h2 class="section-title">${esc(group.sample.brand || group.sample.name)} ${esc(group.sample.model || "")}</h2><strong>${group.wishes.length} buyer${group.wishes.length === 1 ? "" : "s"} · ${group.units} units</strong></div>
        <p>${esc(group.sample.name)}</p>
        <ul class="bid-list">${group.wishes.map((wish) => `<li>${esc(userById(wish.userId)?.company || "Buyer")} · ${wish.quantity} units${wish.userId === user.id ? ` <button type="button" class="btn" data-action="remove-wish" data-id="${esc(wish.id)}">Remove</button>` : ""}</li>`).join("")}</ul>
        ${match ? `<p class="ok"><a href="#/listing/${esc(match.id)}">Open the matching lot</a></p>` : `<p class="seller-line">No open lot matches this yet.</p>`}
        <p class="field-hint">Share so more people can bid. Facebook, X, or copy the link.</p>
        ${shareRow(shareTarget, text)}
      </article>`;
    }).join("") : `<p class="empty">No wishes yet. If you are a buyer, add an item and a quantity above. Sellers will see the count here.</p>`}</div>`;
}

function demandGroups() {
  const groups = new Map();
  for (const wish of state.wishes) {
    const key = [wish.brand, wish.model, wish.name].map((part) => (part || "").trim().toLowerCase()).join("|");
    if (!groups.has(key)) groups.set(key, { sample: wish, wishes: [], units: 0 });
    const group = groups.get(key);
    group.wishes.push(wish);
    group.units += Number(wish.quantity) || 0;
  }
  return [...groups.values()].sort((a, b) => b.units - a.units);
}

function ordersView() {
  const user = me();
  const closed = state.listings.filter((listing) => phaseOf(listing) === "closed");
  const sellerOrders = user.role === "seller" ? closed.filter((listing) => listing.sellerId === user.id).flatMap((listing) => ordersFor(listing).map((order) => ({ listing, order }))) : [];
  const buyerOrders = closed.flatMap((listing) => ordersFor(listing).filter((order) => order.buyer.id === user.id).map((order) => ({ listing, order })));
  const liveBids = state.bids.filter((bid) => bid.userId === user.id && phaseOf(findListing(bid.listingId)) === "live");
  return `${pageHead("Orders")}
    <p class="screen-hint">${user.role === "seller" ? "Finished sales, with shipping and insurance, and a sample mailing label." : "Your filled bids, with shipping and insurance added to the final price."}</p>
    ${liveBids.length ? `<h2 class="section-title">Live bids</h2><ul class="bid-list">${liveBids.map((bid) => {
      const listing = findListing(bid.listingId);
      const book = bookOf(listing);
      const row = settlement({ closed: false, book, bids: [bid] })[0];
      return `<li><a href="#/listing/${esc(listing.id)}">${esc(listing.title)}</a> · ${bid.quantity} units · ${esc(row.status)} · max ${money(bid.maxPrice)}</li>`;
    }).join("")}</ul>` : ""}
    <div class="orders" style="margin-top:12px">${(user.role === "seller" ? sellerOrders : buyerOrders).map(({ listing, order }) => `<div><p class="kicker">${esc(listing.title)}</p>${orderCard(listing, order)}</div>`).join("") || `<p class="empty">No filled orders yet. ${user.role === "seller" ? "The copy-paper lot is already closed if you want a label and a rating." : "Bid on a live lot, or switch to Jordan Blake to see the finished copy-paper order."}</p>`}</div>`;
}

function labelView() {
  const listing = findListing(route.listingId);
  if (!listing) return `${pageHead("Label")}<p class="empty">That lot is not in the sample. Go back to <a href="#/orders">Orders</a>.</p>`;
  if (me().id !== listing.sellerId) return `${pageHead("Label")}<p class="screen-hint">Only the seller of this lot can open the label.</p><p class="empty">For the copy-paper lot, switch to Morgan Hale.</p>`;
  const order = ordersFor(listing).find((row) => row.buyer.id === route.userId);
  if (!order) return `${pageHead("Label")}<p class="empty">That buyer was not filled on this lot, so there is no address to print.</p>`;
  const seller = userById(listing.sellerId);
  const ref = `${listing.id}-${order.buyer.id}`.toUpperCase();
  return `${pageHead("Mailing label")}<p class="screen-hint">A sample mailing label. It does not book a shipment.</p>
    <p class="no-print"><a class="btn" href="#/orders">Orders</a> <button type="button" class="btn primary" data-action="print">Print</button></p>
    <article class="label-sheet">
      <div class="label-banner"><div><span class="label-ram">RAM</span><strong>Reverse Auction Marketing</strong></div><span>SAMPLE — not a shipment</span></div>
      <div class="label-cols">
        <div><p class="kicker">From</p><p><strong>${esc(seller.company)}</strong><br />${esc(seller.name)}<br />${esc(seller.address1)}<br />${esc(seller.city)} ${esc(seller.region)} ${esc(seller.postal)}<br />${esc(seller.country)}</p></div>
        <div><p class="kicker">To</p><p><strong>${esc(order.buyer.company)}</strong><br />${esc(order.buyer.name)}<br />${esc(order.buyer.address1)}<br />${esc(order.buyer.city)} ${esc(order.buyer.region)} ${esc(order.buyer.postal)}<br />${esc(order.buyer.country)}</p></div>
      </div>
      <p style="margin-top:16px"><strong>${esc(listing.title)}</strong><br />${order.fill.quantity} × ${esc(listing.packaging)} · ${esc(order.method.name)} · ${money(order.bill.total)} including shipping and insurance</p>
      <div class="barcode" aria-hidden="true"></div>
      <p class="model">${esc(ref)}</p>
    </article>`;
}

function placeBid(listingId) {
  const listing = findListing(listingId);
  const user = me();
  const draft = bidDraft(listing);
  if (phaseOf(listing) !== "live") return toast("This lot isn't open for bids.");
  if (user.role !== "buyer") return toast("Switch to a buyer to bid.");
  if (!buyerMayEnter(listing.audienceId, user.buyerType)) return toast("This lot isn't offered to your buyer type.");
  if (!buyerInGeo(listing.geo, user)) return toast("This lot isn't offered in your area.");
  const problems = bidProblems(listing, draft);
  if (problems.length) return toast(problems[0]);
  const quantity = Math.floor(Number(draft.quantity));
  const maxPrice = roundMoney(draft.maxPrice);
  const before = bookOf(listing).clockPrice;
  const immediate = maxPrice + 0.001 >= before;
  const existing = state.bids.find((bid) => bid.listingId === listing.id && bid.userId === user.id);
  if (existing) {
    existing.quantity = quantity;
    existing.maxPrice = maxPrice;
    existing.shippingMethodId = draft.shippingMethodId;
    existing.extendedWarranty = !!draft.extendedWarranty;
  } else {
    state.bids.push({
      id: `bid-${Date.now().toString(36)}`, listingId: listing.id, userId: user.id, quantity, maxPrice, time: Date.now(),
      shippingMethodId: draft.shippingMethodId, extendedWarranty: !!draft.extendedWarranty,
    });
  }
  persist();
  const closed = phaseOf(listing) === "closed";
  if (closed) toast("The lot sold out. Everyone filled pays the final price.");
  else if (existing) toast("Bid updated. Your original time still stands.");
  else if (immediate) toast("Immediate bid placed at the current price.");
  else toast("Pending bid placed. It clears only if the group reaches your price.");
  render({ keepScroll: true });
}

function saveRating(form) {
  const comment = String(new FormData(form).get("comment") || "").trim();
  const starsValue = Math.max(1, Math.min(5, Math.round(Number(new FormData(form).get("stars")) || 5)));
  if (comment.length < 3) return toast("Add a short comment with the rating.");
  const listingId = form.dataset.listing;
  const to = form.dataset.to;
  const existing = state.ratings.find((row) => row.listingId === listingId && row.fromUserId === me().id && row.toUserId === to);
  if (existing) { existing.stars = starsValue; existing.comment = comment; }
  else state.ratings.push({ id: `r-${Date.now().toString(36)}`, listingId, fromUserId: me().id, toUserId: to, stars: starsValue, comment, createdAt: Date.now() });
  persist();
  toast("Rating saved");
  render({ keepScroll: true });
}

function addWish(form) {
  if (me().role !== "buyer") return toast("Switch to a buyer to add a wish.");
  const data = new FormData(form);
  const name = String(data.get("name") || "").trim();
  const quantity = Math.floor(Number(data.get("quantity")));
  if (!name || !(quantity >= 1)) return toast("Name the item and a quantity.");
  state.wishes.push({
    id: `w-${Date.now().toString(36)}`, userId: me().id, name,
    manufacturer: String(data.get("manufacturer") || "").trim(),
    brand: String(data.get("brand") || "").trim(),
    model: String(data.get("model") || "").trim(),
    quantity, notify: !!form.querySelector("[name=notify]")?.checked,
  });
  persist();
  toast("Saved. Sellers can see the demand count.");
  render({ keepScroll: true });
}

function focusables(root) {
  return [...root.querySelectorAll("a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])")]
    .filter((node) => !node.hidden && node.getAttribute("aria-hidden") !== "true");
}

function settleDialog(focusPrimary) {
  const shell = document.getElementById("shell");
  const dialog = document.querySelector("[data-dialog]");
  document.body.classList.toggle("modal-open", Boolean(dialog));
  if (!dialog) {
    if (shell) { shell.inert = false; shell.removeAttribute("aria-hidden"); }
    return;
  }
  if (shell) { shell.inert = true; shell.setAttribute("aria-hidden", "true"); }
  if (focusPrimary) {
    const target = dialog.querySelector("[data-autofocus]") || focusables(dialog)[0];
    target?.focus();
  }
}

function placeTour(shouldScroll) {
  const ring = document.getElementById("tour-ring");
  const card = document.querySelector(".tour-card");
  if (!ui.tour || !ring || !card) return;
  const step = TOUR[ui.tour.step];
  let target = document.querySelector(`[data-tour="${step.target}"]`);
  if (!target) { ring.hidden = true; return; }
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const gap = 8;
  const headerH = document.querySelector(".topbar")?.getBoundingClientRect().height || 0;
  card.style.top = "auto";
  card.style.bottom = `${gap}px`;
  card.style.left = vw >= 800 ? "auto" : "8px";
  card.style.right = "8px";
  card.style.width = vw >= 800 ? "380px" : "auto";
  card.style.maxHeight = `${Math.round(vh * 0.42)}px`;
  const cardH = card.getBoundingClientRect().height;
  const bandTop = headerH + gap;
  const bandBottom = vh - cardH - gap * 2;
  const limit = Math.min(Math.max(44, bandBottom - bandTop), vh * 0.4);
  const fits = (el) => {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 16 && rect.height <= limit;
  };
  if (!fits(target)) {
    const kids = [...target.querySelectorAll("h2, .price, .now-price, a.btn, button, input, p, .card-photo")];
    target = kids.find(fits) || kids.find((el) => el.getBoundingClientRect().height > 16) || target;
  }
  if (shouldScroll) {
    let rect = target.getBoundingClientRect();
    if (rect.bottom > bandBottom) window.scrollBy(0, rect.bottom - bandBottom);
    rect = target.getBoundingClientRect();
    if (rect.top < bandTop) window.scrollBy(0, rect.top - bandTop);
  }
  const rect = target.getBoundingClientRect();
  const pad = 6;
  const top = Math.max(4, Math.min(rect.top, bandBottom - 36) - pad);
  const height = Math.max(28, Math.min(rect.height + pad * 2, bandBottom - top, vh * 0.4));
  ring.hidden = false;
  ring.style.top = `${top}px`;
  ring.style.left = `${Math.max(4, rect.left - pad)}px`;
  ring.style.width = `${Math.max(28, Math.min(vw - 8, rect.width + pad * 2))}px`;
  ring.style.height = `${height}px`;
}

function syncMenus() {
  document.querySelectorAll("[data-panel]").forEach((node) => { node.hidden = node.dataset.panel !== ui.menu; });
  document.querySelectorAll("[data-menu]").forEach((node) => {
    node.setAttribute("aria-expanded", node.dataset.menu === ui.menu ? "true" : "false");
  });
}

function onClick(event) {
  const menuBtn = event.target.closest("[data-menu]");
  if (menuBtn && !event.target.closest("[data-panel]")) {
    const name = menuBtn.dataset.menu;
    ui.menu = ui.menu === name ? null : name;
    menuStamp = performance.now();
    syncMenus();
    return;
  }
  const el = event.target.closest("[data-action]");
  if (!el) return;
  const action = el.dataset.action;
  if (action === "developer-site") {
    if (!isNativeApp()) return;
    event.preventDefault();
    openDeveloperSite();
    return;
  }
  if (action === "tour-start") { startTour(); return; }
  if (action === "tour-dismiss") { dismissWelcome(); return; }
  if (action === "tour-skip") { endTour(); return; }
  if (action === "tour-read") {
    ui.welcome = false;
    ui.tour = null;
    markTourSeen();
    if (location.hash !== "#/how") location.hash = "#/how";
    else render();
    return;
  }
  if (action === "tour-next") {
    if (!ui.tour) return;
    if (ui.tour.step >= TOUR.length - 1) endTour();
    else { ui.tour.step += 1; applyTourStep(); }
    return;
  }
  if (action === "tour-back") {
    if (!ui.tour || ui.tour.step === 0) return;
    ui.tour.step -= 1;
    applyTourStep();
    return;
  }
  if (action === "about") { ui.about = true; ui.menu = null; render({ keepScroll: true, focusDialog: true }); return; }
  if (action === "about-close") { ui.about = false; render({ keepScroll: true, restore: "about-open" }); return; }
  if (action === "read-note") {
    const note = state.notifications.find((row) => row.id === el.dataset.id);
    if (note) note.read = true;
    ui.menu = null;
    persist();
    return;
  }
  if (action === "read-all") {
    state.notifications.forEach((note) => { if (note.userId === me().id) note.read = true; });
    persist();
    render({ keepScroll: true });
    return;
  }
  if (action === "reset-arm") { ui.menu = "reset"; menuStamp = performance.now(); syncMenus(); return; }
  if (action === "menu-close") { ui.menu = null; syncMenus(); return; }
  if (action === "reset-confirm") { resetDemo(); return; }
  if (action === "presenter") {
    ui.presenter = !ui.presenter;
    try { localStorage.setItem(PRESENTER_KEY, ui.presenter ? "1" : "0"); } catch (err) { /* ignore */ }
    render({ keepScroll: true });
    return;
  }
  if (action === "switch-user") {
    state.activeUserId = el.dataset.user;
    ui.sell = null;
    ui.calc = null;
    ui.menu = null;
    persist();
    render({ keepScroll: true });
    return;
  }
  if (action === "filters-toggle") { ui.filtersOpen = !ui.filtersOpen; render({ keepScroll: true, restore: "filter-toggle" }); return; }
  if (action === "filters-clear") {
    ui.q = ""; ui.manufacturer = ""; ui.brand = ""; ui.model = ""; ui.sellerType = ""; ui.status = "";
    render({ keepScroll: true, restore: "filter-q" });
    return;
  }
  if (action === "copy") {
    const url = el.dataset.url;
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(() => toast("Link copied")).catch(() => toast(url));
    else toast(url);
    return;
  }
  if (action === "native-share") { navigator.share?.({ title: "Reverse Auction Marketing", text: el.dataset.text, url: el.dataset.url }).catch(() => {}); return; }
  if (action === "print") { window.print(); return; }
  if (action === "sim-play") { startPlay(el.dataset.id); return; }
  if (action === "sim-stop") { stopPlay(); render({ keepScroll: true }); return; }
  if (action === "sim-one" || action === "sim-floor") {
    const listing = findListing(el.dataset.id);
    addSampleBid(listing, action === "sim-floor" ? "floor" : "step");
    toast(phaseOf(listing) === "closed" ? "The group bid cleared the lot." : "Sample bid added.");
    render({ keepScroll: true });
    return;
  }
  if (action === "sim-end") {
    const listing = findListing(el.dataset.id);
    listing.end = Date.now() - 1000;
    stopPlay();
    persist();
    toast("Jumped to the close. Pending bids that never reached their price are rejected.");
    render({ keepScroll: true });
    return;
  }
  if (action === "remove-wish") { state.wishes = state.wishes.filter((wish) => wish.id !== el.dataset.id); persist(); render({ keepScroll: true }); return; }
  if (action === "add-ship") { ensureSell().shipping.push({ id: `ship-${Date.now().toString(36)}`, name: "Freight", cost: 20, eta: "5–8 days" }); render({ keepScroll: true }); return; }
  if (action === "remove-ship") {
    const draft = ensureSell();
    if (draft.shipping.length > 1) draft.shipping.splice(Number(el.dataset.index), 1);
    render({ keepScroll: true });
    return;
  }
  if (action === "add-step") {
    const draft = ensureSell();
    const schedule = draft.schedule.map((row) => ({ ...row }));
    const last = schedule[schedule.length - 1];
    const prev = schedule[schedule.length - 2];
    const quantity = Math.floor(Number(draft.quantity)) || last.qty;
    if (last.qty - prev.qty >= 2) schedule.splice(schedule.length - 1, 0, { qty: Math.floor((prev.qty + last.qty) / 2), price: roundMoney((prev.price + last.price) / 2) });
    else if (last.qty < quantity) {
      const qty = last.qty;
      last.qty = Math.min(quantity, last.qty + 1);
      schedule.splice(schedule.length - 1, 0, { qty, price: roundMoney((prev.price + last.price) / 2) });
    }
    draft.schedule = schedule;
    draft.stepMode = "custom";
    render({ keepScroll: true });
    return;
  }
  if (action === "remove-step") {
    const draft = ensureSell();
    const index = Number(el.dataset.index);
    if (index > 0 && index < draft.schedule.length - 1) draft.schedule.splice(index, 1);
    render({ keepScroll: true });
    return;
  }
  if (action === "sell-next") {
    const draft = ensureSell();
    const errors = errorsForStep(draft, draft.step);
    draft.errors = errors;
    if (errors.length) { render({ keepScroll: true }); document.getElementById("sell-errors")?.focus?.(); return; }
    draft.step = Math.min(3, draft.step + 1);
    render({ keepScroll: true, top: true });
    return;
  }
  if (action === "sell-back") { const draft = ensureSell(); draft.step = Math.max(0, draft.step - 1); draft.errors = []; render({ keepScroll: true }); return; }
  if (action === "sell-goto") {
    const draft = ensureSell();
    const next = Number(el.dataset.step);
    if (next > draft.step) {
      for (let step = draft.step; step < next; step += 1) {
        const errors = errorsForStep(draft, step);
        if (errors.length) { draft.errors = errors; draft.step = step; render({ keepScroll: true }); return; }
      }
    }
    draft.errors = [];
    draft.step = next;
    render({ keepScroll: true });
    return;
  }
  if (action === "calc-paper") {
    const calc = ensureCalc();
    ui.calc = makeCalc(calc.listingId, "addendum");
    ui.calc.routeStamp = route.id || calc.listingId;
    render({ keepScroll: true });
    return;
  }
  if (action === "calc-listing") {
    const calc = ensureCalc();
    ui.calc = makeCalc(calc.listingId, "listing");
    ui.calc.routeStamp = route.id || calc.listingId;
    render({ keepScroll: true });
  }
}

function patchCatalogue() {
  const hint = document.getElementById("screen-hint");
  const results = document.getElementById("catalogue-results");
  if (!hint || !results) return render({ keepScroll: true });
  hint.textContent = catalogueHint();
  results.innerHTML = catalogueResults();
  if (ui.tour) placeTour(false);
}

function patchBid(listingId) {
  const listing = findListing(listingId);
  const quote = document.getElementById("bid-quote");
  const button = document.getElementById("bid-submit");
  if (!listing || !quote || !button) return render({ keepScroll: true });
  const book = bookOf(listing);
  const draft = bidDraft(listing);
  const problems = bidProblems(listing, draft);
  quote.innerHTML = bidQuoteInner(listing, phaseOf(listing), book);
  const existing = state.bids.find((row) => row.listingId === listing.id && row.userId === me().id);
  const immediate = !problems.length && roundMoney(draft.maxPrice) + 0.001 >= book.clockPrice;
  button.disabled = problems.length > 0;
  button.textContent = problems.length ? (existing ? "Update bid" : "Place a bid") : existing ? "Update bid" : immediate ? "Place immediate bid" : "Place pending bid";
}

function patchSell() {
  const draft = ensureSell();
  const preview = document.getElementById("schedule-preview");
  if (preview) preview.innerHTML = schedulePreview(draft);
  const snap = document.getElementById("sell-snapshot");
  if (snap) snap.innerHTML = sellSnapshot(draft);
  if (!draft.errors.length) document.getElementById("sell-errors")?.remove();
}

function onField(event) {
  const el = event.target;
  if (!(el instanceof HTMLElement)) return;
  if (el.dataset.filter) {
    ui[el.dataset.filter] = el.value;
    patchCatalogue();
    return;
  }
  if (el.dataset.bid) {
    const draft = ui.bid[el.dataset.bid];
    if (!draft) return;
    draft[el.dataset.field] = el.type === "checkbox" ? el.checked : el.value;
    patchBid(el.dataset.bid);
    return;
  }
  if (el.dataset.sell === "country") {
    const draft = ensureSell();
    const set = new Set(draft.countries);
    if (el.checked) set.add(el.value); else set.delete(el.value);
    draft.countries = [...set];
    return;
  }
  if (el.dataset.sell) {
    const draft = ensureSell();
    draft.errors = [];
    draft[el.dataset.sell] = el.type === "checkbox" ? el.checked : el.type === "radio" ? el.value : el.value;
    const structural = el.dataset.sell === "stepMode" || el.dataset.sell === "bonusType";
    if (draft.stepMode === "linear" && ["startPrice", "floorPrice", "quantity", "stepCount", "stepMode"].includes(el.dataset.sell)) syncLinear(draft);
    if (draft.stepMode === "custom" && el.dataset.sell === "startPrice" && draft.schedule[0]) draft.schedule[0].price = roundMoney(el.value);
    if (draft.stepMode === "custom" && el.dataset.sell === "floorPrice") draft.schedule[draft.schedule.length - 1].price = roundMoney(el.value);
    if (el.dataset.sell === "stepMode" && el.value === "linear") syncLinear(draft);
    if (structural) render({ keepScroll: true, restore: el.id });
    else patchSell();
    return;
  }
  if (el.dataset.step != null) {
    const draft = ensureSell();
    const row = draft.schedule[Number(el.dataset.step)];
    row[el.dataset.stepField] = Number(el.value);
    if (Number(el.dataset.step) === 0 && el.dataset.stepField === "price") draft.startPrice = row.price;
    if (Number(el.dataset.step) === draft.schedule.length - 1 && el.dataset.stepField === "price") draft.floorPrice = row.price;
    draft.stepMode = "custom";
    patchSell();
    return;
  }
  if (el.dataset.ship != null) {
    const method = ensureSell().shipping[Number(el.dataset.ship)];
    method[el.dataset.shipField] = el.value;
    return;
  }
  if (el.id === "calc-listing") {
    ui.calc = makeCalc(el.value);
    const next = `#/calculator/${el.value}`;
    if (location.hash !== next) location.hash = next;
    else render({ keepScroll: true });
    return;
  }
  if (el.dataset.calcGlobal) {
    ensureCalc().annual = el.value;
    render({ keepScroll: true });
    return;
  }
  if (el.dataset.calc != null) {
    const column = ensureCalc().columns[Number(el.dataset.calc)];
    if (el.type === "checkbox") column[el.dataset.field] = el.checked;
    else column[el.dataset.field] = el.value;
    if (["startPrice", "floorPrice", "stepCount", "quantity"].includes(el.dataset.field)) rebuildColumn(column);
    render({ keepScroll: true });
  }
}

function onSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();
  if (form.dataset.form === "bid") placeBid(form.dataset.listing);
  if (form.dataset.form === "sell") publish();
  if (form.dataset.form === "wish") addWish(form);
  if (form.dataset.form === "rate") saveRating(form);
}

function updateClocks() {
  const now = Date.now();
  document.querySelectorAll("[data-clock]").forEach((node) => {
    node.textContent = clockText(node.dataset.phase, Number(node.dataset.start), Number(node.dataset.end), now);
  });
}

function render(options = {}) {
  route = routeOf();
  const focus = document.activeElement;
  const focusId = options.restore || (focus && focus.id ? focus.id : "");
  const selection = focus && typeof focus.selectionStart === "number" ? [focus.selectionStart, focus.selectionEnd] : null;
  const y = options.top ? 0 : (options.keepScroll ? window.scrollY : 0);
  let body = "";
  let title = "Catalogue";
  if (route.name === "listing") {
    const listing = findListing(route.id);
    title = listing ? listing.title : "Lot";
    body = listingView(route.id);
  } else if (route.name === "sell") { title = "List a lot"; body = sellView(); }
  else if (route.name === "wishlist") { title = "Wish list"; body = wishlistView(); }
  else if (route.name === "orders") { title = "Orders"; body = ordersView(); }
  else if (route.name === "label") { title = "Mailing label"; body = labelView(); }
  else if (route.name === "calculator") { title = "Profit calculator"; body = calculatorView(); }
  else if (route.name === "how") { title = "How it works"; body = howView(); }
  else body = catalogue();
  document.getElementById("app").innerHTML = shell(title, body);
  const header = document.querySelector(".topbar");
  if (header) document.documentElement.style.setProperty("--header", `${header.offsetHeight}px`);
  const navEl = document.querySelector(".nav");
  if (navEl) {
    const current = navEl.querySelector("[aria-current='page']");
    if (current) {
      const left = current.offsetLeft - (navEl.clientWidth - current.offsetWidth) / 2;
      navEl.scrollLeft = Math.max(0, left);
    }
    const overflow = navEl.scrollWidth > navEl.clientWidth + 2;
    const atEnd = navEl.scrollLeft + navEl.clientWidth >= navEl.scrollWidth - 2;
    navEl.classList.toggle("nav-more", overflow && !atEnd);
  }
  window.scrollTo(0, y);
  if (focusId) {
    const next = document.getElementById(focusId);
    if (next && !options.focusDialog && !options.tour && !options.welcome) {
      next.focus({ preventScroll: true });
      if (selection && next.setSelectionRange && next === document.activeElement) {
        try { next.setSelectionRange(selection[0], selection[1]); } catch (err) { /* number inputs */ }
      }
    }
  }
  settleDialog(Boolean(options.focusDialog || options.tour || options.welcome));
  lastSig = signature();
  updateClocks();
  if (ui.tour) placeTour(Boolean(options.tour));
}

const root = document.getElementById("app");
root.addEventListener("click", onClick);
root.addEventListener("input", onField);
root.addEventListener("change", onField);
root.addEventListener("submit", onSubmit);
document.addEventListener("click", (event) => {
  if (!ui.menu) return;
  if (performance.now() - menuStamp < 30) return;
  if (event.target.closest(".pop, .role")) return;
  ui.menu = null;
  syncMenus();
});
document.addEventListener("keydown", (event) => {
  const dialog = document.querySelector("[data-dialog]");
  if (event.key === "Escape") {
    if (dialog?.dataset.dialog === "welcome") { event.preventDefault(); dismissWelcome(); return; }
    if (dialog?.dataset.dialog === "tour") { event.preventDefault(); endTour(); return; }
    if (dialog?.dataset.dialog === "about") { event.preventDefault(); ui.about = false; render({ keepScroll: true, restore: "about-open" }); return; }
    if (ui.menu) { ui.menu = null; syncMenus(); }
    return;
  }
  if (event.key !== "Tab" || !dialog) return;
  const nodes = focusables(dialog);
  if (!nodes.length) return;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});
window.addEventListener("hashchange", () => {
  if (routeOf().name !== "listing") stopPlay();
  render(ui.tour ? { tour: true, top: true } : { top: true });
});
window.addEventListener("resize", () => { if (ui.tour) placeTour(false); });
if (!location.hash) history.replaceState(null, "", "#/");
loadPresenter();
ui.welcome = !tourSeen();
render({ welcome: ui.welcome, focusDialog: ui.welcome });
window.setInterval(() => {
  updateClocks();
  const sig = signature();
  if (sig !== lastSig && !ui.welcome && !ui.about) render(ui.tour ? { tour: true, keepScroll: true } : { keepScroll: true });
}, 1000);
