import { findOrder, setVerifiedPaymentStatus } from "../../../../lib/orders";
import { ensureOrderTables } from "../../../../lib/database";
import { getPayfastConfig, verifySignature } from "../../../../lib/payfast";
import { isIP } from "node:net";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseAmountCents(value) {
  if (typeof value !== "string" || !/^\d{1,8}\.\d{2}$/.test(value)) return null;
  const [whole, fraction] = value.split(".");
  return Number(whole) * 100 + Number(fraction);
}

function isAllowedSourceIp(sourceIp, allowedRanges) {
  if (isIP(sourceIp) === 0) return false;
  return allowedRanges.some((range) => {
    if (!range.includes("/")) return sourceIp.toLowerCase() === range.toLowerCase();
    const [network, prefixText] = range.split("/");
    if (isIP(sourceIp) !== 4 || isIP(network) !== 4 || !/^\d{1,2}$/.test(prefixText)) return false;
    const prefix = Number(prefixText);
    if (prefix < 0 || prefix > 32) return false;
    const toInteger = (address) => address.split(".").reduce((result, octet) => (result << 8) | Number(octet), 0) >>> 0;
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    return (toInteger(sourceIp) & mask) === (toInteger(network) & mask);
  });
}

export async function POST(request) {
  const config = getPayfastConfig();
  if (!config.available) return new Response("Payment notifications are not configured.", { status: 503 });
  if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) {
    return new Response("Unsupported notification format.", { status: 415 });
  }

  const sourceIp = (
    request.headers.get("x-vercel-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for") ||
    ""
  ).split(",")[0].trim().replace(/^::ffff:/, "");
  if (!sourceIp || !isAllowedSourceIp(sourceIp, config.allowedIps)) {
    console.error("Rejected PayFast ITN from an unapproved source IP.");
    return new Response("Unapproved notification source.", { status: 403 });
  }

  const body = await request.text();
  if (body.length === 0 || body.length > 20000) return new Response("Invalid notification size.", { status: 400 });
  const parameters = new URLSearchParams(body);
  const entries = [...parameters.entries()];
  const data = Object.fromEntries(entries);
  if (entries.length !== Object.keys(data).length) return new Response("Duplicate notification fields.", { status: 400 });

  const signature = data.signature;
  const { signature: _signature, ...signedFields } = data;
  if (!verifySignature(signedFields, signature, config.passphrase)) {
    console.error("Rejected PayFast ITN with an invalid signature.");
    return new Response("Invalid signature.", { status: 400 });
  }
  if (data.merchant_id !== config.merchantId) return new Response("Merchant ID mismatch.", { status: 400 });

  try {
    await ensureOrderTables();
    const validation = await fetch(config.validateUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
    if (!validation.ok || (await validation.text()).trim() !== "VALID") {
      console.error("PayFast ITN server validation failed.");
      return new Response("Notification could not be validated by PayFast.", { status: 400 });
    }

    if (!/^KE-[a-f0-9-]{36}$/i.test(data.m_payment_id || "")) {
      return new Response("Unknown order reference.", { status: 400 });
    }
    const order = await findOrder(data.m_payment_id);
    if (!order) return new Response("Unknown order reference.", { status: 404 });

    const amountCents = parseAmountCents(data.amount_gross);
    if (amountCents === null || amountCents !== order.amount_cents) {
      console.error("Rejected PayFast ITN with an amount mismatch.", data.m_payment_id);
      return new Response("Payment amount mismatch.", { status: 400 });
    }

    const nextStatus = {
      COMPLETE: "paid",
      FAILED: "failed",
      CANCELLED: "cancelled",
    }[data.payment_status];
    if (!nextStatus) {
      if (data.payment_status === "PENDING") return new Response("OK");
      return new Response("Unsupported payment status.", { status: 400 });
    }

    const updated = await setVerifiedPaymentStatus(data.m_payment_id, amountCents, nextStatus);
    if (!updated) return new Response("Order status could not be updated.", { status: 409 });
    return new Response("OK");
  } catch (error) {
    console.error("PayFast ITN processing failed; PayFast may retry the notification.", error?.code || "unknown");
    return new Response("Notification processing failed.", { status: 503 });
  }
}
