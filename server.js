// ---------------------------------------------
// Campground Guides Backend (Render)
// Stripe Checkout + ACH + Webhooks
// ---------------------------------------------

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();

// ---------------------------------------------
// CORS — allow your frontend domain
// ---------------------------------------------
app.use(
  cors({
    origin: "https://campgroundguides.com",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);

// ---------------------------------------------
// STRIPE WEBHOOK — MUST use raw body
// ---------------------------------------------
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

app.post(
  "/webhook",
  bodyParser.raw({ type: "application/json" }),
  (request, response) => {
    const sig = request.headers["stripe-signature"];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        request.body,
        sig,
        endpointSecret
      );
    } catch (err) {
      console.log("⚠️ Webhook signature verification failed:", err.message);
      return response.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle ACH + subscription events
    switch (event.type) {
      case "payment_intent.succeeded":
        console.log("💰 Payment succeeded:", event.data.object.id);
        break;

      case "payment_intent.payment_failed":
        console.log("❌ Payment failed:", event.data.object.id);
        break;

      case "charge.refunded":
        console.log("🔄 Charge refunded:", event.data.object.id);
        break;

      case "charge.dispute.created":
        console.log("⚠️ Dispute created:", event.data.object.id);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    response.sendStatus(200);
  }
);

// ---------------------------------------------
// JSON parser — MUST come AFTER webhook
// ---------------------------------------------
app.use(express.json());

// ---------------------------------------------
// CREATE CHECKOUT SESSION (Single Park)
// ---------------------------------------------
app.post("/create-checkout-session", async (req, res) => {
  try {
    const {
      businessName,
      businessAddress,
      businessPhone,
      contactName,
      priceId,
    } = req.body;

    if (!priceId) {
      return res.status(400).json({ error: "Missing price ID." });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card", "us_bank_account"], // ACH enabled
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: "https://campgroundguides.com/success",
      cancel_url: "https://campgroundguides.com/cancel",
      metadata: {
        business_name: businessName || "",
        business_address: businessAddress || "",
        business_phone: businessPhone || "",
        contact_name: contactName || "",
      },
    });

    return res.json({ checkoutUrl: session.url });
  } catch (err) {
    console.error("Stripe session error:", err);
    return res
      .status(500)
      .json({ error: "Failed to create checkout session." });
  }
});

// ---------------------------------------------
// START SERVER
// ---------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`✅ Server running on port ${PORT}`)
);
