import { CONFIG, MENU, isDeliveryAddressAvailable, isValidSaPhone } from "./menu";

export class OrderValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "OrderValidationError";
  }
}

export function validateOrder(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new OrderValidationError("Invalid order details.");
  }
  if (input.mode !== "pickup" && input.mode !== "delivery") {
    throw new OrderValidationError("Choose collection or local delivery.");
  }
  if (!Array.isArray(input.lines) || input.lines.length < 1 || input.lines.length > MENU.length) {
    throw new OrderValidationError("Your order must include at least one valid menu item.");
  }
  if (!input.customer || typeof input.customer !== "object" || Array.isArray(input.customer)) {
    throw new OrderValidationError("Enter your contact details.");
  }

  const seen = new Set();
  const items = input.lines.map((line) => {
    if (!line || typeof line !== "object" || Array.isArray(line) || typeof line.id !== "string" || !Number.isInteger(line.qty)) {
      throw new OrderValidationError("One or more order items are invalid.");
    }
    const menuItem = MENU.find((item) => item.id === line.id);
    if (!menuItem || line.qty < 1 || line.qty > 50 || seen.has(line.id)) {
      throw new OrderValidationError("One or more order items are invalid.");
    }
    if (!Number.isFinite(menuItem.price) || menuItem.price < 0) {
      throw new OrderValidationError(`${menuItem.name} cannot be ordered until its price is confirmed.`);
    }
    seen.add(line.id);
    return {
      id: menuItem.id,
      name: menuItem.name,
      qty: line.qty,
      unitPriceCents: Math.round(menuItem.price * 100),
    };
  });

  const name = typeof input.customer.name === "string" ? input.customer.name.trim() : "";
  const phone = typeof input.customer.phone === "string" ? input.customer.phone.trim() : "";
  const address = typeof input.customer.address === "string" ? input.customer.address.trim() : "";
  const note = typeof input.customer.note === "string" ? input.customer.note.trim() : "";
  if (!name || name.length > 100) throw new OrderValidationError("Enter a name of up to 100 characters.");
  if (!isValidSaPhone(phone)) throw new OrderValidationError("Enter a valid South African contact number.");
  if (note.length > 500) throw new OrderValidationError("Order notes must be 500 characters or fewer.");
  if (input.mode === "delivery") {
    if (address.length < 5 || address.length > 255) {
      throw new OrderValidationError("Enter a delivery address of up to 255 characters.");
    }
    if (isDeliveryAddressAvailable(address) === false) {
      throw new OrderValidationError("That address is outside the configured delivery area.");
    }
  }

  const subtotalCents = items.reduce((sum, item) => sum + item.unitPriceCents * item.qty, 0);
  if (!subtotalCents) throw new OrderValidationError("Your cart is empty.");
  const deliveryFeeCents = input.mode === "delivery" && CONFIG.deliveryFee !== null
    ? Math.round(CONFIG.deliveryFee * 100)
    : 0;

  return {
    mode: input.mode,
    customer: {
      name,
      phone: phone.replace(/[\s()-]/g, "").replace(/^0/, "27").replace(/^\+/, ""),
      address: input.mode === "delivery" ? address : "",
      note,
    },
    items,
    subtotalCents,
    deliveryFeeCents,
    totalCents: subtotalCents + deliveryFeeCents,
  };
}
