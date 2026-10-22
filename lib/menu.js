
const deliveryFeeValue = process.env.NEXT_PUBLIC_DELIVERY_FEE;

const parsedDeliveryFee =
  deliveryFeeValue === "" || deliveryFeeValue === undefined
    ? null
    : Number(deliveryFeeValue);

function getHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

const uberEatsUrl = process.env.NEXT_PUBLIC_UBEREATS_URL || "";
const uberEatsParsedUrl = getHttpsUrl(uberEatsUrl);
const uberEatsHost = uberEatsParsedUrl?.hostname || "";

const whatsappNumber = (
  process.env.NEXT_PUBLIC_WHATSAPP || "27659667312"
).replace(/\D/g, "");

export const CONFIG = {
  whatsapp: /^27[0-9]{9,13}$/.test(whatsappNumber)
    ? whatsappNumber
    : "",

  uberEats:
    uberEatsParsedUrl &&
    (uberEatsHost === "ubereats.com" ||
      uberEatsHost.endsWith(".ubereats.com"))
      ? uberEatsUrl
      : "",

  deliveryFee:
    Number.isFinite(parsedDeliveryFee) && parsedDeliveryFee >= 0
      ? parsedDeliveryFee
      : null,

  deliveryAreas: (process.env.NEXT_PUBLIC_DELIVERY_AREAS || "")
    .split(",")
    .map((area) => area.trim())
    .filter(Boolean),

  deliveryInstructions:
    process.env.NEXT_PUBLIC_DELIVERY_INSTRUCTIONS || "",

  collectionInstructions:
    process.env.NEXT_PUBLIC_COLLECTION_INSTRUCTIONS || "",

  area: "Mabopane, Pretoria",
};

export const CATS = ["Mains", "Sides & Drinks"];

export const MENU = [
  {
    id: "m1",
    cat: "Mains",
    name: "Loaded Chips with Bacon",
    desc: "Crispy chips, melted cheese, bacon, spring onion, spicy sauce",
    price: 55,
    img: "/images/Loaded_Chips_with_Bacon_house_Sauce.JPG.jpg",
  },
  {
    id: "m2",
    cat: "Mains",
    name: "Club Sandwich with Chips",
    desc: "Toasted triple-decker with ham, cheese, lettuce, tomato",
    price: 70,
    img: "/images/Club_Sandwich_with_Chips.jpg",
  },
  {
    id: "m3",
    cat: "Mains",
    name: "Chicken Fajita Wrap with Chips",
    desc: "Grilled chicken, peppers and creamy sauce in a warm wrap",
    price: 65,
    img: "/images/Chicken_Wrap_and_Chips.JPG",
    imageFit: "contain",
  },
  {
    id: "m4",
    cat: "Mains",
    name: "Chicken Tenders and Chips",
    desc: "Crumbed chicken strips on hot chips with garlic herb sauce",
    price: 75,
    img: "/images/Chicken_Tenders_and_Chips.jpg",
  },
  {
    id: "m5",
    cat: "Mains",
    name: "Cheese Steak with Chips",
    desc: "Sliced steak, peppers and melted cheese in a toasted roll",
    price: 85,
    img: "/images/Cheese_Steak_with_Chips.jpg",
  },
  {
    id: "m6",
    cat: "Mains",
    name: "Chicken Wings with Chips",
    desc: "Chicken wings served with chips",
    price: null,
    img: "/images/Chicken_Wings_with_Chips.JPG",
    imageFit: "cover",
  },
  {
    id: "s1",
    cat: "Sides & Drinks",
    name: "Slap Chips",
    desc: "Hot, vinegar on request",
    price: 25,
    img: "/images/Slap%20Chips.jpg",
  },
  {
    id: "s2",
    cat: "Sides & Drinks",
    name: "Cold Drink 440ml",
    desc: "Coke, Fanta or Sprite",
    price: 15,
    img: "/images/440ml_drinks.JPG.jpg",
  },
  {
    id: "s3",
    cat: "Sides & Drinks",
    name: "Kasi Eats House Drinks",
    desc: "Freshly chilled house drinks for a quick, satisfying add-on.",
    price: 20,
    img: "/images/Kasi_Eats_House_Drinks.JPG.jpg",
  },
];

export function isValidSaPhone(value) {
  const phone = String(value || "").replace(/[\s()-]/g, "");

  return /^(?:\+27|27)[0-9]{9}$/.test(phone) || /^0[0-9]{9}$/.test(phone);
}

export function isDeliveryAddressAvailable(address) {
  if (!CONFIG.deliveryAreas.length) return null;

  const normalizedAddress = String(address || "")
    .trim()
    .toLocaleLowerCase();

  return CONFIG.deliveryAreas.some((area) =>
    normalizedAddress.includes(area.toLocaleLowerCase())
  );
}

export const rand = (amount) =>
  `R${Number(amount).toFixed(2).replace(/\.00$/, "")}`;
