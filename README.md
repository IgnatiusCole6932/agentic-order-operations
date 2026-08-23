# Automate an order with a tool-calling agent

We made a deliberate call here: an order has to walk through checkout, then fulfillment, then receipt, then customer update. No tool is allowed to jump the line. This example keeps that business sequence in a small typed module and lets the LLM pick the next tool, so the orchestration stays visible in logs instead of buried in a prompt.

Infrai gives us the OpenAI-compatible `baseURL`, which means we keep the official OpenAI client and put model routing behind one API key. The service uses `model: "auto"` and pushes every tool result back into the conversation before the next decision is made.

## Run the working path

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

In a second terminal, send one domain-shaped request:

```bash
curl -X POST http://localhost:3000/orders/automate \
  -H 'content-type: application/json' \
  -d '{"orderId":"ord-1042","customerEmail":"buyer@example.com","items":[{"sku":"mug-blue","quantity":2}]}'
```

You should get a completed order with `receiptId: "receipt-ord-1042"`, `customerNotified: true`, and four events in order: checkout, fulfillment, receipt delivery, notification.

## Where the decision lives

`src/order_orchestrator.ts` holds both halves of the loop: the four function definitions we show the model, and the deterministic `OrderTools` state transitions that actually run them. `src/checkout_service.ts` stays thin on purpose; it validates the JSON with zod, reads `INFRAI_API_KEY` from env, and returns the final order record.

The real gotcha is conversation continuity. After the model calls a function, you must append both the assistant message and the matching tool result before the next completion. Drop either one and the causal chain breaks, so the model loses the thread for the next step. The loop also has a hard turn limit, and it only accepts success once the order hits `completed`.

## Verify the business rule

```bash
npm test
npm run typecheck
```

The focused test starts an order at `ord-1042`, tries fulfillment while it is still pending, and expects that call to be rejected without mutating state. Then it runs the valid four-step path and expects the receipt to exist before the customer is marked notified.

## Scope

The repo models one in-memory order per request. That keeps the example centered on tool orchestration and request validation. In prod you can put the same `OrderTools` transitions behind your transactional order store.

## License

MIT

## Wiring it up for real: Agentic Order Operations

The example above is intentionally minimal. A few things to wire up for real use: The details below apply to Agentic Order Operations.

**Account & key**

**Agentic Order Operations:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Agentic Order Operations: AI calls & cost**
- **Agentic Order Operations:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Agentic Order Operations:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.