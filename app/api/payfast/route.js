import crypto from "node:crypto";
import { CONFIG } from "../../../lib/menu";
import { validateOrder, OrderValidationError } from "../../../lib/order";
import { createPendingOrder } from "../../../lib/orders";
import { ensureOrderTables } from "../../../lib/database";
import { getPayfastConfig, sign } from "../../../lib/payfast";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const config = getPayfastConfig();
  return Response.json({ available: config.available, message: config.message }, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request) {
  const config = getPayfastConfig();
  if (!config.available) {
    return Response.json({ error: "Online payments are not configured. Please use WhatsApp to request your order." }, { status: 503 });
  }
  const origin = request.headers.get("origin");
  if (origin && config.siteUrl && origin !== config.siteUrl) {
    return Response.json({ error: "Checkout requests must come from the configured site." }, { status: 403 });
  }

  let input;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "The order request could not be read." }, { status: 400 });
  }

  let order;
  try {
    order = validateOrder(input);
  } catch (error) {
    if (error instanceof OrderValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  if (order.mode === "delivery" && CONFIG.deliveryAreas.length === 0) {
    return Response.json({ error: "Local delivery coverage has not been configured. Please request availability by WhatsApp." }, { status: 400 });
  }
  if (order.mode === "delivery" && CONFIG.deliveryFee === null) {
    return Response.json({ error: "The delivery fee has not been configured. Please confirm it by WhatsApp before payment." }, { status: 400 });
  }

  const reference = `KE-${crypto.randomUUID()}`;
  const names = order.items.map((item) => `${item.qty} x ${item.name}`);
  const fields = {
    merchant_id: config.merchantId,
    return_url: `${config.siteUrl}/?payment=success&reference=${encodeURIComponent(reference)}#order`,
    cancel_url: `${config.siteUrl}/?payment=cancelled&reference=${encodeURIComponent(reference)}#order`,
    notify_url: `${config.siteUrl}/api/payfast/notify`,
    name_first: order.customer.name,
    cell_number: order.customer.phone,
    m_payment_id: reference,
    amount: (order.totalCents / 100).toFixed(2),
    item_name: "Kasi Eats order",
    item_description: names.join(", ").slice(0, 255),
    custom_str1: order.mode,
  };
  fields.signature = sign(fields, config.passphrase);

  try {
    await ensureOrderTables();
    await createPendingOrder({ ...order, reference });
  } catch (error) {
    console.error("Could not persist the pending Kasi Eats payment order.", error?.code || "unknown");
    return Response.json({ error: "Online checkout is temporarily unavailable. Please try WhatsApp instead." }, { status: 503 });
  }

  return Response.json({ url: config.processUrl, fields }, {
    headers: { "Cache-Control": "no-store" },
  });
}
