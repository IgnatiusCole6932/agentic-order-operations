import { createServer, type ServerResponse } from "node:http";
import { ZodError } from "zod";
import { orderRequestSchema, runOrderAgent } from "./order_orchestrator.js";

function respond(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/orders/automate") {
    respond(response, 404, { error: "Route not found" });
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const input = orderRequestSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const apiKey = process.env.INFRAI_API_KEY;
    if (!apiKey) throw new Error("INFRAI_API_KEY is required");
    respond(response, 200, await runOrderAgent(input, apiKey));
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      respond(response, 400, { error: "Invalid order request" });
      return;
    }
    console.error(error);
    respond(response, 502, { error: "Order automation did not complete" });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Order automation listening on http://localhost:${port}`));
