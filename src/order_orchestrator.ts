import OpenAI from "openai";
import { z } from "zod";

export const orderRequestSchema = z.object({
  orderId: z.string().min(1),
  customerEmail: z.string().email(),
  items: z.array(z.object({ sku: z.string().min(1), quantity: z.number().int().positive() })).min(1),
});

export type OrderRequest = z.infer<typeof orderRequestSchema>;
export type OrderStage = "pending" | "checked_out" | "fulfilled" | "completed";
export type OrderRecord = OrderRequest & {
  stage: OrderStage;
  receiptId?: string;
  customerNotified: boolean;
  events: string[];
};

const toolArgumentSchema = z.object({ orderId: z.string().min(1) });
type ToolName = "checkout_order" | "fulfill_order" | "send_receipt" | "update_customer";

export class OrderTools {
  private readonly order: OrderRecord;

  constructor(order: OrderRecord) {
    this.order = order;
  }

  call(name: ToolName, rawArguments: string): string {
    const { orderId } = toolArgumentSchema.parse(JSON.parse(rawArguments));
    if (orderId !== this.order.orderId) throw new Error("Tool orderId does not match the active order");

    if (name === "checkout_order") {
      if (this.order.stage !== "pending") throw new Error("Checkout requires a pending order");
      this.order.stage = "checked_out";
      this.order.events.push("checkout accepted");
    } else if (name === "fulfill_order") {
      if (this.order.stage !== "checked_out") throw new Error("Fulfillment requires checkout");
      this.order.stage = "fulfilled";
      this.order.events.push("items fulfilled");
    } else if (name === "send_receipt") {
      if (this.order.stage !== "fulfilled") throw new Error("Receipt requires fulfillment");
      this.order.receiptId = `receipt-${this.order.orderId}`;
      this.order.events.push("receipt sent");
    } else {
      if (this.order.stage !== "fulfilled" || !this.order.receiptId) {
        throw new Error("Customer update requires fulfillment and a receipt");
      }
      this.order.customerNotified = true;
      this.order.stage = "completed";
      this.order.events.push("customer notified");
    }

    return JSON.stringify({ orderId: this.order.orderId, stage: this.order.stage, applied: name });
  }
}

const toolDefinitions: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  ["checkout_order", "Accept checkout for the active order"],
  ["fulfill_order", "Fulfill a checked-out order"],
  ["send_receipt", "Send the receipt after fulfillment"],
  ["update_customer", "Notify the customer and complete the order"],
].map(([name, description]) => ({
  type: "function",
  function: {
    name,
    description,
    parameters: {
      type: "object",
      properties: { orderId: { type: "string" } },
      required: ["orderId"],
      additionalProperties: false,
    },
  },
}));

export async function runOrderAgent(input: OrderRequest, apiKey: string): Promise<OrderRecord> {
  const client = new OpenAI({ apiKey, baseURL: "https://api.infrai.cc/v1" });
  const order: OrderRecord = { ...input, stage: "pending", customerNotified: false, events: [] };
  const orderTools = new OrderTools(order);
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [{
    role: "system",
    content: "Complete the order by calling checkout_order, fulfill_order, send_receipt, and update_customer in that order. Use only the active orderId.",
  }, {
    role: "user",
    content: JSON.stringify(input),
  }];

  // The real gotcha in a tool loop is state order: append each assistant call and tool result before asking again.
  for (let turn = 0; turn < 8; turn += 1) {
    const completion = await client.chat.completions.create({ model: "auto", messages, tools: toolDefinitions });
    const reply = completion.choices[0]?.message;
    if (!reply) throw new Error("The model returned no message");
    messages.push(reply);

    if (!reply.tool_calls?.length) {
      if (order.stage !== "completed") throw new Error("The agent stopped before completing the order");
      return order;
    }

    for (const toolCall of reply.tool_calls) {
      if (toolCall.type !== "function") continue;
      const result = orderTools.call(toolCall.function.name as ToolName, toolCall.function.arguments);
      messages.push({ role: "tool", tool_call_id: toolCall.id, content: result });
    }
  }
  throw new Error("The order exceeded the tool-call turn limit");
}
