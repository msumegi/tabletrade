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
const SELLER_LABEL = { manufacturer: "Manufacturer", wholesaler: "Wholesaler", retailer: "Retailer", individual: "Individual" };
const BUYER_LABEL = { wholesaler: "Wholesaler", retailer: "Retailer", individual: "Individual" };

let state = loadState();
const ui = {
  q: "",
  manufacturer: "",
  brand: "",
  model: "",
  sellerType: "",
  status: "",
  notifOpen: false,
  resetArmed: false,
  toast: "",
  playing: false,
  bid: {},
  sell: null,
  calc: null,
  welcome: false,
  tour: null,
};
let route = { name: "catalogue" };
let playTimer = 0;
let toastTimer = 0;
let lastSig = "";

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

function persist() {
  localStorage.setItem(KEY, JSON.stringify(state));
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function isNativeApp() {
  return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
}

function info(label, tip) {
  return `<span class="help"><button type="button" class="info" aria-expanded="false" aria-label="Help: ${esc(label)}">i</button><span class="tip" role="tooltip" hidden>${esc(tip)}</span></span>`;
}

function screenHelp(hint, tip) {
  return `<p class="screen-hint">${esc(hint)} ${info("About this screen", tip)}</p>`;
}

function fieldBlock({ id, label, hint, tip, control, wide = false }) {
  return `<div class="field${wide ? " wide" : ""}">
    <div class="field-name"><label for="${esc(id)}">${esc(label)}</label> ${info(label, tip)}</div>
    ${control}
    <p class="field-hint">${esc(hint)}</p>
  </div>`;
}

const TOUR_KEY = "ram.prototype.tourSeen";

function tourSeen() {
  try {
    return localStorage.getItem(TOUR_KEY) === "1";
  } catch (err) {
    return false;
  }
}

function markTourSeen() {
  try {
    localStorage.setItem(TOUR_KEY, "1");
  } catch (err) {
    /* private mode */
  }
}

const TOUR = [
  {
    title: "You are viewing as someone",
    body: "There is no login. This menu picks a sample person. Morgan sells wholesale. Jordan runs a shop and can bid on those lots.",
    target: "role",
    hash: "#/",
  },
  {
    title: "The catalogue",
    body: "Every card is a lot of the same item. Most are wholesalers selling to shops. Open a card to see the price and how much time is left.",
    target: "catalogue",
    hash: "#/",
  },
  {
    title: "Start with the shop towels",
    body: "Open Shop towel cases, then press Play the price clock. The price starts at $100 and steps down as sample bids come in.",
    target: "start",
    hash: "#/",
  },
  {
    title: "The price clock",
    body: "The big number is the price right now. It drops when more units are claimed. The boxes show the price at each quantity. Press Play the price clock to watch it move.",
    target: "clock",
    hash: "#/listing/lot-example",
  },
  {
    title: "Placing a bid",
    body: "You are now Jordan, a shop owner. Enter how many you want and the most you will pay per unit. If that is at least the price on the clock, you are in right away.",
    target: "bid",
    hash: "#/listing/lot-example",
    user: "u-jordan",
  },
  {
    title: "Pending bids",
    body: "A lower bid waits. On the glove lot, some bids are waiting. If enough waiting bids reach their price together, they all get in and the price drops. If time runs out first, they do not get the item.",
    target: "pending",
    hash: "#/listing/lot-gloves",
    user: "u-jordan",
  },
  {
    title: "Sellers list a lot",
    body: "You are Morgan again. A seller sets how many, the high price, the lowest price, who may buy, and shipping. The unit cost stays private.",
    target: "sell",
    hash: "#/sell",
    user: "u-morgan",
  },
  {
    title: "The profit calculator",
    body: "Only the seller sees this. It estimates the final price, the profit per day, and what happens if 20% fewer units sell. The figures are a sample, not a forecast.",
    target: "calc",
    hash: "#/calculator/lot-example",
    user: "u-morgan",
  },
  {
    title: "The wish list",
    body: "Buyers write what they want and how many. Sellers see the same counts. When a matching lot appears, a buyer who asked for an alert gets one.",
    target: "wishlist",
    hash: "#/wishlist",
    user: "u-morgan",
  },
];

function money(n) {
  return roundMoney(n).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function pct(rate) {
  return `${(rate * 100).toFixed(1)}%`;
}

function me() {
  return state.users.find((user) => user.id === state.activeUserId && user.switchable) || state.users.find((user) => user.switchable);
}

function userById(id) {
  return state.users.find((user) => user.id === id);
}

function findListing(id) {
  return state.listings.find((listing) => listing.id === id);
}

function bidsFor(listing) {
  return state.bids.filter((bid) => bid.listingId === listing.id);
}

function bookOf(listing) {
  return clearBook({ quantity: listing.quantity, schedule: listing.schedule, bids: bidsFor(listing) });
}

function phaseOf(listing, now = Date.now()) {
  return listingPhase(listing, bookOf(listing), now);
}

function signature() {
  return state.listings.map((listing) => `${listing.id}:${phaseOf(listing)}:${listing.end}`).join("|");
}

function isOwnListing(listing) {
  return me().id === listing.sellerId;
}

function canSeePending(listing) {
  return listing.showPending || isOwnListing(listing);
}

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
  return new Date(ms).toLocaleString("en-CA", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function stars(n) {
  const full = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
  return `${"★".repeat(full)}${"☆".repeat(5 - full)}`;
}

function geoText(geo) {
  if (!geo) return "No geographic limit";
  const parts = [];
  parts.push(geo.countries?.length ? geo.countries.join(", ") : "Any country");
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
  return book.pendingBidIds.reduce((sum, id) => {
    const bid = state.bids.find((row) => row.id === id);
    return sum + (bid ? bid.quantity : 0);
  }, 0);
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
    const hits = words.filter((word) => blob.includes(word)).length;
    return hits >= Math.min(2, words.length);
  }
  return true;
}

function publicUrl(hash) {
  const path = hash || "#/";
  const native = isNativeApp();
  if (native) return `https://rangeroadtech.com/demos/reverse-auction/${path}`;
  let base = location.pathname;
  if (base.endsWith(".html")) base = base.replace(/[^/]+$/, "");
  else if (!base.endsWith("/")) base = `${base}/`;
  return `${location.origin}${base}${path}`;
}

function shareBits(url, text) {
  return {
    url,
    text,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    x: `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
  };
}

function shareRow(url, text) {
  const share = shareBits(url, text);
  const native = typeof navigator !== "undefined" && typeof navigator.share === "function";
  return `<div class="share-row">
    <a class="btn small" target="_blank" rel="noopener noreferrer" href="${esc(share.facebook)}">Facebook</a>
    <a class="btn small" target="_blank" rel="noopener noreferrer" href="${esc(share.x)}">X</a>
    <button type="button" class="btn small" data-action="copy" data-url="${esc(share.url)}">Copy link</button>
    ${native ? `<button type="button" class="btn small" data-action="native-share" data-url="${esc(share.url)}" data-text="${esc(share.text)}">Share…</button>` : ""}
  </div>`;
}

function toast(text) {
  ui.toast = text;
  const node = document.getElementById("toast");
  if (node) node.textContent = text;
  else render();
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
  ui.resetArmed = false;
  ui.notifOpen = false;
  persist();
  if (location.hash !== "#/") location.hash = "#/";
  render();
  toast("Sample data restored");
}

function makeSimUser(listing) {
  state.simSerial = (state.simSerial || 0) + 1;
  const audience = audienceById(listing.audienceId);
  const cities = [
    ["Calgary", "Alberta", "T2P 1A1"],
    ["Edmonton", "Alberta", "T5J 0N3"],
    ["Red Deer", "Alberta", "T4N 1X2"],
    ["Lethbridge", "Alberta", "T1J 2B4"],
  ];
  const [city, region, postal] = cities[state.simSerial % cities.length];
  const user = {
    id: `sim-${state.simSerial}`,
    switchable: false,
    simulated: true,
    role: "buyer",
    buyerType: audience?.buyers[0] || "retailer",
    name: `Sample bidder ${state.simSerial}`,
    company: "Pitch audience",
    city,
    region,
    country: "Canada",
    address1: `${120 + state.simSerial} Demo Avenue`,
    address2: "",
    postal,
    approved: true,
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
      render();
      return;
    }
    addSampleBid(listing, "step");
    render();
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
      unitPrice: book.clockPrice,
      quantity: fill.quantity,
      bonusOff,
      shippingCost: method.cost,
      insuranceRate: listing.insuranceRate,
      insuranceMin: listing.insuranceMin,
      warrantyPerUnit: warranty,
    });
    return { fill, bid, buyer, method, reward: bonusOff ? reward : null, bill };
  });
}

function notifyMatches(listing) {
  for (const wish of state.wishes) {
    if (!wish.notify || wish.userId === listing.sellerId) continue;
    if (!wishMatches(listing, wish)) continue;
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
  render({ tour: true });
}

function startTour() {
  markTourSeen();
  ui.welcome = false;
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
  else render();
}

function mark() {
  return `<svg class="mark" width="42" height="42" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#172033"/><path d="M14 20h36L32 38 14 20z" fill="#c9853a"/><path d="M22 42h20M26 48h12" stroke="#f4efe6" stroke-width="3" stroke-linecap="round"/></svg>`;
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
  const step = ui.tour ? TOUR[ui.tour.step] : null;
  const groups = [
    ["Sellers", state.users.filter((row) => row.switchable && row.role === "seller")],
    ["Buyers", state.users.filter((row) => row.switchable && row.role === "buyer")],
  ];
  const notes = state.notifications.filter((note) => note.userId === user.id);
  return `<div class="shell">
    <header class="topbar">
      <div class="topbar-main">
        <a class="brand" href="#/">${mark()}<span><span class="brand-name">Reverse Auction Marketing</span></span></a>
        <div class="top-actions">
          <div class="role" data-tour="role">
            <span class="role-label"><label for="role-switch">You are viewing as</label> ${info("You are viewing as", "Pick a sample person. There is no password. Example: Jordan Blake owns a shop and can bid on Canadian wholesale lots. Morgan Hale is the wholesaler who listed most of them.")}</span>
            <select id="role-switch" aria-label="You are viewing as">
              ${groups.map(([label, rows]) => `<optgroup label="${label}">${rows.map((row) => `<option value="${esc(row.id)}"${row.id === user.id ? " selected" : ""}>${esc(row.name)} · ${esc(row.company)} · ${esc(row.role === "seller" ? SELLER_LABEL[row.sellerType] : BUYER_LABEL[row.buyerType])}</option>`).join("")}</optgroup>`).join("")}
            </select>
          </div>
          <div class="notif-pop">
            <button type="button" class="icon-btn" data-action="notifs" aria-expanded="${ui.notifOpen ? "true" : "false"}">Alerts${unread.length ? `<span class="count">${unread.length}</span>` : ""}</button>
            ${ui.notifOpen ? `<div class="notif-list">${notes.length ? notes.map((note) => `<a class="${note.read ? "" : "unread"}" href="#/listing/${esc(note.listingId)}" data-action="read-note" data-id="${esc(note.id)}"><strong>${esc(note.title)}</strong><br />${esc(note.body)}</a>`).join("") : `<p>No alerts yet. A buyer is notified when a wish matches a new lot.</p>`}${notes.some((note) => !note.read) ? `<button type="button" class="btn small" data-action="read-all">Mark all read</button>` : ""}</div>` : ""}
          </div>
          <button type="button" class="icon-btn" data-action="tour-start">Take the tour</button>
          <div class="reset-pop">
            ${ui.resetArmed ? `<div class="reset-confirm"><p>Restore the original sample lots and bids?</p><button type="button" class="btn small primary" data-action="reset-confirm">Reset demo</button> <button type="button" class="btn small" data-action="reset-cancel">Cancel</button></div>` : `<button type="button" class="icon-btn" data-action="reset-arm">Reset demo</button>`}
          </div>
        </div>
      </div>
      <p class="prototype">Prototype for a live demonstration · Sample sellers, buyers, and bids · No real payments or shipments</p>
      <nav class="nav" aria-label="Demo">${nav.map(([name, href, label]) => `<a class="${name === "how" ? "nav-how" : ""}" href="${href}"${route.name === name ? ' aria-current="page"' : ""}>${label}</a>`).join("")}</nav>
    </header>
    <main id="main">${body}</main>
    <footer class="foot">
      <p>Platform developed by ${developerSiteLink()}.</p>
      <p>Illustrative fees and profit figures are not a quote. Nothing on this demo charges a card or books a shipment.</p>
    </footer>
  </div>
  <div id="toast" class="toast" role="status">${esc(ui.toast)}</div>
  ${ui.welcome ? `<div class="tour-backdrop"><div class="welcome" role="dialog" aria-labelledby="welcome-title">
    <p class="kicker">First visit</p>
    <h2 id="welcome-title">See how a lot gets cheaper</h2>
    <p>The price starts high. It drops as more units are claimed. Everyone who gets one pays that same final price. Nothing here is a real payment.</p>
    <div class="btn-row">
      <button type="button" class="btn primary" data-action="tour-start">Take the tour</button>
      <button type="button" class="btn" data-action="tour-dismiss">Skip for now</button>
      <button type="button" class="btn" data-action="tour-read">Read how it works</button>
    </div>
  </div></div>` : ""}
  ${step ? `<div id="tour-ring" class="tour-ring" hidden></div>
    <div class="tour-card" role="dialog" aria-labelledby="tour-title">
      <p class="kicker">Step ${ui.tour.step + 1} of ${TOUR.length}</p>
      <h2 id="tour-title">${esc(step.title)}</h2>
      <p>${esc(step.body)}</p>
      <div class="btn-row">
        <button type="button" class="btn" data-action="tour-back"${ui.tour.step === 0 ? " disabled" : ""}>Back</button>
        <button type="button" class="btn primary" data-action="tour-next">${ui.tour.step === TOUR.length - 1 ? "Done" : "Next"}</button>
        <button type="button" class="btn" data-action="tour-skip">Close tour</button>
      </div>
    </div>` : ""}`;
}

function unique(key) {
  return [...new Set(state.listings.map((listing) => listing[key]))].sort((a, b) => a.localeCompare(b));
}

function selectOptions(values, current, anyLabel) {
  return [`<option value="">${esc(anyLabel)}</option>`].concat(values.map((value) => `<option value="${esc(value)}"${value === current ? " selected" : ""}>${esc(value)}</option>`)).join("");
}

function howView() {
  return `<h1 class="page-title">How it works</h1>
    ${screenHelp("The price starts high, drops as more units are claimed, and everyone pays the final price.", "Read this once, then open Shop towel cases and press Play the price clock. You can also take the tour from the header.")}
    <div class="guide">
      <section class="panel">
        <h2>The price falls as the lot fills</h2>
        <p>A seller offers a set of the same item. The price starts at the top. Each time more units are claimed, the price can step down. When the sale ends, everyone who got units pays that one lowest price. You never pay more than the most you offered.</p>
      </section>
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
      <section class="panel">
        <h2>What a seller sets</h2>
        <p>How many units, how they are packed, the high price, the lowest price they will take, and the steps in between. Also when it starts, how long it runs, who may buy, where it ships, the shipping choices, the warranty, and an optional thank-you for the first bidder if the lot sells out at the lowest price. The seller’s own cost is private. There is no fee to list.</p>
      </section>
      <section class="panel">
        <h2>What a buyer does</h2>
        <p>Look through the catalogue. Check the lowest price before you bid. Enter a quantity and the most you will pay. Shipping and insurance are shown first, then added to the final price. You can also list what you want. Sellers see how many people asked, and you can be told when a match is listed.</p>
      </section>
      <section class="panel">
        <h2>Why both sides use it</h2>
        <p>Buyers pool their orders and are not afraid of overpaying: the price only goes down, and never above the max they set. Sellers move a group of units at once, choose who they sell to, and can check the profit before they publish.</p>
        <p><button type="button" class="btn" data-action="tour-start">Take the tour</button></p>
      </section>
    </div>`;
}

function catalogue() {
  const rows = filtered();
  const wholesale = state.listings.filter((listing) => listing.audienceId === "wh-retail").length;
  return `<h1 class="page-title">Catalogue</h1>
    ${screenHelp(`Most of these ${state.listings.length} lots are wholesale goods for shops (${wholesale} of them).`, "Each card is one lot. Live cards show the price now, how many are left, the time left, and the next lower price. Use the filters to narrow by maker, brand, model, or seller.")}
    <aside class="start-here" data-tour="start">
      <p><strong>Start here.</strong> Open the shop-towel lot and press Play the price clock. The price starts at $100 and steps down toward $70.</p>
      <div class="btn-row"><a class="btn small primary" href="#/listing/lot-example">Open shop towels</a><a class="btn small" href="#/how">How it works</a></div>
    </aside>
    <div class="filters">
      ${fieldBlock({ id: "filter-q", label: "Search", hint: "Type a name, brand, or seller.", tip: "What to enter: any word from the title, brand, model, or seller. Example: Millhouse. Why it matters: it hides lots that do not match.", control: `<input id="filter-q" data-filter="q" value="${esc(ui.q)}" placeholder="Brand, model, seller…" />` })}
      ${fieldBlock({ id: "filter-manufacturer", label: "Manufacturer", hint: "The company that made the goods.", tip: "What to choose: a maker, or All. Example: Millhouse Paper. Why it matters: the catalogue is indexed by maker, brand, and model.", control: `<select id="filter-manufacturer" data-filter="manufacturer">${selectOptions(unique("manufacturer"), ui.manufacturer, "All")}</select>` })}
      ${fieldBlock({ id: "filter-brand", label: "Brand", hint: "The name printed on the goods.", tip: "What to choose: a brand, or All. Example: MedPro. Why it matters: buyers often search by the brand they already stock.", control: `<select id="filter-brand" data-filter="brand">${selectOptions(unique("brand"), ui.brand, "All")}</select>` })}
      ${fieldBlock({ id: "filter-model", label: "Model", hint: "The model code.", tip: "What to choose: a model, or All. Example: GL-200. Why it matters: a wish list can match this exact model.", control: `<select id="filter-model" data-filter="model">${selectOptions(unique("model"), ui.model, "All")}</select>` })}
      ${fieldBlock({ id: "filter-sellerType", label: "Seller type", hint: "Who is selling.", tip: "What to choose: Manufacturer, Wholesaler, Retailer, Individual, or All. Example: Wholesaler. Why it matters: the audience rules depend on the seller.", control: `<select id="filter-sellerType" data-filter="sellerType"><option value="">All</option>${Object.entries(SELLER_LABEL).map(([key, label]) => `<option value="${key}"${ui.sellerType === key ? " selected" : ""}>${label}</option>`).join("")}</select>` })}
      ${fieldBlock({ id: "filter-status", label: "Status", hint: "Live, not started, or finished.", tip: "What to choose: Live to bid now, Upcoming to see a future start, or Closed to see a finished sale. Example: Live. Why it matters: only a live lot has a moving price.", control: `<select id="filter-status" data-filter="status"><option value="">All</option>${[["live", "Live"], ["upcoming", "Upcoming"], ["closed", "Closed"]].map(([key, label]) => `<option value="${key}"${ui.status === key ? " selected" : ""}>${label}</option>`).join("")}</select>` })}
    </div>
    ${rows.length ? `<div class="grid" data-tour="catalogue">${rows.map(card).join("")}</div>` : `<p class="empty" data-tour="catalogue">No lots match. Clear the search and filters, or <a href="#/listing/lot-example">open the shop-towel lot</a> and press Play the price clock.</p>`}`;
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
    const blob = [listing.title, listing.brand, listing.manufacturer, listing.model, listing.description, seller?.company].join(" ").toLowerCase();
    return blob.includes(q);
  }).sort((a, b) => {
    const diff = rank(a) - rank(b);
    if (diff) return diff;
    if (a.example !== b.example) return a.example ? -1 : 1;
    return a.start - b.start;
  });
}

function rank(listing) {
  const phase = phaseOf(listing);
  const phaseRank = phase === "live" ? 0 : phase === "upcoming" ? 1 : 2;
  return phaseRank * 2 + (listing.audienceId === "wh-retail" ? 0 : 1);
}

function card(listing) {
  const seller = userById(listing.sellerId);
  const audience = audienceById(listing.audienceId);
  const phase = phaseOf(listing);
  const book = bookOf(listing);
  const upcoming = nextStep(listing.schedule, book.units);
  const rating = averageStars(listing.sellerId);
  const left = listing.quantity - book.units;
  const facts = phase === "live"
    ? `<div><dt>Left</dt><dd>${left} of ${listing.quantity}</dd></div>
       <div><dt>Time left</dt><dd><time data-clock data-phase="live" data-start="${listing.start}" data-end="${listing.end}">${esc(clockText("live", listing.start, listing.end))}</time></dd></div>
       <div><dt>Now</dt><dd>${money(book.clockPrice)}</dd></div>
       <div><dt>Next step</dt><dd>${upcoming ? `${money(upcoming.price)} at ${upcoming.qty}` : "Floor"}</dd></div>`
    : phase === "upcoming"
      ? `<div><dt>Opens</dt><dd>${esc(stamp(listing.start))}</dd></div>
         <div><dt>Closes</dt><dd>${esc(stamp(listing.end))}</dd></div>
         <div><dt>Quantity</dt><dd>${listing.quantity}</dd></div>
         <div><dt>Start / floor</dt><dd>${money(listing.schedule[0].price)} / ${money(listing.floorPrice)}</dd></div>`
      : `<div><dt>Cleared</dt><dd>${money(book.clockPrice)}</dd></div>
         <div><dt>Filled</dt><dd>${book.units} of ${listing.quantity}</dd></div>
         <div><dt>Closed</dt><dd>${esc(stamp(listing.end))}</dd></div>
         <div><dt>Floor</dt><dd>${money(listing.floorPrice)}</dd></div>`;
  return `<a class="card" href="#/listing/${esc(listing.id)}">
    <div class="card-top"><p class="kicker">${esc(audience?.label || "")}</p><span class="pill ${phase}">${phase}</span></div>
    <h2>${esc(listing.title)}</h2>
    <p class="model">${esc(listing.manufacturer)} · ${esc(listing.brand)} · ${esc(listing.model)}</p>
    <p class="seller-line">${esc(seller.company)} · ${esc(SELLER_LABEL[seller.sellerType])}${rating ? ` · <span class="stars" aria-label="${rating.toFixed(1)} stars">${stars(rating)}</span>` : ""}</p>
    <p class="price">${phase === "closed" ? money(book.clockPrice) : money(phase === "live" ? book.clockPrice : listing.schedule[0].price)}</p>
    <dl class="meta">${facts}</dl>
    ${phase === "live" && canSeePending(listing) && pendingUnits(listing, book) ? `<p class="seller-line">${pendingUnits(listing, book)} units waiting below the clock</p>` : ""}
  </a>`;
}

function listingView(id) {
  const listing = findListing(id);
  if (!listing) return `<h1 class="page-title">Lot not found</h1>${screenHelp("This link is not in the sample catalogue.", "Go back and open Shop towel cases. That lot is the $100 to $70 example. Press Play the price clock.")}<p class="empty">Start here: <a href="#/listing/lot-example">open the shop-towel lot</a>.</p>`;
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
  const share = shareRow(publicUrl(`#/listing/${listing.id}`), `${listing.brand} ${listing.model} — ${listing.title} on Reverse Auction Marketing`);
  const bandHtml = bands.map((band) => {
    const on = probe >= band.from && probe <= band.to;
    const label = band.from === band.to ? `${band.from}` : `${band.from}–${band.to}`;
    return `<li class="band${on ? " on" : ""}"><span class="price">${money(band.price)}</span><span class="seller-line">${label} units</span></li>`;
  }).join("");
  const table = listing.example ? exampleTable(listing, book, isOwnListing(listing)) : "";
  return `<p class="kicker"><a href="#/">Catalogue</a> · ${esc(audience.label)}</p>
    <h1 class="page-title">${esc(listing.title)}</h1>
    ${screenHelp(listing.example ? "This is the $100 to $70 example. Press Play the price clock." : "The big price is what a filled buyer would pay right now.", "The price starts high and can only step down. Everyone who is filled pays the same final price. A bid at the current price is taken now. A lower bid waits.")}
    <p class="lede">${esc(listing.manufacturer)} · ${esc(listing.brand)} · <span class="model">${esc(listing.model)}</span> · ${esc(listing.packaging)}</p>
    <div class="listing-layout">
      <section class="clock-card" data-tour="clock">
        <div class="card-top"><span class="pill ${phase}">${phase === "live" ? "Live" : phase === "upcoming" ? "Upcoming" : "Closed"}</span><span class="seller-line">${esc(seller.company)}</span></div>
        ${phase === "live" ? `<p class="kicker">Current price</p><p class="now-price" id="clock-price">${money(book.clockPrice)}</p>` : ""}
        ${phase === "upcoming" ? `<p class="kicker">Opens at</p><p class="now-price">${money(listing.schedule[0].price)}</p>` : ""}
        ${phase === "closed" ? `<p class="kicker">Clearing price</p><p class="now-price">${money(book.clockPrice)}</p>` : ""}
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
        ${phase === "live" ? demoBar(listing, book) : ""}
        ${share}
      </section>
      <aside class="bid-card" data-tour="bid">${bidBox(listing, phase, book)}</aside>
      <section class="detail-card">
        <h2 class="section-title">Lot details</h2>
        <p>${esc(listing.description)}</p>
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
        ${table}
        <div data-tour="pending">
          <h2 class="section-title">Bids ${info("Bids on this lot", "Filled bids are in. Pending bids are waiting for a lower price. Example: a $70 bid on the shop-towel lot waits until 9 units are claimed. Why it matters: waiting bids can drop the price together and even end the sale at once.")}</h2>
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

function demoBar(listing, book) {
  const playing = ui.playing;
  const upcoming = nextStep(listing.schedule, book.units);
  const stepQty = listing.example || !upcoming ? 1 : Math.min(listing.quantity - book.units, Math.max(1, upcoming.unitsNeeded));
  return `<div class="demo-bar">
    <p><strong>Pitch controls.</strong> These sample bidders are not the person in the role switcher. ${listing.example ? "Add one unit at a time to walk the $100 → $90 → $80 → $70 clock." : `Each step adds ${stepQty} unit${stepQty === 1 ? "" : "s"} at the current price so the clock moves.`}</p>
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
    ui.bid[listing.id] = {
      quantity: 1,
      maxPrice: bookOf(listing).clockPrice,
      shippingMethodId: listing.shipping[0].id,
      extendedWarranty: false,
    };
  }
  return ui.bid[listing.id];
}

