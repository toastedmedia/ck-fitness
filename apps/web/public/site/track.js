/* CHARDIKALA Fitness website tracking (chardikalafitness.com).
   Google Analytics 4 (G-GV1Q50JX1X) + Meta Pixel (3281655158675256), plus the Meta Conversions API
   through our own server (/api/meta-capi) with the same event ID, so Meta counts each action once.
   - Every page: GA4 page_view (automatic) + Meta PageView (browser + server).
   - Every button and link: GA4 "button_click" + Meta "ButtonClick" (label, page, link).
   - Key actions: WhatsApp -> Contact, consultation page -> ViewContent, booking confirmed (/consult) -> Schedule, Stripe checkout -> InitiateCheckout,
     paid -> Purchase, intro video -> ViewContent, app sign-up link -> Lead (all browser + server).
   Never loaded inside the CK Fitness iPhone/Android app. No names, emails or health data. */
(function () {
  "use strict";
  if (navigator.userAgent.indexOf("CKFitnessApp") !== -1) return;
  var GA_ID = "G-GV1Q50JX1X";
  var PIXEL_ID = "3281655158675256";
  var CAPI = "/api/meta-capi";

  // Google Analytics 4
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  gtag("js", new Date());
  gtag("config", GA_ID, { anonymize_ip: true });
  var g = document.createElement("script");
  g.async = true;
  g.src = "https://www.googletagmanager.com/gtag/js?id=" + GA_ID;
  document.head.appendChild(g);

  // Meta Pixel
  if (!window.fbq) {
    var n = (window.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    });
    window._fbq = n; n.push = n; n.loaded = true; n.version = "2.0"; n.queue = [];
    var f = document.createElement("script");
    f.async = true;
    f.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(f);
  }
  fbq("init", PIXEL_ID);

  function eid(name) {
    return name + "." + Date.now().toString(36) + "." + Math.random().toString(36).slice(2, 10);
  }
  function server(name, id, data) {
    try {
      var body = JSON.stringify({ event_name: name, event_id: id, event_source_url: location.href, custom_data: data || {} });
      if (navigator.sendBeacon) navigator.sendBeacon(CAPI, new Blob([body], { type: "application/json" }));
      else fetch(CAPI, { method: "POST", headers: { "content-type": "application/json" }, body: body, keepalive: true });
    } catch (e) {}
  }
  /** A Meta standard event, in the browser and through the server with one shared event ID. */
  function meta(name, data) {
    var id = eid(name);
    fbq("track", name, data || {}, { eventID: id });
    server(name, id, data);
  }
  window.ckSite = {
    meta: meta,
    /** Hooks for the page's own script (checkout and the paid thank-you). */
    page: function (ev) {
      if (ev === "checkout_click") {
        meta("InitiateCheckout", { value: 89, currency: "CAD", content_name: "30-Day Winter Fitness Challenge" });
        gtag("event", "begin_checkout", { value: 89, currency: "CAD" });
      } else if (ev === "purchase") {
        meta("Purchase", { value: 89, currency: "CAD", content_name: "30-Day Winter Fitness Challenge" });
        gtag("event", "purchase", { value: 89, currency: "CAD", transaction_id: eid("wc") });
      }
    },
  };

  meta("PageView");

  function label(el) {
    var t = el.getAttribute("data-track") || el.getAttribute("aria-label") || el.textContent || el.value || "";
    return t.replace(/\s+/g, " ").trim().slice(0, 80) || "(no text)";
  }
  document.addEventListener("click", function (e) {
    var el = e.target && e.target.closest && e.target.closest('a, button, [role="button"], summary, input[type="submit"]');
    if (!el || el.hasAttribute("data-no-track")) return;
    var href = el.tagName === "A" ? el.getAttribute("href") || "" : "";
    var safe = /^(mailto|tel|sms):/i.test(href) ? href.split(":")[0] : href.split("?")[0];
    var p = { button_text: label(el), page_path: location.pathname };
    if (safe) p.link_url = safe.slice(0, 200);
    gtag("event", "button_click", p);
    fbq("trackCustom", "ButtonClick", p);
    // Key actions (checkout is reported by the page itself through ckSite.page).
    if (/wa\.me|whatsapp\.com/i.test(href)) {
      meta("Contact", { content_name: "WhatsApp" });
      gtag("event", "contact", { method: "whatsapp" });
    } else if (/toastedmedia\.ca\/widget\/bookings/i.test(href)) {
      // Leaving for the booking page directly (Schedule = a confirmed booking, sent from /consult).
      fbq("trackCustom", "BookingLinkClick", p);
      gtag("event", "book_consultation_click");
    } else if (/^\/(consult|book)\b/.test(href)) {
      gtag("event", "book_consultation", { method: "consult_link" });
    } else if (/instagram\.com/i.test(href)) {
      fbq("trackCustom", "InstagramClick", p);
      gtag("event", "instagram_click");
    } else if (/app\.chardikalafitness\.com\/signup/i.test(href)) {
      meta("Lead", { content_name: "App sign-up link" });
      gtag("event", "generate_lead", { method: "app_signup_link" });
    } else if (/^\/?#join$|^\/#join/.test(href)) {
      meta("ViewContent", { content_name: "30-Day Winter Fitness Challenge" });
      gtag("event", "view_challenge", { method: "links_page" });
    } else if (el.hasAttribute("data-video")) {
      meta("ViewContent", { content_name: "Winter Challenge intro video" });
      gtag("event", "video_open", { video_title: "Winter Challenge intro" });
    }
  }, true);
})();
