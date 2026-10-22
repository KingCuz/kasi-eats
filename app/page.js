"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { CONFIG, CATS, MENU, isDeliveryAddressAvailable, isValidSaPhone, rand } from "../lib/menu";

const CART_KEY = "kasi-eats-cart";

function OrderStatus({ status, returnState }) {
  if (!returnState) return null;

  const messages = {
    paid: ["Payment confirmed", "PayFast has confirmed your payment. Keep your order reference for collection or delivery."],
    failed: ["Payment not completed", "PayFast could not complete this payment. You can try again or send an order request on WhatsApp."],
    cancelled: ["Checkout cancelled", "No payment has been confirmed. If you already completed a payment, contact us with your order reference."],
    pending: ["Payment confirmation pending", "Your return from PayFast is not proof of payment. We are waiting for PayFast's server notification."],
  };
  const [title, description] = messages[status] || messages.pending;

  return (
    <div className={`payment-status payment-status-${status}`} role="status">
      <strong>{title}</strong>
      <p>{description}</p>
      {returnState.reference && <small>Order reference: {returnState.reference}</small>}
    </div>
  );
}

export default function Home() {
  const [cart, setCart] = useState({});
  const [cartReady, setCartReady] = useState(false);
  const [mode, setMode] = useState("pickup");
  const [customer, setCustomer] = useState({ name: "", phone: "", address: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [paymentAvailable, setPaymentAvailable] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState("Checking online payment availability...");
  const [returnState, setReturnState] = useState(null);
  const [paymentStatus, setPaymentStatus] = useState("pending");
  const [category, setCategory] = useState("All");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(CART_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) setCart(parsed);
      }
    } catch (storageError) {
      console.error("Could not restore the saved Kasi Eats cart.", storageError);
    } finally {
      setCartReady(true);
    }
  }, []);

  useEffect(() => {
    if (!cartReady) return;
    try {
      window.localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch (storageError) {
      console.error("Could not save the Kasi Eats cart.", storageError);
    }
  }, [cart, cartReady]);

  useEffect(() => {
    let active = true;
    fetch("/api/payfast")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Payment availability could not be checked.");
        if (active) {
          setPaymentAvailable(data.available);
          setPaymentMessage(data.message);
        }
      })
      .catch((availabilityError) => {
        console.error("Could not check online payment availability.", availabilityError);
        if (active) setPaymentMessage("Online payment availability could not be checked. Please use WhatsApp.");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const returned = params.get("payment");
    const reference = params.get("reference");
    if (!returned || !reference || !/^[a-zA-Z0-9-]{8,80}$/.test(reference)) return;

    let active = true;
    let attempts = 0;
    setReturnState({ reference, result: returned });
    const checkStatus = async () => {
      attempts += 1;
      try {
        const response = await fetch(`/api/orders/${encodeURIComponent(reference)}`);
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Payment status could not be retrieved.");
        if (!active) return;
        setPaymentStatus(result.status);
        if (result.status === "pending" && attempts < 10) return;
        window.clearInterval(timer);
      } catch (statusError) {
        console.error("Could not retrieve the payment status.", statusError);
        if (active) setPaymentStatus("pending");
        window.clearInterval(timer);
      }
    };
    const timer = window.setInterval(checkStatus, 2000);
    checkStatus();
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const lines = useMemo(
    () => MENU.filter((item) => Number.isFinite(item.price) && cart[item.id]).map((item) => ({ ...item, qty: cart[item.id] })),
    [cart],
  );
  const subtotal = lines.reduce((sum, item) => sum + item.price * item.qty, 0);
  const deliveryFee = mode === "delivery" && subtotal > 0 ? CONFIG.deliveryFee : 0;
  const total = subtotal + deliveryFee;
  const addressAvailable = isDeliveryAddressAvailable(customer.address);
  const nameValid = customer.name.trim().length > 0 && customer.name.trim().length <= 100;
  const phoneValid = isValidSaPhone(customer.phone);
  const addressValid = mode === "pickup" ||
    (customer.address.trim().length >= 5 && customer.address.trim().length <= 255 && addressAvailable !== false);
  const formValid = lines.length > 0 && nameValid && phoneValid && addressValid && !busy;
  const visibleMenu = category === "All" ? MENU : MENU.filter((item) => item.cat === category);
  const whatsappReady = Boolean(CONFIG.whatsapp);

  function updateCustomer(field, value) {
    setCustomer((current) => ({ ...current, [field]: value }));
  }

  function changeQuantity(id, amount) {
    setCart((current) => {
      if (!MENU.some((item) => item.id === id && Number.isFinite(item.price))) return current;
      const quantity = Math.max(0, Math.min(50, (Number(current[id]) || 0) + amount));
      const next = { ...current };
      if (quantity) next[id] = quantity;
      else delete next[id];
      return next;
    });
  }

  const orderSummary = [
    "Hi Kasi Eats, I would like to request this order:",
    ...lines.map((item) => `${item.qty} x ${item.name} - ${rand(item.price * item.qty)}`),
    "",
    `Subtotal: ${rand(subtotal)}`,
    mode === "delivery"
      ? `Local delivery requested to: ${customer.address.trim()}`
      : "Collection / pickup",
    `Delivery fee: ${mode === "delivery" ? (CONFIG.deliveryFee === null ? "Please confirm before accepting" : rand(CONFIG.deliveryFee)) : "R0"}`,
    `Name: ${customer.name.trim()}`,
    `Phone: ${customer.phone.trim()}`,
    `Total: ${mode === "delivery" && CONFIG.deliveryFee === null ? "Please confirm the delivery fee" : rand(total)}`,
    ...(customer.note.trim() ? [`Note: ${customer.note.trim()}`] : []),
    "",
    "Please confirm availability, delivery coverage and the final amount. This message is an order request, not an accepted or paid order.",
  ].join("\n");

  const whatsappUrl = whatsappReady
    ? `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(orderSummary)}`
    : "";

  async function startPayment() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/payfast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: lines.map(({ id, qty }) => ({ id, qty })),
          mode,
          customer,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Payment could not be started.");

      const form = document.createElement("form");
      form.method = "post";
      form.action = data.url;
      form.setAttribute("aria-hidden", "true");
      Object.entries(data.fields).forEach(([name, value]) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = value;
        form.appendChild(input);
      });
      document.body.appendChild(form);
      form.submit();
    } catch (paymentError) {
      setError(paymentError.message || "Payment could not be started.");
      setBusy(false);
    }
  }

  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <a className="brand" href="#home" aria-label="Kasi Eats home">
            <Image src="/images/KasiEats_Leaf_Logo_Wordmark.png" alt="Kasi Eats - Food and Stuff" width={340} height={170} priority />
          </a>
          <nav aria-label="Main navigation">
            <a href="#home">Home</a>
            <a href="#menu">Menu</a>
            <a href="#how-it-works">How it works</a>
            <a href="#contact">Contact</a>
          </nav>
          <div className="header-actions">
            {whatsappReady && (
              <a className="header-whatsapp" href={`https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent("Hi Kasi Eats!")}`} target="_blank" rel="noreferrer">
                WhatsApp
              </a>
            )}
            <a className="button button-small" href="#order">Order now</a>
          </div>
        </div>
      </header>

      <main id="home">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">Food with a little extra heart</p>
            <h1>Good food.<br /><span>Kasi flavour.</span></h1>
            <p className="hero-description">Freshly prepared favourites from Kasi Eats in Mabopane, Pretoria. Choose collection or ask us about local delivery.</p>
            <div className="hero-actions">
              <a className="button" href="#menu">Explore the menu <span aria-hidden="true">→</span></a>
              {whatsappReady && (
                <a className="button button-outline" href={`https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent("Hi Kasi Eats!")}`} target="_blank" rel="noreferrer">
                  Chat on WhatsApp
                </a>
              )}
            </div>
            <p className="hero-note"><span className="status-dot" /> Made for your next good meal</p>
          </div>
          <div className="hero-photo" aria-label="Fresh Kasi Eats favourites">
            <Image src="/images/Loaded_Chips_with_Bacon_house_Sauce.JPG.jpg" alt="Loaded chips topped with bacon, cheese and sauce" fill priority sizes="(max-width: 800px) 100vw, 55vw" />
            <div className="photo-label"><span>Made fresh</span><strong>Every order, full of flavour.</strong></div>
            <span className="photo-spark" aria-hidden="true">✳</span>
          </div>
          <div className="hero-bottom"><span>MADE IN MABOPANE</span><span>GOOD FOOD, NO FUSS</span></div>
        </section>

        <section className="menu-section section-shell" id="menu">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Something for everyone</p>
              <h2>Find your favourite</h2>
              <p>Choose from the current Kasi Eats menu. Prices shown are in South African rand.</p>
            </div>
            <a className="text-link" href="#order">Build your order <span aria-hidden="true">↗</span></a>
          </div>
          <div className="category-tabs" role="group" aria-label="Filter menu by category">
            {["All", ...CATS].map((item) => (
              <button key={item} type="button" className={category === item ? "category-active" : ""} onClick={() => setCategory(item)} aria-pressed={category === item}>
                {item}
              </button>
            ))}
          </div>
          <div className="menu-grid">
            {visibleMenu.map((item, index) => (
              <article className="menu-card" key={item.id}>
                {item.img ? (
                  <div className={`menu-photo${item.imageFit === "contain" ? " menu-photo-preserve" : ""}`}>
                    <Image src={item.img} alt={item.name} fill sizes="(max-width: 600px) 100vw, (max-width: 950px) 50vw, 33vw" priority={index < 2} />
                  </div>
                ) : (
                  <div className="menu-photo menu-photo-placeholder" aria-hidden="true"><span>{item.cat === "Sides & Drinks" ? "SIDES & DRINKS" : "KASI EATS"}</span></div>
                )}
                <div className="menu-card-content">
                  <div className="menu-card-title"><h3>{item.name}</h3><span className={Number.isFinite(item.price) ? "" : "price-pending"}>{Number.isFinite(item.price) ? rand(item.price) : "Price to be confirmed"}</span></div>
                  {item.desc && <p>{item.desc}</p>}
                  <button className="add-button" type="button" disabled={!Number.isFinite(item.price)} onClick={() => changeQuantity(item.id, 1)} aria-label={Number.isFinite(item.price) ? `Add one ${item.name} to order` : `${item.name} is unavailable until its price is confirmed`}>
                    {Number.isFinite(item.price) ? <><span aria-hidden="true">+</span> Add to order {cart[item.id] ? <small>({cart[item.id]} in order)</small> : null}</> : "Ordering unavailable"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="order-section" id="order">
          <div className="order-intro">
            <p className="eyebrow">Your order, your way</p>
            <h2>Ready when you are.</h2>
            <p>Choose collection or request local delivery. We will confirm availability and any delivery charge before your order is accepted.</p>
            <div className="order-points">
              <span><b>01</b> Choose your food</span>
              <span><b>02</b> Tell us how to fulfil it</span>
              <span><b>03</b> We confirm your order</span>
            </div>
          </div>
          <div className="order-panel">
            <div className="order-panel-title"><div><span className="eyebrow">KASI EATS</span><h3>Your order</h3></div><span className="order-count">{lines.reduce((sum, item) => sum + item.qty, 0)} items</span></div>
            <div className="order-lines" aria-live="polite">
              {lines.length === 0 ? <p className="empty-order">Your basket is ready. Add something delicious from the menu.</p> : lines.map((item) => (
                <div className="order-line" key={item.id}>
                  <div><strong>{item.name}</strong><small>{rand(item.price)} each</small></div>
                  <div className="quantity-control" aria-label={`${item.name} quantity`}>
                    <button type="button" onClick={() => changeQuantity(item.id, -1)} aria-label={`Remove one ${item.name}`}>−</button>
                    <span>{item.qty}</span>
                    <button type="button" onClick={() => changeQuantity(item.id, 1)} aria-label={`Add one ${item.name}`}>+</button>
                  </div>
                  <strong className="line-total">{rand(item.price * item.qty)}</strong>
                </div>
              ))}
            </div>
            <div className="fulfilment">
              <span className="field-label">How would you like your order?</span>
              <div className="fulfilment-options" role="group" aria-label="Fulfilment method">
                <button type="button" className={mode === "pickup" ? "fulfilment-active" : ""} onClick={() => setMode("pickup")} aria-pressed={mode === "pickup"}>
                  <span aria-hidden="true">↗</span> Collection / pickup
                </button>
                <button type="button" className={mode === "delivery" ? "fulfilment-active" : ""} onClick={() => setMode("delivery")} aria-pressed={mode === "delivery"}>
                  <span aria-hidden="true">⌂</span> Local delivery
                </button>
              </div>
              {mode === "delivery" && (
                <p className="delivery-notice">
                  {CONFIG.deliveryAreas.length
                    ? `Delivery availability is limited to: ${CONFIG.deliveryAreas.join(", ")}.`
                    : "Delivery coverage around Mabopane is not configured yet. Please request availability by WhatsApp before placing a delivery order."}
                  {CONFIG.deliveryFee === null ? " The delivery fee must also be confirmed." : ` Delivery fee: ${rand(CONFIG.deliveryFee)}.`}
                </p>
              )}
            </div>
            <div className="customer-fields">
              <label>Your name
                <input value={customer.name} maxLength={100} autoComplete="name" onChange={(event) => updateCustomer("name", event.target.value)} required />
              </label>
              <label>Contact number
                <input value={customer.phone} maxLength={20} type="tel" inputMode="tel" autoComplete="tel" placeholder="e.g. 082 123 4567" onChange={(event) => updateCustomer("phone", event.target.value)} required aria-describedby="phone-help" />
                <small id="phone-help">Use a South African mobile or contact number.</small>
              </label>
              {mode === "delivery" && (
                <label>Delivery address
                  <textarea value={customer.address} maxLength={255} autoComplete="street-address" rows={3} placeholder="Street, area and any helpful directions" onChange={(event) => updateCustomer("address", event.target.value)} required />
                  {customer.address && addressAvailable === false && <small className="field-error">That address is outside the configured delivery areas. Ask us on WhatsApp to confirm coverage.</small>}
                </label>
              )}
              <label>Order note <span>(optional)</span>
                <textarea value={customer.note} maxLength={500} rows={2} placeholder="Anything we should know?" onChange={(event) => updateCustomer("note", event.target.value)} />
              </label>
            </div>
            <div className="totals">
              <div><span>Subtotal</span><span>{rand(subtotal)}</span></div>
              {mode === "delivery" && <div><span>Delivery</span><span>{CONFIG.deliveryFee === null ? "Confirm by WhatsApp" : rand(CONFIG.deliveryFee)}</span></div>}
              <div className="total-row"><strong>Total</strong><strong>{mode === "delivery" && CONFIG.deliveryFee === null ? "Confirm by WhatsApp" : rand(total)}</strong></div>
            </div>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button checkout-button" type="button" disabled={!formValid || !paymentAvailable} onClick={startPayment}>
              {busy ? "Connecting to PayFast..." : paymentAvailable ? "Pay securely with PayFast" : "Online payment setup pending"}
            </button>
            {!paymentAvailable && <p className="payment-help">{paymentMessage}</p>}
            {mode === "delivery" && (CONFIG.deliveryFee === null || CONFIG.deliveryAreas.length === 0) && paymentAvailable && (
              <p className="payment-help">Online payment is available after delivery coverage and fee are configured.</p>
            )}
            {whatsappReady && (
              <a className="whatsapp-order" href={formValid ? whatsappUrl : undefined} aria-disabled={!formValid} onClick={(event) => { if (!formValid) event.preventDefault(); }} target="_blank" rel="noreferrer">
                Send order request on WhatsApp <span aria-hidden="true">↗</span>
              </a>
            )}
            {!whatsappReady && <p className="payment-help">WhatsApp ordering is not available until the business number is configured.</p>}
            <p className="order-disclaimer">WhatsApp sends an order request only. Your order is not accepted or paid until Kasi Eats confirms it.</p>
            <OrderStatus status={paymentStatus} returnState={returnState} />
          </div>
        </section>

        <section className="how-section section-shell" id="how-it-works">
          <div><p className="eyebrow">Easy as one, two, three</p><h2>Good food is a few taps away.</h2></div>
          <div className="how-steps">
            <article><span>01</span><h3>Pick your favourites</h3><p>Add what you like from the current menu and check your basket.</p></article>
            <article><span>02</span><h3>Choose your fulfilment</h3><p>Collect your order or ask about local delivery in the configured service area.</p></article>
            <article><span>03</span><h3>We confirm with you</h3><p>Send a WhatsApp request or use online payment when it is configured and available.</p></article>
          </div>
        </section>

        <section className="contact-section" id="contact">
          <div><p className="eyebrow">Made in Mabopane</p><h2>Good food, right here.</h2><p>Kasi Eats — Food and Stuff<br />Mabopane, Pretoria, Gauteng</p></div>
          {whatsappReady && <a className="button" href={`https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent("Hi Kasi Eats, I have a question.")}`} target="_blank" rel="noreferrer">Talk to us on WhatsApp <span aria-hidden="true">↗</span></a>}
        </section>
      </main>

      <footer className="site-footer">
        <a className="footer-brand" href="#home">KASI EATS<span>FOOD AND STUFF</span></a>
        <span>Mabopane, Pretoria, Gauteng</span>
        <a className="developer-credit" href="https://blucode-next.vercel.app" target="_blank" rel="noopener noreferrer">
          <Image src="/images/Blu_Code.dev_Developer;s_Logo.PNG.png" alt="BluCode Dev developer logo" width={2172} height={724} />
          <span>Developed by BluCode Dev™</span>
        </a>
        <a href="#home">Back to top ↑</a>
        <small>© {new Date().getFullYear()} Kasi Eats</small>
      </footer>
    </>
  );
}