function bidBox(listing, phase, book) {
  const user = me();
  if (phase === "upcoming") return `<h2 class="section-title">Bidding opens later</h2><p class="field-hint">You can read the lowest price now. Bids open when the start time arrives.</p><p>The lowest price is ${money(listing.floorPrice)}. Shipping is quoted once the lot is live.</p>`;
  if (phase === "closed") return `<h2 class="section-title">This lot has closed</h2><p class="field-hint">No more bids. Filled buyers all pay the final price.</p><p>${book.units ? `${book.units} units sold at ${money(book.clockPrice)}.` : "No bids were filled."} ${book.soldOut ? "It sold out." : "Time ran out."}</p><p><a href="#/orders">See the orders</a></p>`;
  if (user.role !== "buyer") {
    return `<h2 class="section-title">You are viewing as the seller</h2><p class="field-hint">Sellers do not bid on their own lot.</p><p>Choose Jordan Blake under You are viewing as. Jordan runs a shop in Calgary and can bid on Canadian wholesale lots. Or press Play the price clock and watch sample bids move the price.</p>`;
  }
  const audienceOk = buyerMayEnter(listing.audienceId, user.buyerType);
  const geoOk = buyerInGeo(listing.geo, user);
  const draft = bidDraft(listing);
  const maxPrice = roundMoney(draft.maxPrice);
  const quantity = Math.max(0, Math.floor(Number(draft.quantity) || 0));
  const method = listing.shipping.find((row) => row.id === draft.shippingMethodId) || listing.shipping[0];
  const warranty = draft.extendedWarranty && listing.extended ? listing.extended.perUnit : 0;
  const atMax = orderMoney({ unitPrice: maxPrice, quantity, shippingCost: method.cost, insuranceRate: listing.insuranceRate, insuranceMin: listing.insuranceMin, warrantyPerUnit: warranty });
  const atClock = orderMoney({ unitPrice: book.clockPrice, quantity, shippingCost: method.cost, insuranceRate: listing.insuranceRate, insuranceMin: listing.insuranceMin, warrantyPerUnit: warranty });
  const immediate = maxPrice + 0.001 >= book.clockPrice && maxPrice <= listing.schedule[0].price + 0.001;
  const existing = state.bids.find((row) => row.listingId === listing.id && row.userId === user.id);
  const blocked = !audienceOk || !geoOk;
  return `<h2 class="section-title">${existing ? "Update your bid" : "Place a bid"}</h2>
    <p class="seller-line">${esc(user.company)} · ${esc(BUYER_LABEL[user.buyerType])} · ${esc(user.city)}, ${esc(user.region)}</p>
    ${user.approved ? `<p class="ok">Approved buyer for this demo.</p>` : ""}
    ${!audienceOk ? `<p class="warn">This audience is ${esc(audienceById(listing.audienceId).label)}. A ${esc(BUYER_LABEL[user.buyerType]).toLowerCase()} can't enter it.</p>` : ""}
    ${!geoOk ? `<p class="warn">The seller limited this lot to ${esc(geoText(listing.geo))}. Your profile is ${esc(user.city)}, ${esc(user.region)}, ${esc(user.country)}.</p>` : ""}
    <form data-form="bid" data-listing="${esc(listing.id)}" class="stack" autocomplete="off">
      ${fieldBlock({ id: "bid-qty", label: "Quantity", hint: "How many units you want.", tip: "What to enter: a whole number, at least 1. Example: 2. Why it matters: you might get fewer if the lot runs out. You will not pay more than your max for each unit you get.", control: `<input id="bid-qty" data-bid="${esc(listing.id)}" data-field="quantity" inputmode="numeric" type="number" min="1" step="1" value="${esc(draft.quantity)}" />` })}
      ${fieldBlock({ id: "bid-max", label: "Your maximum, per unit", hint: `Between ${money(listing.floorPrice)} and ${money(listing.schedule[0].price)}.`, tip: `What to enter: the most you will pay for one unit. Example: ${money(book.clockPrice)} is the price right now, so that bid is taken immediately. A lower number, still at least ${money(listing.floorPrice)}, waits. Why it matters: you never pay more than this, and you may pay less.`, control: `<input id="bid-max" data-bid="${esc(listing.id)}" data-field="maxPrice" inputmode="decimal" type="number" min="${listing.floorPrice}" max="${listing.schedule[0].price}" step="0.01" value="${esc(draft.maxPrice)}" />` })}
      ${fieldBlock({ id: "bid-ship", label: "Shipping", hint: "Added to the goods. Shown before you bid.", tip: "What to choose: a method the seller offers. Example: Ground. Why it matters: the cost and insurance are added after the final unit price, so you can see the total first.", control: `<select id="bid-ship" data-bid="${esc(listing.id)}" data-field="shippingMethodId">${listing.shipping.map((method) => `<option value="${esc(method.id)}"${method.id === draft.shippingMethodId ? " selected" : ""}>${esc(method.name)} · ${money(method.cost)} · ${esc(method.eta)}</option>`).join("")}</select>` })}
      ${listing.extended ? `<div class="field"><div class="check"><input id="bid-warranty" data-bid="${esc(listing.id)}" data-field="extendedWarranty" type="checkbox"${draft.extendedWarranty ? " checked" : ""} /> <span>Add ${esc(listing.extended.label)} (${money(listing.extended.perUnit)} / unit)</span> ${info("Extended warranty", `What to choose: leave it off, or add ${esc(listing.extended.label)} at ${money(listing.extended.perUnit)} per unit. Example: turn it on for one extra year. Why it matters: the cost is added to your order if you are filled.`)}</div><p class="field-hint">Optional. Added only if you are filled.</p></div>` : ""}
      <div class="quote">
        <p>${immediate ? `<span class="ok">Immediate bid.</span> Your maximum meets the current ${money(book.clockPrice)}.` : `<span class="warn">Pending bid.</span> It waits until the clock reaches ${money(maxPrice)}.`}</p>
        <p>Most the goods can cost: ${money(atMax.gross)} at your maximum.</p>
        <p>Shipping ${money(atMax.shipping)} · insurance ${money(atMax.insurance)}${warranty ? ` · warranty ${money(atMax.warranty)}` : ""}</p>
        <p><strong>Highest total ${money(atMax.total)}</strong>${immediate ? ` · about ${money(atClock.total)} if it cleared right now` : ""}</p>
        <p class="seller-line">You pay the final clearing price, never more than your maximum, plus shipping and insurance. ${esc(bonusText(listing.bonus))}</p>
      </div>
      <button class="btn primary" type="submit"${blocked ? " disabled" : ""}>${existing ? "Update bid" : immediate ? "Place immediate bid" : "Place pending bid"}</button>
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
    return `<p class="empty">${hidden ? "The seller hid the waiting bids. Your own waiting bid still shows here." : "No bids yet. If this lot is live, press Play the price clock, or place a bid if you are viewing as a buyer."}</p>`;
  }
  return `<ul class="bid-list">${visible.map((row) => {
    const bid = state.bids.find((item) => item.id === row.bidId);
    const buyer = userById(bid.userId);
    const showPrice = row.status !== "pending" || isOwnListing(listing) || bid.userId === me().id;
    return `<li><strong>${esc(buyer?.name || "Buyer")}</strong> · ${esc(buyer?.company || "")}<br />${row.quantity || bid.quantity} units · ${esc(row.status)}${showPrice ? ` · max ${money(bid.maxPrice)}` : ""} · ${esc(stamp(bid.time))}${bid.simulated ? " · sample" : ""}</li>`;
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
    ${seller ? `<p><a class="btn small" href="#/label/${esc(listing.id)}/${esc(order.buyer.id)}">Mailing label</a></p>` : ""}
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
      ${fieldBlock({ id: `stars-${listing.id}-${target.id}`, label, hint: "1 is poor, 5 is excellent.", tip: "What to choose: 1 to 5 stars. Example: 5. Why it matters: the average shows on the seller’s lots, with the comment.", control: `<select id="stars-${listing.id}-${target.id}" name="stars">${[5, 4, 3, 2, 1].map((n) => `<option value="${n}">${n} star${n > 1 ? "s" : ""}</option>`).join("")}</select>` })}
      ${fieldBlock({ id: `comment-${listing.id}-${target.id}`, label: "Comment", hint: "A sentence the other person will see.", tip: "What to enter: a short note, at least a few words. Example: The cases arrived sealed. Why it matters: ratings without a comment are not saved.", control: `<textarea id="comment-${listing.id}-${target.id}" name="comment" maxlength="280" placeholder="What should the other party know?"></textarea>` })}
      <button class="btn small primary" type="submit">Save rating</button>
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
    title: "",
    manufacturer: seller.sellerType === "manufacturer" ? seller.company : "",
    brand: "",
    model: "",
    packaging: "Case",
    description: "",
    quantity,
    startPrice,
    floorPrice,
    stepMode: "linear",
    stepCount,
    schedule: buildLinearSchedule({ startPrice, floorPrice, stepCount, quantity }),
    start: toLocalInput(Date.now() + 15 * 60 * 1000),
    hours: 24,
    audienceId: choices[0]?.id || "",
    countries: ["Canada"],
    regions: "",
    cities: "",
    shipping: [{ id: "ground", name: "Ground", cost: 12, eta: "4–7 days" }],
    insuranceRate: 2,
    insuranceMin: 1.5,
    warranty: "Manufacturer warranty, 1 year, on new sealed goods.",
    extendedLabel: "",
    extendedPerUnit: "",
    bonusType: "none",
    bonusAmount: 10,
    bonusPercent: 10,
    showPending: true,
    unitCost: "",
    expectedUnits: 10,
    expectedDays: 1,
    errors: [],
  };
}

function toLocalInput(ms) {
  const date = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function ensureSell() {
  if (!ui.sell || ui.sell.sellerId !== me().id) ui.sell = { ...blankSell(), sellerId: me().id };
  return ui.sell;
}

function sellView() {
  if (me().role !== "seller") return `<h1 class="page-title">Sell</h1>${screenHelp("Only a seller can list a lot.", "Choose Morgan Hale under You are viewing as. Morgan is the sample wholesaler. Elena lists as a manufacturer, Pat as a person, and Rene as a shop.")}<p class="empty">Start here: switch to Morgan Hale, then fill in the lot. Or <a href="#/how">read how it works</a> first.</p>`;
  const draft = ensureSell();
  const choices = audiencesForSeller(me().sellerType);
  const snapshot = sellSnapshot(draft);
  return `<h1 class="page-title">List a lot</h1>
    ${screenHelp("Set the high price, the lowest price, and who may buy. There is no fee to list.", "Buyers never see your unit cost. The price they pay starts high and can only step down. Example: 10 units, start at $100, floor at $70.")}
    ${draft.errors.length ? `<div class="errors" id="sell-errors">${draft.errors.map((error) => `<p>${esc(error)}</p>`).join("")}</div>` : ""}
    <form data-form="sell" data-tour="sell" class="form-grid" autocomplete="off" style="margin-top:12px">
      ${fieldBlock({ id: "sell-title", label: "Title", hint: "The name on the catalogue card.", tip: "What to enter: a plain product name. Example: Shop towel cases. Why it matters: this is what buyers see first.", control: `<input id="sell-title" data-sell="title" value="${esc(draft.title)}" placeholder="Shop towel cases" />` })}
      ${fieldBlock({ id: "sell-packaging", label: "Packaging", hint: "How one unit is packed.", tip: "What to enter: the pack, not the whole lot. Example: Case of 12 rolls. Why it matters: buyers bid on units, and the pack tells them what one unit is.", control: `<input id="sell-packaging" data-sell="packaging" value="${esc(draft.packaging)}" />` })}
      ${fieldBlock({ id: "sell-manufacturer", label: "Manufacturer", hint: "Who made it.", tip: "What to enter: the maker’s name. Example: Millhouse Paper. Why it matters: the catalogue can be filtered by maker.", control: `<input id="sell-manufacturer" data-sell="manufacturer" value="${esc(draft.manufacturer)}" />` })}
      ${fieldBlock({ id: "sell-brand", label: "Brand", hint: "The brand on the package.", tip: "What to enter: the brand buyers already know. Example: Millhouse. Why it matters: wish lists match on brand.", control: `<input id="sell-brand" data-sell="brand" value="${esc(draft.brand)}" />` })}
      ${fieldBlock({ id: "sell-model", label: "Model", hint: "The model code.", tip: "What to enter: the code on the carton. Example: ST-12. Why it matters: a buyer who asked for ST-12 is told when you list it.", control: `<input id="sell-model" data-sell="model" value="${esc(draft.model)}" />` })}
      ${fieldBlock({ id: "sell-quantity", label: "Quantity", hint: "How many units are for sale.", tip: "What to enter: a whole number, at least 1. Example: 10. Why it matters: the price steps are tied to how many of these units are claimed.", control: `<input id="sell-quantity" data-sell="quantity" type="number" min="1" step="1" value="${esc(draft.quantity)}" />` })}
      ${fieldBlock({ id: "sell-description", label: "Description", hint: "A sentence or two. Say if it is new and sealed.", tip: "What to enter: condition, size, and what is in the pack. Example: Bleached shop towels in sealed cases. Why it matters: buyers decide from this before they bid.", wide: true, control: `<textarea id="sell-description" data-sell="description">${esc(draft.description)}</textarea>` })}
      ${fieldBlock({ id: "sell-start", label: "Start price", hint: "The high price, before any units are claimed.", tip: "What to enter: a price above the floor. Example: 100. Why it matters: the clock opens here. Bids at this price are taken immediately.", control: `<input id="sell-start" data-sell="startPrice" type="number" min="0" step="0.01" value="${esc(draft.startPrice)}" />` })}
      ${fieldBlock({ id: "sell-floor", label: "Floor price", hint: "The lowest price you will take.", tip: "What to enter: a price below the start. Example: 70. Why it matters: the sale never goes under this. If every unit sells, this is the price everyone pays.", control: `<input id="sell-floor" data-sell="floorPrice" type="number" min="0" step="0.01" value="${esc(draft.floorPrice)}" />` })}
      <fieldset class="wide" style="border:0;padding:0;margin:0">
        <legend class="kicker">Price steps ${info("Price steps", "Linear spaces the drops evenly from the high price to the floor. Custom lets you pick the quantity for each drop. Example: drop to $90 at 2 units, $80 at 5, and $70 at 9. Why it matters: this is the clock buyers watch.")}</legend>
        <p class="field-hint">Even steps, or your own quantities.</p>
        <label class="check"><input type="radio" name="stepMode" data-sell="stepMode" value="linear"${draft.stepMode === "linear" ? " checked" : ""} /> Even steps</label>
        <label class="check"><input type="radio" name="stepMode" data-sell="stepMode" value="custom"${draft.stepMode === "custom" ? " checked" : ""} /> My own quantity thresholds</label>
        ${draft.stepMode === "linear" ? fieldBlock({ id: "sell-steps", label: "Number of downward steps", hint: "How many times the price drops.", tip: "What to enter: 1 to 12. Example: 3 drops $100 toward $70. Why it matters: more steps mean smaller drops.", control: `<input id="sell-steps" data-sell="stepCount" type="number" min="1" max="12" step="1" value="${esc(draft.stepCount)}" />` }) : stepEditor(draft)}
      </fieldset>
      <div class="wide">${schedulePreview(draft)}</div>
      ${fieldBlock({ id: "sell-start-time", label: "Start time", hint: "When bids can begin.", tip: "What to enter: a date and time. Example: 15 minutes from now. Why it matters: before this, buyers can look but not bid. After it starts, the length cannot be changed unless the lot sells out.", control: `<input id="sell-start-time" data-sell="start" type="datetime-local" value="${esc(draft.start)}" />` })}
      ${fieldBlock({ id: "sell-hours", label: "Duration in hours", hint: "How long the sale stays open.", tip: "What to enter: hours, from 0.5 to 336. Example: 24 for one day. Why it matters: the sale ends when this time is up, or sooner if every unit is claimed.", control: `<input id="sell-hours" data-sell="hours" type="number" min="0.5" max="336" step="0.5" value="${esc(draft.hours)}" />` })}
      <fieldset class="wide" style="border:0;padding:0">
        <legend class="kicker">Who can buy ${info("Who can buy", "There are seven choices, depending on who you are. A wholesaler can sell to shops only, or to people. A manufacturer can sell to wholesalers, to shops, or to people. Example: Wholesaler to retailer only. Why it matters: other buyer types will see the lot but cannot bid.")}</legend>
        <p class="field-hint">Switch seller in the header to see the other choices.</p>
        ${choices.map((choice) => `<label class="check"><input type="radio" name="audience" data-sell="audienceId" value="${esc(choice.id)}"${draft.audienceId === choice.id ? " checked" : ""} /> ${esc(choice.label)}</label>`).join("")}
        <p class="seller-line">The seven audiences in the concept are split by seller type. Switch seller in the header to see the others. A retailer seller sees Retailer → Individual. A manufacturer sees the three manufacturer audiences.</p>
      </fieldset>
      <fieldset class="wide" style="border:0;padding:0">
        <legend class="kicker">Where it can ship ${info("Where it can ship", "Leave the countries unchecked for no country limit. Example: check Canada only, and type Alberta if you want just that province. Why it matters: a buyer outside the area cannot bid.")}</legend>
        <p class="field-hint">Leave both countries unchecked for no country limit.</p>
        ${["Canada", "United States"].map((country) => `<label class="check"><input type="checkbox" data-sell="country" value="${esc(country)}"${draft.countries.includes(country) ? " checked" : ""} /> ${esc(country)}</label>`).join("")}
        <div class="form-grid">
          ${fieldBlock({ id: "sell-regions", label: "Provinces or states", hint: "Optional. Separate with commas.", tip: "What to enter: names, or leave blank. Example: Alberta. Why it matters: a blank list does not limit the province.", control: `<input id="sell-regions" data-sell="regions" value="${esc(draft.regions)}" placeholder="Alberta" />` })}
          ${fieldBlock({ id: "sell-cities", label: "Cities", hint: "Optional. Separate with commas.", tip: "What to enter: city names, or leave blank. Example: Calgary. Why it matters: a blank list does not limit the city.", control: `<input id="sell-cities" data-sell="cities" value="${esc(draft.cities)}" />` })}
        </div>
      </fieldset>
      <div class="wide stack">
        <p class="kicker">Shipping methods ${info("Shipping", "Buyers see these choices before they bid. Example: Ground, $12, 4–7 days. Why it matters: shipping is added on top of the final unit price. It is not part of your profit in the calculator.")}</p>
        <p class="field-hint">At least one method. The buyer picks one.</p>
        ${draft.shipping.map((method, index) => `<div class="ship-row">
          ${fieldBlock({ id: `ship-${index}-name`, label: "Method", hint: "A name the buyer will recognize.", tip: "What to enter: Ground or Express. Example: Ground. Why it matters: this is the label on the bid form.", control: `<input id="ship-${index}-name" data-ship="${index}" data-ship-field="name" value="${esc(method.name)}" />` })}
          ${fieldBlock({ id: `ship-${index}-cost`, label: "Cost", hint: "What the buyer pays to ship.", tip: "What to enter: a dollar amount, zero or more. Example: 12. Why it matters: it is added to the order, with insurance.", control: `<input id="ship-${index}-cost" data-ship="${index}" data-ship-field="cost" type="number" min="0" step="0.01" value="${esc(method.cost)}" />` })}
          ${fieldBlock({ id: `ship-${index}-eta`, label: "Timing", hint: "How long delivery usually takes.", tip: "What to enter: a short range. Example: 4–7 days. Why it matters: buyers see it before they bid.", control: `<input id="ship-${index}-eta" data-ship="${index}" data-ship-field="eta" value="${esc(method.eta)}" />` })}
          <button type="button" class="btn small" data-action="remove-ship" data-index="${index}"${draft.shipping.length === 1 ? " disabled" : ""}>Remove</button>
        </div>`).join("")}
        <button type="button" class="btn small" data-action="add-ship">Add a method</button>
      </div>
      ${fieldBlock({ id: "sell-insure", label: "Insurance percent", hint: "A percent of the goods, paid by the buyer.", tip: "What to enter: a percent. Example: 2 means 2%. Why it matters: insurance is added to the order, on top of shipping.", control: `<input id="sell-insure" data-sell="insuranceRate" type="number" min="0" step="0.1" value="${esc(draft.insuranceRate)}" />` })}
      ${fieldBlock({ id: "sell-insure-min", label: "Insurance minimum", hint: "The least the buyer pays for insurance.", tip: "What to enter: a dollar amount. Example: 1.50. Why it matters: small orders still have a minimum cover charge.", control: `<input id="sell-insure-min" data-sell="insuranceMin" type="number" min="0" step="0.01" value="${esc(draft.insuranceMin)}" />` })}
      ${fieldBlock({ id: "sell-warranty", label: "Warranty", hint: "The maker’s warranty, in plain words.", tip: "What to enter: what is covered and for how long. Example: Manufacturer warranty, 1 year, on new sealed goods. Why it matters: buyers see this before they bid.", wide: true, control: `<textarea id="sell-warranty" data-sell="warranty">${esc(draft.warranty)}</textarea>` })}
      ${fieldBlock({ id: "sell-ext-name", label: "Optional extra warranty", hint: "Leave blank if you do not offer one.", tip: "What to enter: the name of a third-party plan. Example: Third-party 1-year extension. Why it matters: buyers can add it per unit when they bid.", control: `<input id="sell-ext-name" data-sell="extendedLabel" value="${esc(draft.extendedLabel)}" placeholder="Third-party 1-year extension" />` })}
      ${fieldBlock({ id: "sell-ext-price", label: "Extra warranty price per unit", hint: "Charged only if the buyer adds it.", tip: "What to enter: dollars per unit. Example: 4. Why it matters: it is added to that buyer’s order, not to the unit price.", control: `<input id="sell-ext-price" data-sell="extendedPerUnit" type="number" min="0" step="0.01" value="${esc(draft.extendedPerUnit)}" />` })}
      ${fieldBlock({ id: "sell-bonus", label: "First-bidder bonus", hint: "Pays only if the lot sells out at the floor.", tip: "What to choose: none, one unit free, a fixed amount off, or an extra percent off. Example: $15 off. Why it matters: it rewards the earliest bid when the sale reaches the lowest price and sells out.", control: `<select id="sell-bonus" data-sell="bonusType"><option value="none"${draft.bonusType === "none" ? " selected" : ""}>None</option><option value="free-unit"${draft.bonusType === "free-unit" ? " selected" : ""}>First unit free if it sells out at the floor</option><option value="amount"${draft.bonusType === "amount" ? " selected" : ""}>Fixed amount off</option><option value="percent"${draft.bonusType === "percent" ? " selected" : ""}>Extra percent off</option></select>` })}
      ${draft.bonusType === "amount" ? fieldBlock({ id: "sell-bonus-amt", label: "Bonus amount", hint: "Dollars off the first bidder’s goods.", tip: "What to enter: a dollar amount. Example: 15. Why it matters: it is subtracted from that buyer’s merchandise if the bonus pays.", control: `<input id="sell-bonus-amt" data-sell="bonusAmount" type="number" min="0" step="0.01" value="${esc(draft.bonusAmount)}" />` }) : ""}
      ${draft.bonusType === "percent" ? fieldBlock({ id: "sell-bonus-pct", label: "Bonus percent", hint: "Extra percent off the first bidder’s goods.", tip: "What to enter: a percent. Example: 10. Why it matters: it comes off that buyer’s merchandise only if the lot sells out at the floor.", control: `<input id="sell-bonus-pct" data-sell="bonusPercent" type="number" min="0" step="1" value="${esc(draft.bonusPercent)}" />` }) : ""}
      <div class="field wide"><div class="check"><input id="sell-pending" data-sell="showPending" type="checkbox"${draft.showPending ? " checked" : ""} /> <span>Show buyers how many units are waiting</span> ${info("Show waiting bids", "What to choose: on or off. Example: leave it on so buyers see “6 units waiting”. Why it matters: you can hide the count. Buyers still see their own bid.")}</div><p class="field-hint">You always see the count. Buyers see it only if this is on.</p></div>
      ${fieldBlock({ id: "sell-cost", label: "Private unit cost", hint: "Only you see this. Buyers never do.", tip: "What to enter: what one unit cost you. Example: 50. Why it matters: the profit calculator uses it. It is not shown on the catalogue.", control: `<input id="sell-cost" data-sell="unitCost" type="number" min="0" step="0.01" value="${esc(draft.unitCost)}" placeholder="Only you see this" />` })}
      ${fieldBlock({ id: "sell-units", label: "Expected units for the snapshot", hint: "How many you think will sell.", tip: "What to enter: a number up to the quantity. Example: 10 if you expect a full sale. Why it matters: the small profit note on this form uses it. The full calculator can compare other guesses.", control: `<input id="sell-units" data-sell="expectedUnits" type="number" min="0" step="1" value="${esc(draft.expectedUnits)}" />` })}
      ${fieldBlock({ id: "sell-days", label: "Expected days", hint: "How long you think the sale will take.", tip: "What to enter: days, such as 1. Example: 1 for the shop-towel story. Why it matters: profit per day divides the profit by these days.", control: `<input id="sell-days" data-sell="expectedDays" type="number" min="0.25" step="0.25" value="${esc(draft.expectedDays)}" />` })}
      <div class="wide">${snapshot}</div>
      <div class="wide"><button class="btn primary" type="submit">Publish listing</button></div>
    </form>`;
}

function stepEditor(draft) {
  return `<div class="stack"><p class="field-hint">The first row is the start price, at zero units. The last row is the floor. Example: quantity 2 at $90.</p>${draft.schedule.map((row, index) => `<div class="step-row">
      ${fieldBlock({ id: `step-${index}-qty`, label: index === 0 ? "Starting quantity" : "At quantity", hint: index === 0 ? "Stays at 0. The high price applies before any sale." : "Units claimed before this price applies.", tip: index === 0 ? "Leave this at 0. Example: 0 units means the sale has not started filling. Why it matters: the clock opens at the start price." : "What to enter: a higher quantity than the row above. Example: 2, then 5, then 9. Why it matters: this is when the price drops.", control: `<input id="step-${index}-qty" data-step="${index}" data-step-field="qty" type="number" min="0" step="1" value="${esc(row.qty)}"${index === 0 ? " disabled" : ""} />` })}
      ${fieldBlock({ id: `step-${index}-price`, label: "Price", hint: "Lower than the row above.", tip: "What to enter: the unit price at this quantity. Example: 90. Why it matters: every filled buyer pays the price for the final quantity, not the price on their own row.", control: `<input id="step-${index}-price" data-step="${index}" data-step-field="price" type="number" min="0" step="0.01" value="${esc(row.price)}" />` })}
      ${index > 0 && index < draft.schedule.length - 1 ? `<button type="button" class="btn small" data-action="remove-step" data-index="${index}">Remove</button>` : `<span></span>`}
    </div>`).join("")}
    <button type="button" class="btn small" data-action="add-step">Add a threshold</button></div>`;
}

function schedulePreview(draft) {
  const quantity = Math.floor(Number(draft.quantity)) || 0;
  const errors = validateSchedule(draft.schedule, { startPrice: Number(draft.startPrice), floorPrice: Number(draft.floorPrice), quantity });
  if (errors.length || quantity < 1) return `<div class="preview-table"><p class="warn">${esc(errors[0] || "Set a quantity and a price range to preview the clock.")}</p></div>`;
  const bands = priceBands(draft.schedule, quantity);
  return `<table class="preview-table"><thead><tr><th>Units filled</th><th>Clock price</th></tr></thead><tbody>${bands.map((band) => `<tr><td>${band.from === band.to ? band.from : `${band.from}–${band.to}`}</td><td>${money(band.price)}</td></tr>`).join("")}</tbody></table>`;
}

function sellSnapshot(draft) {
  const quantity = Math.floor(Number(draft.quantity)) || 0;
  const errors = validateSchedule(draft.schedule, { startPrice: Number(draft.startPrice), floorPrice: Number(draft.floorPrice), quantity });
  if (errors.length || draft.unitCost === "" || !(Number(draft.unitCost) >= 0)) {
    return `<div class="private"><strong>Private snapshot.</strong> Enter a unit cost and a valid clock to see an illustrative profit. The full comparison, sensitivity, and capital view are on the calculator after you publish.</div>`;
  }
  const projection = projectSale({
    unitCost: Number(draft.unitCost),
    schedule: draft.schedule,
    quantity,
    expectedUnits: Number(draft.expectedUnits),
    expectedDays: Number(draft.expectedDays),
  });
  return `<div class="private"><strong>Illustrative, only you see this.</strong> At ${projection.units} units the clock would be ${money(projection.clearingPrice)}. Profit after the sample fee is ${money(projection.profit)} · ${money(projection.profitPerDay)} per day. Fee ${money(projection.fees)} (${pct(projection.feeRate)}). No listing fee.</div>`;
}

function syncLinear(draft) {
  const start = Number(draft.startPrice);
  const floor = Number(draft.floorPrice);
  const quantity = Math.floor(Number(draft.quantity));
  const stepCount = Math.max(1, Math.floor(Number(draft.stepCount) || 1));
  draft.stepCount = stepCount;
  if (start > floor && quantity >= 1) {
    draft.schedule = buildLinearSchedule({ startPrice: start, floorPrice: floor, stepCount, quantity });
  }
}

function publish() {
  const draft = ensureSell();
  const quantity = Math.floor(Number(draft.quantity));
  const schedule = draft.stepMode === "linear"
    ? buildLinearSchedule({ startPrice: Number(draft.startPrice), floorPrice: Number(draft.floorPrice), stepCount: Number(draft.stepCount), quantity })
    : draft.schedule.map((row) => ({ qty: Math.floor(Number(row.qty)), price: roundMoney(row.price) }));
  if (draft.stepMode === "custom" && schedule.length) {
    schedule[0] = { qty: 0, price: roundMoney(draft.startPrice) };
    schedule[schedule.length - 1] = { ...schedule[schedule.length - 1], price: roundMoney(draft.floorPrice) };
  }
  draft.schedule = schedule;
  const errors = [];
  if (!draft.title.trim()) errors.push("Add a title.");
  if (!draft.manufacturer.trim() || !draft.brand.trim() || !draft.model.trim()) errors.push("Manufacturer, brand, and model are how the catalogue is indexed.");
  if (!draft.packaging.trim()) errors.push("Describe the packaging.");
  if (!(quantity >= 1)) errors.push("Quantity has to be at least 1.");
  errors.push(...validateSchedule(schedule, { startPrice: Number(draft.startPrice), floorPrice: Number(draft.floorPrice), quantity }));
  const startMs = new Date(draft.start).getTime();
  if (!Number.isFinite(startMs)) errors.push("Choose a start time.");
  const hours = Number(draft.hours);
  if (!(hours >= 0.5) || hours > 336) errors.push("Duration has to be between 30 minutes and 14 days.");
  const audience = audienceById(draft.audienceId);
  if (!audience || audience.sellerType !== me().sellerType) errors.push("Choose an audience that matches your seller type.");
  if (!draft.shipping.length || draft.shipping.some((method) => !String(method.name).trim() || !(Number(method.cost) >= 0))) errors.push("Each shipping method needs a name and a cost.");
  if (draft.unitCost === "" || !(Number(draft.unitCost) >= 0)) errors.push("Enter your private unit cost. Buyers never see it.");
  if (!draft.warranty.trim()) errors.push("State the warranty.");
  draft.errors = errors;
  if (errors.length) {
    render({ scroll: "errors" });
    return;
  }
  let bonus = { type: "none" };
  if (draft.bonusType === "free-unit") bonus = { type: "free-unit" };
  if (draft.bonusType === "amount") bonus = { type: "amount", amount: roundMoney(draft.bonusAmount) };
  if (draft.bonusType === "percent") bonus = { type: "percent", percent: Number(draft.bonusPercent) || 0 };
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
    end: startMs + hours * 60 * 60 * 1000,
    audienceId: draft.audienceId,
    unitCost: roundMoney(draft.unitCost),
    geo: {
      countries: [...draft.countries],
      regions: splitList(draft.regions),
      cities: splitList(draft.cities),
    },
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
  if (tweak.keep) {
    start = schedule[0].price;
    floor = schedule[schedule.length - 1].price;
  }
  const durationDays = Math.max(0.5, (listing.end - listing.start) / 86400000);
  return {
    name: tweak.name,
    blurb: tweak.blurb || "",
    startPrice: start,
    floorPrice: floor,
    stepCount,
    quantity: listing.quantity,
    unitCost: listing.unitCost,
    expectedUnits: Math.max(0, Math.round(listing.quantity * (tweak.fill ?? 1))),
    expectedDays: tweak.days != null ? tweak.days : (listing.example ? 1 : Math.round(durationDays * 10) / 10),
    schedule,
    unsold: false,
  };
}

function makeCalc(listingId, source) {
  const listing = findListing(listingId);
  const columns = source === "addendum"
    ? ADDENDUM_STRATEGIES.map((strategy) => ({
      name: strategy.name,
      blurb: strategy.blurb,
      startPrice: strategy.schedule[0].price,
      floorPrice: strategy.schedule[strategy.schedule.length - 1].price,
      stepCount: strategy.schedule.length - 1,
      quantity: strategy.quantity,
      unitCost: strategy.unitCost,
      expectedUnits: strategy.expectedUnits,
      expectedDays: strategy.expectedDays,
      schedule: strategy.schedule.map((row) => ({ ...row })),
      unsold: false,
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
  if (!ui.calc || !mine.some((listing) => listing.id === ui.calc.listingId)) {
    ui.calc = makeCalc(routePick || mine[0].id);
  } else if (routePick && ui.calc.routeStamp !== routePick) {
    ui.calc = makeCalc(routePick);
  }
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
  if (me().role !== "seller") return `<h1 class="page-title">Profit calculator</h1>${screenHelp("Only the seller of a lot can open this.", "Choose Morgan Hale, Elena Voss, Pat Morgan, or Rene Alvarez under You are viewing as. Buyers never see the unit cost.")}<p class="empty">Start here: switch to Morgan, then open the shop-towel lot’s calculator.</p>`;
  const calc = ensureCalc();
  if (!calc) return `<h1 class="page-title">Profit calculator</h1>${screenHelp("The calculator needs a lot you listed.", "Publish a lot first. Then come back. The sample shop-towel lot is already on Morgan’s account.")}<p class="empty">No lot yet. <a href="#/sell">List one</a>, or switch to Morgan Hale.</p>`;
  const mine = state.listings.filter((listing) => listing.sellerId === me().id);
  return `<h1 class="page-title">Private profit calculator</h1>
    ${screenHelp("A sample estimate of the final price, profit per day, and a 20% miss. Not a forecast.", "Compare up to three setups. Your unit cost stays in this browser. There is no fee to list. The fee in the result is a sample percent of the goods, higher on small prices.")}
    <div class="calc-head" data-tour="calc">
      ${fieldBlock({ id: "calc-listing", label: "Lot", hint: "One of your listings.", tip: "What to choose: a lot you sell. Example: Shop towel cases. Why it matters: the first column starts from that lot’s prices and your private cost.", control: `<select id="calc-listing">${mine.map((listing) => `<option value="${esc(listing.id)}"${listing.id === calc.listingId ? " selected" : ""}>${esc(listing.title)}</option>`).join("")}</select>` })}
      ${fieldBlock({ id: "calc-annual", label: "Next-best alternative, annual return %", hint: "What this money could earn somewhere else.", tip: "What to enter: a yearly percent. Example: 8. Why it matters: the page turns that into dollars per day and compares it with the profit per day.", control: `<input id="calc-annual" data-calc-global="annual" type="number" min="0" step="0.5" value="${esc(calc.annual)}" />` })}
      <div class="btn-row">
        <button type="button" class="btn" data-action="calc-listing">Compare variants of this lot</button>
        <button type="button" class="btn" data-action="calc-paper">Load the three paper strategies</button>
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
    const check = sensitivityCheck({
      unitCost: Number(column.unitCost) || 0,
      schedule: column.schedule,
      quantity,
      expectedUnits: units,
      expectedDays: Number(column.expectedDays) || 0,
    });
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
    ${fieldBlock({ id: `calc-${index}-name`, label: "Configuration", hint: "A name for this column.", tip: "What to enter: a short label. Example: Faster turnover. Why it matters: you are comparing two or three ideas side by side.", control: `<input id="calc-${index}-name" data-calc="${index}" data-field="name" value="${esc(column.name)}" />` })}
    <div class="form-grid">
      ${fieldBlock({ id: `calc-${index}-start`, label: "Start", hint: "High price.", tip: "What to enter: the opening price. Example: 100. Why it matters: changing it rebuilds even steps down to the floor.", control: `<input id="calc-${index}-start" data-calc="${index}" data-field="startPrice" type="number" step="0.01" value="${esc(column.startPrice)}" />` })}
      ${fieldBlock({ id: `calc-${index}-floor`, label: "Floor", hint: "Lowest price.", tip: "What to enter: a price below the start. Example: 70. Why it matters: the estimate will not go under this.", control: `<input id="calc-${index}-floor" data-calc="${index}" data-field="floorPrice" type="number" step="0.01" value="${esc(column.floorPrice)}" />` })}
      ${fieldBlock({ id: `calc-${index}-steps`, label: "Steps", hint: "How many drops.", tip: "What to enter: 1 to 12. Example: 3. Why it matters: the preview spaces those drops across the quantity.", control: `<input id="calc-${index}-steps" data-calc="${index}" data-field="stepCount" type="number" min="1" max="12" step="1" value="${esc(column.stepCount)}" />` })}
      ${fieldBlock({ id: `calc-${index}-qty`, label: "Quantity", hint: "Units in the lot.", tip: "What to enter: at least 1. Example: 10. Why it matters: capital tied up is your cost times this quantity.", control: `<input id="calc-${index}-qty" data-calc="${index}" data-field="quantity" type="number" min="1" step="1" value="${esc(column.quantity)}" />` })}
      ${fieldBlock({ id: `calc-${index}-cost`, label: "Unit cost", hint: "Private. Only you see it.", tip: "What to enter: your cost for one unit. Example: 50. Why it matters: profit is the selling price minus this cost, then minus the sample fee.", control: `<input id="calc-${index}-cost" data-calc="${index}" data-field="unitCost" type="number" min="0" step="0.01" value="${esc(column.unitCost)}" />` })}
      ${fieldBlock({ id: `calc-${index}-units`, label: "Expected units", hint: "How many you think will sell.", tip: "What to enter: 0 up to the quantity. Example: 10. Why it matters: that quantity picks the price on the clock.", control: `<input id="calc-${index}-units" data-calc="${index}" data-field="expectedUnits" type="number" min="0" step="1" value="${esc(column.expectedUnits)}" />` })}
      ${fieldBlock({ id: `calc-${index}-days`, label: "Days", hint: "How long until it sells.", tip: "What to enter: days, at least 0.25. Example: 1. Why it matters: profit per day divides the profit by these days.", control: `<input id="calc-${index}-days" data-calc="${index}" data-field="expectedDays" type="number" min="0.25" step="0.25" value="${esc(column.expectedDays)}" />` })}
    </div>
    <div class="check"><input id="calc-${index}-unsold" data-calc="${index}" data-field="unsold" type="checkbox"${column.unsold ? " checked" : ""} /> <span>Assume it does not sell</span> ${info("Assume it does not sell", "What to choose: turn this on to see a sale that fails. Example: the patient strategy that never clears. Why it matters: profit becomes zero, but the money is still tied up.")}</div>
    <p class="field-hint">Turn this on if you want the “nothing sold” case.</p>
    ${body}
  </article>`;
}

function scheduleLine(schedule, quantity) {
  try {
    return priceBands(schedule, quantity).map((band) => `${band.from === band.to ? band.from : `${band.from}–${band.to}`} @ ${money(band.price)}`).join(" · ");
  } catch (err) {
    return "";
  }
}

function wishlistView() {
  const user = me();
  const groups = demandGroups();
  return `<h1 class="page-title">Wish list</h1>
    ${screenHelp(user.role === "buyer" ? "Write what you want and how many. Sellers see the same count." : "Buyers and sellers see the same demand counts.", "A match uses the brand and model when you fill them in. Example: MedPro and GL-200 matches the glove lot. Leave the alert on if you want a notice in the bell. Share buttons send friends to that lot.")}
    ${user.role === "buyer" ? `<form data-form="wish" class="form-grid panel" autocomplete="off" style="padding:14px;margin-bottom:16px">
      ${fieldBlock({ id: "wish-name", label: "Item", hint: "What you want to buy.", tip: "What to enter: a product name. Example: Nitrile exam gloves. Why it matters: if brand and model are blank, the name is used to look for a match.", control: `<input id="wish-name" name="name" required placeholder="Nitrile exam gloves" />` })}
      ${fieldBlock({ id: "wish-qty", label: "Quantity", hint: "How many you would buy.", tip: "What to enter: a whole number, at least 1. Example: 30. Why it matters: sellers see the total units, not only how many people asked.", control: `<input id="wish-qty" name="quantity" type="number" min="1" step="1" value="1" required />` })}
      ${fieldBlock({ id: "wish-mfr", label: "Manufacturer", hint: "Optional.", tip: "What to enter: the maker, if you know it. Example: MedPro. Why it matters: it helps you remember the item. Matching mainly uses brand and model.", control: `<input id="wish-mfr" name="manufacturer" />` })}
      ${fieldBlock({ id: "wish-brand", label: "Brand", hint: "Optional, but better for a match.", tip: "What to enter: the brand. Example: MedPro. Why it matters: a new lot with that brand can notify you.", control: `<input id="wish-brand" name="brand" />` })}
      ${fieldBlock({ id: "wish-model", label: "Model", hint: "Optional model code.", tip: "What to enter: the model. Example: GL-200. Why it matters: with the brand, this is how a listing is recognized.", control: `<input id="wish-model" name="model" />` })}
      <div class="field wide"><div class="check"><input id="wish-notify" name="notify" type="checkbox" checked /> <span>Notify me when a match is listed</span> ${info("Notify me", "What to choose: leave it checked to get an alert in the bell. Example: Jordan asked for MedPro GL-200, so the glove lot already raised an alert. Why it matters: sellers see the demand count, not a private message.")}</div><p class="field-hint">The alert shows under the bell for your sample person.</p></div>
      <div class="wide"><button class="btn primary" type="submit">Add to wish list</button></div>
    </form>` : `<p class="private">You are a seller, so this page is the demand board. Switch to a buyer, such as Jordan Blake, to add a wish.</p>`}
    <div class="orders" data-tour="wishlist">${groups.length ? groups.map((group) => {
      const match = state.listings.find((listing) => phaseOf(listing) !== "closed" && group.wishes.some((wish) => wishMatches(listing, wish)));
      const shareTarget = match ? publicUrl(`#/listing/${match.id}`) : publicUrl("#/");
      const text = match ? `${match.title} on Reverse Auction Marketing` : `Looking for ${group.units} × ${group.sample.name} on Reverse Auction Marketing`;
      return `<article class="panel">
        <div class="spread"><h2 class="section-title">${esc(group.sample.brand || group.sample.name)} ${esc(group.sample.model || "")}</h2><strong>${group.wishes.length} buyer${group.wishes.length === 1 ? "" : "s"} · ${group.units} units</strong></div>
        <p>${esc(group.sample.name)}</p>
        <ul class="bid-list">${group.wishes.map((wish) => `<li>${esc(userById(wish.userId)?.company || "Buyer")} · ${wish.quantity} units${wish.userId === user.id ? ` <button type="button" class="btn small" data-action="remove-wish" data-id="${esc(wish.id)}">Remove</button>` : ""}</li>`).join("")}</ul>
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
  return `<h1 class="page-title">Orders</h1>
    ${screenHelp(user.role === "seller" ? "Finished sales, with shipping and insurance, and a sample mailing label." : "Your filled bids, with shipping and insurance added to the final price.", "Nothing here is a real shipment. Example: the copy-paper lot is already closed, so Morgan can open a label and both sides can leave a rating. A live bid stays in the list above until the lot ends.")}
    ${liveBids.length ? `<h2 class="section-title">Live bids</h2><ul class="bid-list">${liveBids.map((bid) => {
      const listing = findListing(bid.listingId);
      const book = bookOf(listing);
      const row = settlement({ closed: false, book, bids: [bid] })[0];
      return `<li><a href="#/listing/${esc(listing.id)}">${esc(listing.title)}</a> · ${bid.quantity} units · ${esc(row.status)} · max ${money(bid.maxPrice)}</li>`;
    }).join("")}</ul>` : ""}
    <div class="orders" style="margin-top:12px">${(user.role === "seller" ? sellerOrders : buyerOrders).map(({ listing, order }) => `<div><p class="kicker">${esc(listing.title)}</p>${orderCard(listing, order)}</div>`).join("") || `<p class="empty">No filled orders yet. ${user.role === "seller" ? "The copy-paper lot is already closed if you want a label and a rating." : "Bid on a live lot, or switch to Jordan Blake to see his finished copy-paper order. To watch a price move, open the shop-towel lot and press Play the price clock."}</p>`}</div>`;
}

function labelView() {
  const listing = findListing(route.listingId);
  if (!listing) return `<h1 class="page-title">Label</h1><p class="empty">That lot is not in the sample. Go back to <a href="#/orders">Orders</a>.</p>`;
  if (me().id !== listing.sellerId) return `<h1 class="page-title">Label</h1>${screenHelp("Only the seller of this lot can open the label.", "Switch to the seller under You are viewing as. For the copy-paper lot, that is Morgan Hale.")}<p class="empty">This sample label is for the seller.</p>`;
  const order = ordersFor(listing).find((row) => row.buyer.id === route.userId);
  if (!order) return `<h1 class="page-title">Label</h1><p class="empty">That buyer was not filled on this lot, so there is no address to print.</p>`;
  const seller = userById(listing.sellerId);
  const ref = `${listing.id}-${order.buyer.id}`.toUpperCase();
  return `${screenHelp("A sample mailing label. It does not book a shipment.", "Check the ship-to address, the quantity, and the total with shipping and insurance. Example: Jordan Blake's copy-paper order. Press Print to see only the label.")}<p class="no-print"><a href="#/orders">Orders</a> · <button type="button" class="btn small primary" data-action="print">Print</button></p>
    <article class="label-sheet">
      <div class="label-banner"><strong>Reverse Auction Marketing</strong><span>SAMPLE — not a shipment</span></div>
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
  const quantity = Math.floor(Number(draft.quantity));
  const maxPrice = roundMoney(draft.maxPrice);
  const start = listing.schedule[0].price;
  if (!(quantity >= 1)) return toast("Enter a quantity of at least 1.");
  if (maxPrice < listing.floorPrice || maxPrice > start) return toast(`Your price has to sit between ${money(listing.floorPrice)} and ${money(start)}.`);
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
      id: `bid-${Date.now().toString(36)}`,
      listingId: listing.id,
      userId: user.id,
      quantity,
      maxPrice,
      time: Date.now(),
      shippingMethodId: draft.shippingMethodId,
      extendedWarranty: !!draft.extendedWarranty,
    });
  }
  persist();
  const closed = phaseOf(listing) === "closed";
  if (closed) toast("The lot sold out. Everyone filled pays the final price.");
  else if (existing) toast("Bid updated. Your original time still stands.");
  else if (immediate) toast("Immediate bid placed at the current price.");
  else toast("Pending bid placed. It clears only if the group reaches your price.");
  render();
}

