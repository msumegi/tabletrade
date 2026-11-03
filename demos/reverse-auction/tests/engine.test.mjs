import assert from "node:assert/strict";
import test from "node:test";
import {
  ADDENDUM_STRATEGIES,
  AUDIENCES,
  buildLinearSchedule,
  buyerInGeo,
  buyerMayEnter,
  clearBook,
  feeRate,
  firstBidderReward,
  orderMoney,
  priceAtQuantity,
  priceBands,
  projectSale,
  sensitivityCheck,
  settlement,
} from "../engine.js";
import { createSeed } from "../seed.js";

/** Concept example: $100 down to $70, drops at 2, 5 and 9 units, lot of 10. */
const EXAMPLE = {
  quantity: 10,
  schedule: [
    { qty: 0, price: 100 },
    { qty: 2, price: 90 },
    { qty: 5, price: 80 },
    { qty: 9, price: 70 },
  ],
};

function unitBids(count, price, start = 0) {
  return Array.from({ length: count }, (_, i) => ({
    id: `b${start + i}`,
    userId: `u${start + i}`,
    quantity: 1,
    maxPrice: price,
    time: 1_000 + start + i,
  }));
}

function book(bids) {
  return clearBook({ quantity: EXAMPLE.quantity, schedule: EXAMPLE.schedule, bids });
}

test("spec volume table uses one clearing price for every filled unit", () => {
  const expected = [
    [1, 100, 100],
    [2, 90, 180],
    [4, 90, 360],
    [5, 80, 400],
    [8, 80, 640],
    [9, 70, 630],
    [10, 70, 700],
  ];
  for (const [units, price, revenue] of expected) {
    const result = book(unitBids(units, 100));
    assert.equal(result.units, units, `units ${units}`);
    assert.equal(result.clockPrice, price, `price at ${units}`);
    assert.equal(result.gross, revenue, `revenue at ${units}`);
    assert.equal(result.soldOut, units === 10);
  }
});

test("price bands match the worked example", () => {
  assert.deepEqual(priceBands(EXAMPLE.schedule, 10), [
    { from: 1, to: 1, price: 100 },
    { from: 2, to: 4, price: 90 },
    { from: 5, to: 8, price: 80 },
    { from: 9, to: 10, price: 70 },
  ]);
  assert.equal(priceAtQuantity(EXAMPLE.schedule, 0), 100);
  assert.equal(priceAtQuantity(EXAMPLE.schedule, 1), 100);
  assert.equal(priceAtQuantity(EXAMPLE.schedule, 9), 70);
});

test("ten pending floor bids are a group bid and sell out immediately", () => {
  const result = book(unitBids(10, 70));
  assert.equal(result.soldOut, true);
  assert.equal(result.units, 10);
  assert.equal(result.clockPrice, 70);
  assert.equal(result.gross, 700);
  assert.equal(result.pendingBidIds.length, 0);
});

test("one buyer bidding the whole lot at the floor also ends it", () => {
  const result = book([{ id: "all", userId: "u", quantity: 10, maxPrice: 70, time: 5 }]);
  assert.equal(result.soldOut, true);
  assert.equal(result.clockPrice, 70);
  assert.equal(result.fills[0].quantity, 10);
});

test("a higher bid is included with nine floor bids and everyone pays the floor", () => {
  const bids = [
    { id: "high", userId: "h", quantity: 1, maxPrice: 100, time: 1 },
    ...unitBids(9, 70, 10),
  ];
  const result = book(bids);
  assert.equal(result.units, 10);
  assert.equal(result.clockPrice, 70);
  assert.equal(result.fills.some((row) => row.bidId === "high"), true);
  assert.equal(result.gross, 700);
});

test("pending bids that cannot reach their price stay pending", () => {
  const result = book(unitBids(4, 70));
  assert.equal(result.units, 0);
  assert.equal(result.clockPrice, 100);
  assert.equal(result.pendingBidIds.length, 4);
  const rows = settlement({ closed: false, book: result, bids: unitBids(4, 70) });
  assert.ok(rows.every((row) => row.status === "pending"));
  const rejected = settlement({ closed: true, book: result, bids: unitBids(4, 70) });
  assert.ok(rejected.every((row) => row.status === "rejected"));
});

