/**
 * Reverse Auction Marketing — clearing rules.
 *
 * The price clock depends only on how many units are filled. Every accepted
 * bidder pays that one price (uniform clearing). Bids are ranked by maximum
 * price, then by time. A bid at or above the clock is immediate; a lower bid
 * waits. Waiting bids are re-checked as a group and clear immediately when,
 * taken together, they reach a price every one of them will pay. The book
 * fills the largest quantity that can clear, which is what lets a full set of
 * floor bids sell the lot out at once.
 */

export const FEE_TIERS = [
  { below: 25, rate: 0.085, label: "Under $25" },
  { below: 75, rate: 0.065, label: "$25 – $74.99" },
  { below: 200, rate: 0.05, label: "$75 – $199.99" },
  { below: 1000, rate: 0.035, label: "$200 – $999.99" },
  { below: Infinity, rate: 0.025, label: "$1,000 and over" },
];

export const AUDIENCES = [
  {
    id: "mfr-wholesaler",
    sellerType: "manufacturer",
    label: "Manufacturer → Wholesaler only",
    buyers: ["wholesaler"],
  },
  {
    id: "mfr-trade",
    sellerType: "manufacturer",
    label: "Manufacturer → Wholesaler or Retailer",
    buyers: ["wholesaler", "retailer"],
  },
  {
    id: "mfr-individual",
    sellerType: "manufacturer",
    label: "Manufacturer → Individual",
    buyers: ["individual"],
  },
  {
    id: "wh-retail",
    sellerType: "wholesaler",
    label: "Wholesaler → Retailer only",
    buyers: ["retailer"],
  },
  {
    id: "wh-individual",
    sellerType: "wholesaler",
    label: "Wholesaler → Individual",
    buyers: ["individual"],
  },
  {
    id: "ret-individual",
    sellerType: "retailer",
    label: "Retailer → Individual",
    buyers: ["individual"],
  },
  {
    id: "ind-individual",
    sellerType: "individual",
    label: "Individual → Individual",
    buyers: ["individual"],
  },
];

/** Hypothetical paths from the seller-economics addendum. Before fees. */
export const ADDENDUM_STRATEGIES = [
  {
    id: "aggressive",
    name: "Aggressive floor",
    blurb: "Start $110, step to $95 at low volume, floor $90. Clears quickly.",
    unitCost: 70,
    quantity: 100,
    schedule: [
      { qty: 0, price: 110 },
      { qty: 15, price: 95 },
      { qty: 100, price: 90 },
    ],
    expectedUnits: 80,
    expectedDays: 2,
    paperPerUnitPerDay: 12.5,
  },
  {
    id: "balanced",
    name: "Balanced",
    blurb: "Start $120, step through $105 to a $95 floor. Moderate fill.",
    unitCost: 70,
    quantity: 100,
    schedule: [
      { qty: 0, price: 120 },
      { qty: 20, price: 105 },
      { qty: 55, price: 95 },
    ],
    expectedUnits: 40,
    expectedDays: 4,
    paperPerUnitPerDay: 8.75,
  },
  {
    id: "patient",
    name: "Patient / high floor",
    blurb: "Start $130, slow steps, floor $115. Clears at $120, or not at all.",
    unitCost: 70,
    quantity: 100,
    schedule: [
      { qty: 0, price: 130 },
      { qty: 30, price: 125 },
      { qty: 55, price: 120 },
      { qty: 85, price: 115 },
    ],
    expectedUnits: 60,
    expectedDays: 9,
    paperPerUnitPerDay: 5.56,
  },
];