function saveRating(form) {
  const comment = String(new FormData(form).get("comment") || "").trim();
  const starsValue = Math.max(1, Math.min(5, Math.round(Number(new FormData(form).get("stars")) || 5)));
  if (comment.length < 3) return toast("Add a short comment with the rating.");
  const listingId = form.dataset.listing;
  const to = form.dataset.to;
  const existing = state.ratings.find((row) => row.listingId === listingId && row.fromUserId === me().id && row.toUserId === to);
  if (existing) {
    existing.stars = starsValue;
    existing.comment = comment;
  } else {
    state.ratings.push({ id: `r-${Date.now().toString(36)}`, listingId, fromUserId: me().id, toUserId: to, stars: starsValue, comment, createdAt: Date.now() });
  }
  persist();
  toast("Rating saved");
  render();
}

function addWish(form) {
  if (me().role !== "buyer") return toast("Switch to a buyer to add a wish.");
  const data = new FormData(form);
  const name = String(data.get("name") || "").trim();
  const quantity = Math.floor(Number(data.get("quantity")));
  if (!name || !(quantity >= 1)) return toast("Name the item and a quantity.");
  state.wishes.push({
    id: `w-${Date.now().toString(36)}`,
    userId: me().id,
    name,
    manufacturer: String(data.get("manufacturer") || "").trim(),
    brand: String(data.get("brand") || "").trim(),
    model: String(data.get("model") || "").trim(),
    quantity,
    notify: !!form.querySelector("[name=notify]")?.checked,
  });
  persist();
  toast("Saved. Sellers can see the demand count.");
  render();
}