test("rank is price, then time; only the units that fit are filled", () => {
  const existing = unitBids(6, 100, 0);
  const pending = [
    { id: "late-high", userId: "a", quantity: 1, maxPrice: 85, time: 50 },
    { id: "early-low", userId: "b", quantity: 1, maxPrice: 70, time: 10 },
    { id: "mid-low", userId: "c", quantity: 1, maxPrice: 70, time: 20 },
    { id: "early-high", userId: "d", quantity: 1, maxPrice: 85, time: 5 },
    { id: "extra", userId: "e", quantity: 1, maxPrice: 70, time: 30 },
  ];
  const result = book([...existing, ...pending]);
  assert.equal(result.units, 10);
  assert.equal(result.clockPrice, 70);
  const filled = result.fills.map((row) => row.bidId);
  assert.deepEqual(filled.slice(0, 6), ["b0", "b1", "b2", "b3", "b4", "b5"]);
  assert.deepEqual(filled.slice(6), ["early-high", "late-high", "early-low", "mid-low"]);
  assert.deepEqual(result.pendingBidIds, ["extra"]);
});

test("a bid is partially filled when the lot runs out", () => {
  const result = book([
    ...unitBids(8, 100),
    { id: "big", userId: "big", quantity: 5, maxPrice: 100, time: 9_000 },
  ]);
  assert.equal(result.soldOut, true);
  const partial = result.fills.find((row) => row.bidId === "big");
  assert.equal(partial.quantity, 2);
  const rows = settlement({
    closed: true,
    book: result,
    bids: [...unitBids(8, 100), { id: "big", quantity: 5, maxPrice: 100, time: 9_000 }],
  });
  assert.equal(rows.find((row) => row.bidId === "big").status, "partial");
});

test("seller cost of $50 on a full $70 clear is a $200 yield before fees", () => {
  const projection = projectSale({
    unitCost: 50,
    schedule: EXAMPLE.schedule,
    quantity: 10,
    expectedUnits: 10,
    expectedDays: 1,
  });
  assert.equal(projection.clearingPrice, 70);
  assert.equal(projection.gross, 700);
  assert.equal(projection.profitBeforeFees, 200);
  assert.ok(projection.fees > 0);
  assert.equal(projection.profit, round2(200 - projection.fees));
  assert.equal(projection.capitalTiedUp, 500);
});

test("twenty percent less volume steps the example back up to $80", () => {
  const check = sensitivityCheck({
    unitCost: 50,
    schedule: EXAMPLE.schedule,
    quantity: 10,
    expectedUnits: 10,
    expectedDays: 1,
  });
  assert.equal(check.lower.units, 8);
  assert.equal(check.lower.clearingPrice, 80);
  assert.equal(check.lower.gross, 640);
  assert.equal(check.priceStepped, true);
  assert.equal(check.lower.profitBeforeFees, 240);
});

test("addendum strategies match the paper's per-unit daily profit before fees", () => {
  for (const strategy of ADDENDUM_STRATEGIES) {
    const projection = projectSale(strategy);
    assert.equal(projection.profitPerUnitPerDay, strategy.paperPerUnitPerDay, strategy.id);
  }
  const aggressive = projectSale(ADDENDUM_STRATEGIES[0]);
  assert.equal(aggressive.clearingPrice, 95);
  assert.equal(aggressive.units, 80);
  assert.ok(aggressive.capitalTiedUp > 0);
  assert.ok(aggressive.fees > 0);
  assert.ok(aggressive.profit < aggressive.profitBeforeFees);
});

test("platform fee is a higher percent on smaller items and zero to list", () => {
  assert.ok(feeRate(9.5) > feeRate(48));
  assert.ok(feeRate(48) > feeRate(220));
  assert.ok(feeRate(220) > feeRate(1500));
  assert.equal(feeRate(9.5), 0.085);
  assert.equal(feeRate(24.99), 0.085);
  assert.equal(feeRate(25), 0.065);
  assert.equal(feeRate(1000), 0.025);
});