export function roundMoney(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

function cents(n) {
  return Math.round(roundMoney(n) * 100);
}

export function feeRate(unitPrice) {
  const price = Number(unitPrice);
  if (!Number.isFinite(price) || price <= 0) return 0;
  const tier = FEE_TIERS.find((row) => price < row.below);
  return tier ? tier.rate : FEE_TIERS[FEE_TIERS.length - 1].rate;
}

export function audienceById(id) {
  return AUDIENCES.find((row) => row.id === id) || null;
}

export function audiencesForSeller(sellerType) {
  return AUDIENCES.filter((row) => row.sellerType === sellerType);
}

export function buyerMayEnter(audienceId, buyerType) {
  const audience = audienceById(audienceId);
  if (!audience) return false;
  return audience.buyers.includes(buyerType);
}

export function buyerInGeo(geo, buyer) {
  if (!geo) return true;
  const same = (list, value) => {
    if (!list || list.length === 0) return true;
    const needle = String(value || "").trim().toLowerCase();
    return list.some((item) => String(item).trim().toLowerCase() === needle);
  };
  return same(geo.countries, buyer.country) && same(geo.regions, buyer.region) && same(geo.cities, buyer.city);
}

export function buildLinearSchedule({ startPrice, floorPrice, stepCount, quantity }) {
  const steps = Math.max(1, Math.floor(Number(stepCount) || 1));
  const qty = Math.max(1, Math.floor(Number(quantity) || 1));
  const start = roundMoney(startPrice);
  const floor = roundMoney(floorPrice);
  const schedule = [{ qty: 0, price: start }];
  let lastQty = 0;
  for (let i = 1; i <= steps; i += 1) {
    let threshold = Math.round((qty * i) / steps);
    if (i === steps) threshold = qty;
    threshold = Math.min(qty, Math.max(lastQty + 1, threshold));
    const price = i === steps ? floor : roundMoney(start - ((start - floor) * i) / steps);
    if (threshold === lastQty) {
      schedule[schedule.length - 1].price = price;
    } else {
      schedule.push({ qty: threshold, price });
      lastQty = threshold;
    }
  }
  schedule[schedule.length - 1].price = floor;
  return schedule;
}

export function validateSchedule(schedule, { startPrice, floorPrice, quantity }) {
  const errors = [];
  const qty = Math.floor(Number(quantity));
  const start = roundMoney(startPrice);
  const floor = roundMoney(floorPrice);
  if (!Array.isArray(schedule) || schedule.length < 2) {
    errors.push("Add a start price and at least one step down to the floor.");
    return errors;
  }
  if (!(start > floor)) errors.push("Start price has to be above the floor.");
  if (!(qty >= 1)) errors.push("Quantity has to be at least 1.");
  const rows = schedule.map((row) => ({ qty: Math.floor(Number(row.qty)), price: roundMoney(row.price) }));
  if (rows[0].qty !== 0 || cents(rows[0].price) !== cents(start)) {
    errors.push("The first step is the start price, before any units are filled.");
  }
  for (let i = 1; i < rows.length; i += 1) {
    if (!(rows[i].qty > rows[i - 1].qty)) errors.push("Quantity thresholds have to increase.");
    if (!(rows[i].price < rows[i - 1].price)) errors.push("Each step has to be a lower price.");
    if (rows[i].qty > qty) errors.push("A threshold can't be past the quantity for sale.");
    if (rows[i].qty < 1) errors.push("The first drop happens at 1 unit or later.");
  }
  if (cents(rows[rows.length - 1].price) !== cents(floor)) {
    errors.push("The last step has to be the floor price.");
  }
  if (rows.some((row) => !(row.price >= floor) || !(row.price <= start))) {
    errors.push("Every step stays between the floor and the start price.");
  }
  return errors;
}

export function priceAtQuantity(schedule, quantity) {
  const q = Math.max(0, Math.floor(Number(quantity) || 0));
  let price = schedule[0]?.price ?? 0;
  for (const step of schedule) {
    if (q >= step.qty) price = step.price;
  }
  return roundMoney(price);
}

export function priceBands(schedule, quantity) {
  const qty = Math.max(1, Math.floor(Number(quantity) || 1));
  const bands = [];
  for (let i = 0; i < schedule.length; i += 1) {
    const from = schedule[i].qty === 0 ? 1 : schedule[i].qty;
    const end = i + 1 < schedule.length ? schedule[i + 1].qty - 1 : qty;
    if (from <= end) bands.push({ from, to: end, price: roundMoney(schedule[i].price) });
  }
  return bands;
}

export function nextStep(schedule, acceptedQty) {
  const filled = Math.max(0, Math.floor(Number(acceptedQty) || 0));
  const upcoming = schedule.find((step) => step.qty > filled);
  if (!upcoming) return null;
  return {
    qty: upcoming.qty,
    price: roundMoney(upcoming.price),
    unitsNeeded: upcoming.qty - filled,
  };
}

export function compareBids(a, b) {
  const price = cents(b.maxPrice) - cents(a.maxPrice);
  if (price !== 0) return price;
  const time = Number(a.time) - Number(b.time);
  if (time !== 0) return time;
  return String(a.id).localeCompare(String(b.id));
}

/**
 * Largest fill whose bidders will all pay the clock price for that quantity.
 * Returns the uniform price, who is filled, and which bids are still waiting.
 */
export function clearBook({ quantity, schedule, bids }) {
  const lot = Math.max(0, Math.floor(Number(quantity) || 0));
  const ranked = (bids || [])
    .map((bid) => ({
      ...bid,
      quantity: Math.floor(Number(bid.quantity) || 0),
      maxPrice: roundMoney(bid.maxPrice),
      time: Number(bid.time) || 0,
    }))
    .filter((bid) => bid.quantity > 0 && bid.id != null)
    .sort(compareBids);

  let best = null;
  for (let k = lot; k >= 1; k -= 1) {
    const price = priceAtQuantity(schedule, k);
    let need = k;
    const fills = [];
    for (const bid of ranked) {
      if (need <= 0) break;
      if (cents(bid.maxPrice) < cents(price)) continue;
      const take = Math.min(bid.quantity, need);
      fills.push({
        bidId: bid.id,
        userId: bid.userId,
        quantity: take,
        maxPrice: bid.maxPrice,
        time: bid.time,
      });
      need -= take;
    }
    if (need === 0) {
      best = { units: k, clockPrice: price, fills };
      break;
    }
  }

  const clockPrice = best ? best.clockPrice : priceAtQuantity(schedule, 0);
  const fills = best ? best.fills : [];
  const filledIds = new Set(fills.map((row) => row.bidId));
  const pendingBidIds = ranked.filter((bid) => !filledIds.has(bid.id)).map((bid) => bid.id);
  const units = best ? best.units : 0;
  return {
    units,
    clockPrice: roundMoney(clockPrice),
    gross: roundMoney(clockPrice * units),
    fills,
    pendingBidIds,
    soldOut: lot > 0 && units >= lot,
  };
}

export function settlement({ closed, book, bids }) {
  return (bids || []).map((bid) => {
    const fill = book.fills.find((row) => row.bidId === bid.id);
    if (fill) {
      return {
        bidId: bid.id,
        status: fill.quantity < Math.floor(Number(bid.quantity) || 0) ? "partial" : "accepted",
        quantity: fill.quantity,
      };
    }
    return { bidId: bid.id, status: closed ? "rejected" : "pending", quantity: 0 };
  });
}

export function listingPhase(listing, book, now) {
  const t = Number(now);
  if (t < listing.start) return "upcoming";
  if (book.soldOut || t >= listing.end) return "closed";
  return "live";
}

/**
 * First-bidder bonus pays only when the lot sells out at the floor.
 * The first bidder is the earliest filled bid.
 */
export function firstBidderReward({ bonus, floorPrice, quantity, book }) {
  if (!bonus || bonus.type === "none") return null;
  if (!book.soldOut || book.units < quantity) return null;
  if (cents(book.clockPrice) !== cents(floorPrice)) return null;
  const first = [...book.fills].sort((a, b) => a.time - b.time || String(a.bidId).localeCompare(String(b.bidId)))[0];
  if (!first) return null;
  const merchandise = roundMoney(book.clockPrice * first.quantity);
  if (bonus.type === "free-unit") {
    const freeUnits = Math.min(1, first.quantity);
    return {
      bidId: first.bidId,
      userId: first.userId,
      type: bonus.type,
      freeUnits,
      amountOff: roundMoney(book.clockPrice * freeUnits),
      note: "First bidder receives one unit free because the lot sold out at the floor.",
    };
  }
  if (bonus.type === "percent") {
    const pct = Math.max(0, Number(bonus.percent) || 0);
    return {
      bidId: first.bidId,
      userId: first.userId,
      type: bonus.type,
      freeUnits: 0,
      amountOff: roundMoney(merchandise * (pct / 100)),
      note: `First bidder receives an extra ${pct}% off because the lot sold out at the floor.`,
    };
  }
  if (bonus.type === "amount") {
    const amount = Math.max(0, Number(bonus.amount) || 0);
    return {
      bidId: first.bidId,
      userId: first.userId,
      type: bonus.type,
      freeUnits: 0,
      amountOff: roundMoney(Math.min(amount, merchandise)),
      note: "First bidder receives an extra reduction because the lot sold out at the floor.",
    };
  }
  return null;
}

export function orderMoney({ unitPrice, quantity, bonusOff = 0, shippingCost = 0, insuranceRate = 0, insuranceMin = 0, warrantyPerUnit = 0 }) {
  const units = Math.max(0, Math.floor(Number(quantity) || 0));
  const gross = roundMoney(unitPrice * units);
  const merchandise = roundMoney(Math.max(0, gross - (Number(bonusOff) || 0)));
  const warranty = roundMoney(Math.max(0, warrantyPerUnit) * units);
  const shipping = roundMoney(Math.max(0, shippingCost));
  const insurance = units > 0 ? roundMoney(Math.max(insuranceMin, merchandise * insuranceRate)) : 0;
  return {
    gross,
    merchandise,
    warranty,
    shipping,
    insurance,
    total: roundMoney(merchandise + warranty + shipping + insurance),
  };
}

export function projectSale({ unitCost, schedule, quantity, expectedUnits, expectedDays }) {
  const lot = Math.max(0, Math.floor(Number(quantity) || 0));
  const units = Math.max(0, Math.min(lot, Math.floor(Number(expectedUnits) || 0)));
  const days = Math.max(0, Number(expectedDays) || 0);
  const cost = roundMoney(unitCost);
  const clearingPrice = units > 0 ? priceAtQuantity(schedule, units) : priceAtQuantity(schedule, 0);
  const gross = roundMoney(clearingPrice * units);
  const rate = units > 0 ? feeRate(clearingPrice) : 0;
  const fees = roundMoney(gross * rate);
  const costTotal = roundMoney(cost * units);
  const profitBeforeFees = roundMoney(gross - costTotal);
  const profit = roundMoney(profitBeforeFees - fees);
  const profitPerDay = days > 0 ? roundMoney(profit / days) : 0;
  const profitPerUnitPerDay = units > 0 && days > 0 ? roundMoney((clearingPrice - cost) / days) : 0;
  const profitPerUnitPerDayAfterFees = units > 0 && days > 0 ? roundMoney(profit / units / days) : 0;
  const capitalTiedUp = roundMoney(cost * lot);
  const dailyReturn = capitalTiedUp > 0 ? profitPerDay / capitalTiedUp : 0;
  return {
    units,
    unsoldUnits: lot - units,
    clearingPrice,
    gross,
    feeRate: rate,
    fees,
    unitCost: cost,
    costTotal,
    profitBeforeFees,
    profit,
    days,
    profitPerDay,
    profitPerUnitPerDay,
    profitPerUnitPerDayAfterFees,
    capitalTiedUp,
    dailyReturn,
  };
}

export function sensitivityCheck(input) {
  const base = projectSale(input);
  const lowerUnits = Math.floor(Math.max(0, Number(input.expectedUnits) || 0) * 0.8);
  const lower = projectSale({ ...input, expectedUnits: lowerUnits });
  return {
    base,
    lower,
    priceStepped: cents(lower.clearingPrice) !== cents(base.clearingPrice),
  };
}