function placeTour(shouldScroll) {
  const ring = document.getElementById("tour-ring");
  if (!ui.tour || !ring) return;
  const step = TOUR[ui.tour.step];
  const target = document.querySelector(`[data-tour="${step.target}"]`);
  if (!target) {
    ring.hidden = true;
    return;
  }
  if (shouldScroll) target.scrollIntoView({ block: "start", inline: "nearest" });
  const rect = target.getBoundingClientRect();
  const pad = 8;
  ring.hidden = false;
  ring.style.top = `${Math.max(4, rect.top - pad)}px`;
  ring.style.left = `${Math.max(4, rect.left - pad)}px`;
  ring.style.width = `${Math.min(window.innerWidth - 8, rect.width + pad * 2)}px`;
  ring.style.height = `${rect.height + pad * 2}px`;
}

function closeTips() {
  document.querySelectorAll(".help .tip").forEach((node) => node.setAttribute("hidden", ""));
  document.querySelectorAll(".info").forEach((node) => node.setAttribute("aria-expanded", "false"));
}

function onClick(event) {
  const infoBtn = event.target.closest(".info");
  if (infoBtn) {
    event.preventDefault();
    event.stopPropagation();
    const tip = infoBtn.parentElement.querySelector(".tip");
    const willOpen = tip.hasAttribute("hidden");
    closeTips();
    if (willOpen) {
      tip.removeAttribute("hidden");
      infoBtn.setAttribute("aria-expanded", "true");
    }
    return;
  }
  if (!event.target.closest(".help")) closeTips();
  const el = event.target.closest("[data-action]");
  if (!el) return;
  const action = el.dataset.action;
  if (action === "developer-site") {
    if (!isNativeApp()) return;
    event.preventDefault();
    openDeveloperSite();
    return;
  }
  if (action === "tour-start") {
    startTour();
    return;
  }
  if (action === "tour-dismiss" || action === "tour-skip") {
    if (action === "tour-dismiss") {
      ui.welcome = false;
      markTourSeen();
      render();
    } else endTour();
    return;
  }
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
    else {
      ui.tour.step += 1;
      applyTourStep();
    }
    return;
  }
  if (action === "tour-back") {
    if (!ui.tour || ui.tour.step === 0) return;
    ui.tour.step -= 1;
    applyTourStep();
    return;
  }
  if (action === "notifs") {
    ui.notifOpen = !ui.notifOpen;
    ui.resetArmed = false;
    render();
    return;
  }
  if (action === "read-note") {
    const note = state.notifications.find((row) => row.id === el.dataset.id);
    if (note) note.read = true;
    ui.notifOpen = false;
    persist();
    return;
  }
  if (action === "read-all") {
    state.notifications.forEach((note) => {
      if (note.userId === me().id) note.read = true;
    });
    persist();
    render();
    return;
  }
  if (action === "reset-arm") {
    ui.resetArmed = true;
    ui.notifOpen = false;
    render();
    return;
  }
  if (action === "reset-cancel") {
    ui.resetArmed = false;
    render();
    return;
  }
  if (action === "reset-confirm") {
    resetDemo();
    return;
  }
  if (action === "copy") {
    const url = el.dataset.url;
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(() => toast("Link copied")).catch(() => toast(url));
    else toast(url);
    return;
  }
  if (action === "native-share") {
    navigator.share?.({ title: "Reverse Auction Marketing", text: el.dataset.text, url: el.dataset.url }).catch(() => {});
    return;
  }
  if (action === "print") {
    window.print();
    return;
  }
  if (action === "sim-play") {
    startPlay(el.dataset.id);
    return;
  }
  if (action === "sim-stop") {
    stopPlay();
    render();
    return;
  }
  if (action === "sim-one" || action === "sim-floor") {
    const listing = findListing(el.dataset.id);
    addSampleBid(listing, action === "sim-floor" ? "floor" : "step");
    const phase = phaseOf(listing);
    toast(phase === "closed" ? "The group bid cleared the lot." : "Sample bid added.");
    render();
    return;
  }
  if (action === "sim-end") {
    const listing = findListing(el.dataset.id);
    listing.end = Date.now() - 1000;
    stopPlay();
    persist();
    toast("Jumped to the close. Pending bids that never reached their price are rejected.");
    render();
    return;
  }
  if (action === "remove-wish") {
    state.wishes = state.wishes.filter((wish) => wish.id !== el.dataset.id);
    persist();
    render();
    return;
  }
  if (action === "add-ship") {
    ensureSell().shipping.push({ id: `ship-${Date.now().toString(36)}`, name: "Freight", cost: 20, eta: "5–8 days" });
    render();
    return;
  }
  if (action === "remove-ship") {
    const draft = ensureSell();
    if (draft.shipping.length > 1) draft.shipping.splice(Number(el.dataset.index), 1);
    render();
    return;
  }
  if (action === "add-step") {
    const draft = ensureSell();
    const schedule = draft.schedule.map((row) => ({ ...row }));
    const last = schedule[schedule.length - 1];
    const prev = schedule[schedule.length - 2];
    const quantity = Math.floor(Number(draft.quantity)) || last.qty;
    if (last.qty - prev.qty >= 2) {
      schedule.splice(schedule.length - 1, 0, { qty: Math.floor((prev.qty + last.qty) / 2), price: roundMoney((prev.price + last.price) / 2) });
    } else if (last.qty < quantity) {
      const qty = last.qty;
      last.qty = Math.min(quantity, last.qty + 1);
      schedule.splice(schedule.length - 1, 0, { qty, price: roundMoney((prev.price + last.price) / 2) });
    }
    draft.schedule = schedule;
    draft.stepMode = "custom";
    render();
    return;
  }
  if (action === "remove-step") {
    const draft = ensureSell();
    const index = Number(el.dataset.index);
    if (index > 0 && index < draft.schedule.length - 1) draft.schedule.splice(index, 1);
    render();
    return;
  }
  if (action === "calc-paper") {
    const calc = ensureCalc();
    ui.calc = makeCalc(calc.listingId, "addendum");
    ui.calc.routeStamp = route.id || calc.listingId;
    render();
    return;
  }
  if (action === "calc-listing") {
    const calc = ensureCalc();
    ui.calc = makeCalc(calc.listingId, "listing");
    ui.calc.routeStamp = route.id || calc.listingId;
    render();
  }
}