test("first bidder bonus pays only the earliest fill, and only on a floor sell-out", () => {
  const bids = unitBids(10, 70);
  const full = book(bids);
  const reward = firstBidderReward({
    bonus: { type: "amount", amount: 15 },
    floorPrice: 70,
    quantity: 10,
    book: full,
  });
  assert.equal(reward.bidId, "b0");
  assert.equal(reward.amountOff, 15);

  const short = book(unitBids(8, 100));
  assert.equal(
    firstBidderReward({ bonus: { type: "free-unit" }, floorPrice: 70, quantity: 10, book: short }),
    null,
  );

  const free = firstBidderReward({
    bonus: { type: "free-unit" },
    floorPrice: 70,
    quantity: 10,
    book: full,
  });
  assert.equal(free.amountOff, 70);
});

test("shipping and insurance are added on top of the goods", () => {
  const bill = orderMoney({
    unitPrice: 70,
    quantity: 2,
    bonusOff: 15,
    shippingCost: 12,
    insuranceRate: 0.02,
    insuranceMin: 1.5,
    warrantyPerUnit: 0,
  });
  assert.equal(bill.gross, 140);
  assert.equal(bill.merchandise, 125);
  assert.equal(bill.shipping, 12);
  assert.equal(bill.insurance, 2.5);
  assert.equal(bill.total, 139.5);
});

test("audience and geography gates", () => {
  assert.equal(buyerMayEnter("wh-retail", "retailer"), true);
  assert.equal(buyerMayEnter("wh-retail", "individual"), false);
  assert.equal(buyerMayEnter("mfr-trade", "wholesaler"), true);
  assert.equal(buyerMayEnter("mfr-wholesaler", "retailer"), false);
  assert.equal(buyerMayEnter("ind-individual", "individual"), true);
  const geo = { countries: ["Canada"], regions: ["Alberta"], cities: [] };
  assert.equal(buyerInGeo(geo, { country: "Canada", region: "Alberta", city: "Calgary" }), true);
  assert.equal(buyerInGeo(geo, { country: "Canada", region: "British Columbia", city: "Vancouver" }), false);
  assert.equal(buyerInGeo(geo, { country: "United States", region: "Texas", city: "Austin" }), false);
  assert.equal(buyerInGeo({ countries: [], regions: [], cities: [] }, { country: "United States" }), true);
});

test("linear steps are evenly spaced and still land on the floor", () => {
  const schedule = buildLinearSchedule({ startPrice: 48, floorPrice: 30, stepCount: 3, quantity: 40 });
  assert.deepEqual(schedule, [
    { qty: 0, price: 48 },
    { qty: 13, price: 42 },
    { qty: 27, price: 36 },
    { qty: 40, price: 30 },
  ]);
  assert.equal(priceAtQuantity(schedule, 16), 42);
});

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

test("seeded catalogue leads with wholesale-to-retail and the worked example", () => {
  const state = createSeed();
  const example = state.listings.find((listing) => listing.id === "lot-example");
  assert.deepEqual(example.schedule, EXAMPLE.schedule);
  assert.equal(example.quantity, 10);
  assert.equal(example.unitCost, 50);
  assert.equal(example.audienceId, "wh-retail");
  const gloves = state.listings.find((listing) => listing.id === "lot-gloves");
  const gloveBook = clearBook({
    quantity: gloves.quantity,
    schedule: gloves.schedule,
    bids: state.bids.filter((bid) => bid.listingId === "lot-gloves"),
  });
  assert.equal(gloveBook.units, 16);
  assert.equal(gloveBook.clockPrice, 42);
  assert.equal(gloveBook.pendingBidIds.length, 2);
  const closed = state.listings.find((listing) => listing.id === "lot-closed");
  const closedBook = clearBook({
    quantity: closed.quantity,
    schedule: closed.schedule,
    bids: state.bids.filter((bid) => bid.listingId === "lot-closed"),
  });
  assert.equal(closedBook.soldOut, true);
  assert.equal(closedBook.clockPrice, 40);
  const wholesale = state.listings.filter((listing) => listing.audienceId === "wh-retail");
  assert.ok(wholesale.length > state.listings.length / 2);
  const audiences = new Set(state.listings.map((listing) => listing.audienceId));
  assert.deepEqual([...audiences].sort(), AUDIENCES.map((row) => row.id).sort());
  for (const bid of state.bids) {
    assert.ok(state.users.some((user) => user.id === bid.userId), bid.id);
  }
});
