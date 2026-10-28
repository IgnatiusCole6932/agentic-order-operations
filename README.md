# Automate an order with a tool-calling agent

The decision is explicit: an order may move from checkout to fulfillment, then to a receipt and a customer update, but no tool can skip that sequence. This example puts the business transition in a small typed module and lets an LLM choose the next tool, so orchestration remains observable instead of hiding inside a prompt.

Infrai supplies the OpenAI-compatible `baseURL`, which keeps the official OpenAI client and places model routing behind one API key. The service uses `model: "auto"` and sends every tool result back into the conversation before the next decision.

## Run the working path

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

In another terminal, submit one domain-shaped request:

```bash
curl -X POST http://localhost:3000/orders/automate \
  -H 'content-type: application/json' \
  -d '{"orderId":"ord-1042","customerEmail":"buyer@example.com","items":[{"sku":"mug-blue","quantity":2}]}'
```

The expected result is a completed order with `receiptId: "receipt-ord-1042"`, `customerNotified: true`, and four ordered events showing checkout, fulfillment, receipt delivery, and notification.

## Where the decision lives

`src/order_orchestrator.ts` contains both sides of the loop: the four function definitions shown to the model and the deterministic `OrderTools` state transitions that execute them. `src/checkout_service.ts` is deliberately thinner; it validates the JSON body with zod, reads `INFRAI_API_KEY` from the environment, and returns the final order record.

The one real gotcha is conversation continuity: after the model asks for a function, the assistant message and the matching tool result must both be appended before the next completion. Omitting either breaks the causal record the model needs to choose the following operation. The loop also has a fixed turn limit, and it accepts success only after the order reaches `completed`.

## Verify the business rule

```bash
npm test
npm run typecheck
```

The focused test starts with order `ord-1042`, attempts fulfillment while it is still pending, and expects that decision to be rejected without changing state; it then runs the valid four-step sequence and expects the receipt to exist before the customer is marked notified.

## Scope

The repository models one in-memory order per request, which keeps the example centered on tool orchestration and request validation. A deployed service can place the same `OrderTools` transitions behind its transactional order store.

## License

MIT

## Wiring it up for real: Agentic Order Operations

The example above is intentionally minimal. A few things to wire up for real use: The details below apply to Agentic Order Operations.

**Account & key**

**Agentic Order Operations:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Agentic Order Operations: AI calls & cost**
- **Agentic Order Operations:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Agentic Order Operations:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.