function onField(event) {
  const el = event.target;
  if (!(el instanceof HTMLElement)) return;
  if (el.id === "role-switch") {
    state.activeUserId = el.value;
    ui.sell = null;
    ui.calc = null;
    ui.notifOpen = false;
    persist();
    render();
    return;
  }
  if (el.dataset.filter) {
    ui[el.dataset.filter] = el.value;
    render();
    return;
  }
  if (el.dataset.bid) {
    const draft = ui.bid[el.dataset.bid];
    if (!draft) return;
    draft[el.dataset.field] = el.type === "checkbox" ? el.checked : el.value;
    render();
    return;
  }
  if (el.dataset.sell === "country") {
    const draft = ensureSell();
    const set = new Set(draft.countries);
    if (el.checked) set.add(el.value);
    else set.delete(el.value);
    draft.countries = [...set];
    render();
    return;
  }
  if (el.dataset.sell) {
    const draft = ensureSell();
    draft[el.dataset.sell] = el.type === "checkbox" ? el.checked : el.value;
    if (draft.stepMode === "linear" && ["startPrice", "floorPrice", "quantity", "stepCount", "stepMode"].includes(el.dataset.sell)) syncLinear(draft);
    if (draft.stepMode === "custom" && el.dataset.sell === "startPrice" && draft.schedule[0]) draft.schedule[0].price = roundMoney(el.value);
    if (draft.stepMode === "custom" && el.dataset.sell === "floorPrice") draft.schedule[draft.schedule.length - 1].price = roundMoney(el.value);
    if (el.dataset.sell === "stepMode" && el.value === "linear") syncLinear(draft);
    render();
    return;
  }
  if (el.dataset.step != null) {
    const draft = ensureSell();
    const row = draft.schedule[Number(el.dataset.step)];
    row[el.dataset.stepField] = Number(el.value);
    if (Number(el.dataset.step) === 0 && el.dataset.stepField === "price") draft.startPrice = row.price;
    if (Number(el.dataset.step) === draft.schedule.length - 1 && el.dataset.stepField === "price") draft.floorPrice = row.price;
    draft.stepMode = "custom";
    render();
    return;
  }
  if (el.dataset.ship != null) {
    const method = ensureSell().shipping[Number(el.dataset.ship)];
    method[el.dataset.shipField] = el.dataset.shipField === "cost" ? el.value : el.value;
    render();
    return;
  }
  if (el.id === "calc-listing") {
    ui.calc = makeCalc(el.value);
    const next = `#/calculator/${el.value}`;
    if (location.hash !== next) location.hash = next;
    else render();
    return;
  }
  if (el.dataset.calcGlobal) {
    const calc = ensureCalc();
    calc.annual = el.value;
    render();
    return;
  }
  if (el.dataset.calc != null) {
    const column = ensureCalc().columns[Number(el.dataset.calc)];
    if (el.type === "checkbox") column[el.dataset.field] = el.checked;
    else column[el.dataset.field] = el.value;
    if (["startPrice", "floorPrice", "stepCount", "quantity"].includes(el.dataset.field)) rebuildColumn(column);
    render();
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
  const focusId = focus && focus.id ? focus.id : "";
  const tag = focus && focus.tagName;
  const selection = focus && typeof focus.selectionStart === "number" ? [focus.selectionStart, focus.selectionEnd] : null;
  const y = window.scrollY;
  let body = "";
  let title = "Catalogue";
  if (route.name === "listing") {
    const listing = findListing(route.id);
    title = listing ? listing.title : "Lot";
    body = listingView(route.id);
  } else if (route.name === "sell") {
    title = "List a lot";
    body = sellView();
  } else if (route.name === "wishlist") {
    title = "Wish list";
    body = wishlistView();
  } else if (route.name === "orders") {
    title = "Orders";
    body = ordersView();
  } else if (route.name === "label") {
    title = "Mailing label";
    body = labelView();
  } else if (route.name === "calculator") {
    title = "Profit calculator";
    body = calculatorView();
  } else if (route.name === "how") {
    title = "How it works";
    body = howView();
  } else body = catalogue();
  document.getElementById("app").innerHTML = shell(title, body);
  if (options.scroll === "errors") document.getElementById("sell-errors")?.scrollIntoView({ block: "center" });
  else window.scrollTo(0, y);
  if (focusId && (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT")) {
    const next = document.getElementById(focusId);
    if (next) {
      next.focus({ preventScroll: true });
      if (selection && next.setSelectionRange) {
        try { next.setSelectionRange(selection[0], selection[1]); } catch (err) { /* number inputs */ }
      }
    }
  }
  lastSig = signature();
  updateClocks();
  if (options.tour || ui.tour) placeTour(!!options.tour);
}

const root = document.getElementById("app");
root.addEventListener("click", onClick);
root.addEventListener("input", onField);
root.addEventListener("change", onField);
root.addEventListener("submit", onSubmit);
window.addEventListener("hashchange", () => {
  if (routeOf().name !== "listing") stopPlay();
  render(ui.tour ? { tour: true } : undefined);
});
if (!location.hash) history.replaceState(null, "", "#/");
ui.welcome = !tourSeen();
render();
window.addEventListener("resize", () => placeTour(false));
window.addEventListener("scroll", () => placeTour(false), { passive: true });
window.setInterval(() => {
  updateClocks();
  const sig = signature();
  if (sig !== lastSig) render();
}, 1000);
