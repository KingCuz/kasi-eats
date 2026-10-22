import crypto from "node:crypto";

const LIVE_PROCESS_URL = "https://www.payfast.co.za/eng/process";
const SANDBOX_PROCESS_URL = "https://sandbox.payfast.co.za/eng/process";
const LIVE_VALIDATE_URL = "https://www.payfast.co.za/eng/query/validate";
const SANDBOX_VALIDATE_URL = "https://sandbox.payfast.co.za/eng/query/validate";

function encodePayfastValue(value) {
  return encodeURIComponent(String(value).trim())
    .replace(/%20/g, "+")
    .replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function sign(fields, passphrase = "") {
  const ordered = Object.entries(fields)
    .filter(([, value]) => value !== "" && value !== null && value !== undefined)
    .sort(([leftKey], [rightKey]) => (leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0));
  const pairs = ordered.map(([key, value]) => `${key}=${encodePayfastValue(value)}`);
  if (passphrase) pairs.push(`passphrase=${encodePayfastValue(passphrase)}`);
  return crypto.createHash("md5").update(pairs.join("&")).digest("hex");
}

export function verifySignature(fields, signature, passphrase = "") {
  if (typeof signature !== "string" || !/^[a-f0-9]{32}$/i.test(signature)) return false;
  const expected = sign(fields, passphrase);
  return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
}

export function getPayfastConfig() {
  const sandbox = process.env.PAYFAST_SANDBOX !== "false";
  const liveEnabled = process.env.PAYFAST_LIVE_ENABLED === "true";
  const liveVerified = process.env.PAYFAST_LIVE_VERIFIED === "true";
  const site = process.env.SITE_URL || "";
  let siteUrl;
  try {
    siteUrl = new URL(site);
  } catch {
    siteUrl = null;
  }
  const siteIsSecure = siteUrl && (
    siteUrl.protocol === "https:" ||
    (process.env.NODE_ENV !== "production" && siteUrl.hostname === "localhost" && siteUrl.protocol === "http:")
  );
  const databaseUrl = process.env.DATABASE_URL || "";
  const ips = (process.env.PAYFAST_ITN_ALLOWED_IPS || "")
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean);
  const credentialsReady = /^\d+$/.test(process.env.PAYFAST_MERCHANT_ID || "") &&
    Boolean(process.env.PAYFAST_MERCHANT_KEY) &&
    Boolean(databaseUrl) &&
    /^(postgres|postgresql):\/\//i.test(databaseUrl) &&
    Boolean(siteIsSecure) &&
    ips.length > 0;
  const available = credentialsReady && (sandbox || (liveEnabled && liveVerified));

  return {
    available,
    message: available
      ? (sandbox ? "PayFast sandbox is configured. Complete sandbox verification before enabling live payments." : "PayFast live checkout is enabled.")
      : "Online payment setup is pending. Use WhatsApp to request an order or contact Kasi Eats.",
    sandbox,
    processUrl: sandbox ? SANDBOX_PROCESS_URL : LIVE_PROCESS_URL,
    validateUrl: sandbox ? SANDBOX_VALIDATE_URL : LIVE_VALIDATE_URL,
    merchantId: process.env.PAYFAST_MERCHANT_ID || "",
    merchantKey: process.env.PAYFAST_MERCHANT_KEY || "",
    passphrase: process.env.PAYFAST_PASSPHRASE || "",
    siteUrl: siteIsSecure ? siteUrl.origin : "",
    allowedIps: ips,
  };
}
