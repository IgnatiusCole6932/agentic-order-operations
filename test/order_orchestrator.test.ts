import assert from "node:assert/strict";
import test from "node:test";
import { OrderTools, type OrderRecord } from "../src/order_orchestrator.js";

function pendingOrder(): OrderRecord {
  return {
    orderId: "ord-1042",
    customerEmail: "buyer@example.com",
    items: [{ sku: "mug-blue", quantity: 2 }],
    stage: "pending",
    customerNotified: false,
    events: [],
  };
}

test("the order workflow enforces checkout before fulfillment", () => {
  const order = pendingOrder();
  const tools = new OrderTools(order);
  assert.throws(() => tools.call("fulfill_order", JSON.stringify({ orderId: order.orderId })), /requires checkout/);
  assert.equal(order.stage, "pending");
});

test("the complete workflow creates a receipt before notifying the customer", () => {
  const order = pendingOrder();
  const tools = new OrderTools(order);
  for (const name of ["checkout_order", "fulfill_order", "send_receipt", "update_customer"] as const) {
    tools.call(name, JSON.stringify({ orderId: order.orderId }));
  }
  assert.deepEqual(order, {
    ...pendingOrder(),
    stage: "completed",
    receiptId: "receipt-ord-1042",
    customerNotified: true,
    events: ["checkout accepted", "items fulfilled", "receipt sent", "customer notified"],
  });
});
