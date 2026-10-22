import { findOrder } from "../../../../lib/orders";
import { ensureOrderTables } from "../../../../lib/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request, { params }) {
  const { reference } = await params;
  if (!/^KE-[a-f0-9-]{36}$/i.test(reference)) {
    return Response.json({ error: "Invalid order reference." }, { status: 400 });
  }

  try {
    await ensureOrderTables();
    const order = await findOrder(reference);
    if (!order) return Response.json({ error: "Order not found." }, { status: 404 });
    return Response.json({ reference: order.reference, status: order.status }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Could not retrieve the Kasi Eats order status.", error?.code || "unknown");
    return Response.json({ error: "Order status is temporarily unavailable." }, { status: 503 });
  }
}
