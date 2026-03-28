// ---------------------------------------------
// Campground Guides Backend (Render)
// Stripe Checkout + ACH + Webhooks + Affiliates
// ---------------------------------------------

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");

// Stripe initialization (only once)
const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

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
// Nodemailer Gmail mailer
// ---------------------------------------------
const mailer = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "campgroundguides@gmail.com",
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

// ---------------------------------------------
// Affiliate JSON helpers
// ---------------------------------------------
const affiliatesFilePath = path.join(__dirname, "affiliates.json");

function loadAffiliates() {
  if (!fs.existsSync(affiliatesFilePath)) {
    fs.writeFileSync(affiliatesFilePath, JSON.stringify([], null, 2));
  }
  const data = fs.readFileSync(affiliatesFilePath, "utf8");
  return JSON.parse(data || "[]");
}

function saveAffiliates(affiliates) {
  fs.writeFileSync(affiliatesFilePath, JSON.stringify(affiliates, null, 2));
}

// ---------------------------------------------
// REF-##### generator
// ---------------------------------------------
function generateAffiliateCode(existingCodes = []) {
  let code;
  do {
    const num = Math.floor(10000 + Math.random() * 90000); // 5 digits
    code = `REF-${num}`;
  } while (existingCodes.includes(code));
  return code;
}

// ---------------------------------------------
// Affiliate welcome email + internal notification
// ---------------------------------------------
async function sendAffiliateWelcomeEmail(affiliate) {
  const {
    referrerFirstName,
    referrerLastName,
    referrerEmail,
    referredBusinessName,
    affiliateCode,
    affiliateLink,
  } = affiliate;

  const fromHeader = `"Diana and Wade from Campground Guides" <campgroundguides@gmail.com>`;

  const subject = "Welcome to the Campground Guides Affiliate Program";
  const text = `
Hi ${referrerFirstName} ${referrerLastName},

Thank you for referring ${referredBusinessName} to Campground Guides.

Your affiliate code is: ${affiliateCode}
Your affiliate link is: ${affiliateLink}

Share this link with RV parks, campgrounds, and resorts. When they become advertisers through your link, you’ll earn commissions according to our affiliate terms.

Best,
Diana and Wade
Campground Guides
  `.trim();

  // Email to affiliate
  await mailer.sendMail({
    from: fromHeader,
    to: referrerEmail,
    subject,
    text,
  });

  // Internal notification to Diana & Wade
  await mailer.sendMail({
    from: fromHeader,
    to: "wadeanddiana@gmail.com",
    subject: `New Affiliate Referral Submitted: ${referrerFirstName} ${referrerLastName}`,
    text: `
A new affiliate referral has been submitted.

Referrer: ${referrerFirstName} ${referrerLastName}
Email: ${referrerEmail}
Business: ${affiliate.referrerBusiness || "N/A"}

Referred Business: ${referredBusinessName}
Decision Maker Email: ${affiliate.decisionMakerEmail}
Decision Maker Phone: ${affiliate.decisionMakerPhone || "N/A"}

Affiliate Code: ${affiliateCode}
Affiliate Link: ${affiliateLink}

Relationship Note: ${affiliate.relationshipNote || "N/A"}
Permission Confirmed: ${affiliate.permissionConfirmed ? "Yes" : "No"}

- Campground Guides Backend
    `.trim(),
  });
}

// ---------------------------------------------
// Affiliate creation endpoint
// ---------------------------------------------
app.post("/api/affiliate-referral", async (req, res) => {
  try {
    const {
      referrerFirstName,
      referrerLastName,
      referrerEmail,
      referrerBusiness,
      referredBusinessName,
      decisionMakerEmail,
      decisionMakerPhone,
      relationshipNote,
      permissionConfirmed,
    } = req.body;

    if (
      !referrerFirstName ||
      !referrerLastName ||
      !referrerEmail ||
      !referredBusinessName ||
      !decisionMakerEmail ||
      !permissionConfirmed
    ) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const affiliates = loadAffiliates();
    const existingCodes = affiliates.map((a) => a.affiliateCode);
    const affiliateCode = generateAffiliateCode(existingCodes);

    const affiliateLink = `https://campgroundguides.com/advertising/?ref=${affiliateCode}`;

    const newAffiliate = {
      referrerFirstName,
      referrerLastName,
      referrerEmail,
      referrerBusiness: referrerBusiness || null,
      referredBusinessName,
      decisionMakerEmail,
      decisionMakerPhone: decisionMakerPhone || null,
      relationshipNote: relationshipNote || null,
      permissionConfirmed: !!permissionConfirmed,
      affiliateCode,
      affiliateLink,
      createdAt: new Date().toISOString(),
    };

    affiliates.push(newAffiliate);
    saveAffiliates(affiliates);

    await sendAffiliateWelcomeEmail(newAffiliate);

    return res.status(200).json({
      success: true,
      affiliateCode,
      affiliateLink,
    });
  } catch (err) {
    console.error("Error creating affiliate:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});
// ---------------------------------------------
// Log referral from Make.com
// ---------------------------------------------
app.post("/api/log-referral", async (req, res) => {
  try {
    const {
      affiliateCode,
      advertiserName,
      subscriptionId,
      amount,
      billingCycle,
      email,
      phone,
    } = req.body;

    if (!affiliateCode || !advertiserName || !subscriptionId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Load affiliates to match the affiliateCode
    const affiliates = loadAffiliates();
    const affiliate = affiliates.find(a => a.affiliateCode === affiliateCode);

    if (!affiliate) {
      return res.status(404).json({ error: "Affiliate not found" });
    }

    // Create referral record
    const referrals = loadReferrals();
    const referralRecord = {
      affiliateCode,
      advertiserName,
      subscriptionId,
      amount: amount || 0,
      billingCycle: billingCycle || "unknown",
      email: email || "",
      phone: phone || "",
      date: new Date().toISOString(),
      paid: false
    };

    referrals.push(referralRecord);
    saveReferrals(referrals);

    // Notify affiliate + internal
    await sendCommissionEmail(referralRecord, affiliate);

    return res.status(200).json({ success: true, referralRecord });
  } catch (err) {
    console.error("Error logging referral:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});
// ---------------------------------------------
// Affiliate payout submission (Make.com or form)
// ---------------------------------------------
app.post("/api/payout-submitted", async (req, res) => {
  try {
    const { affiliateCode, method, details } = req.body;

    if (!affiliateCode || !method || !details) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const affiliates = loadAffiliates();
    const affiliate = affiliates.find(a => a.affiliateCode === affiliateCode);

    if (!affiliate) {
      return res.status(404).json({ error: "Affiliate not found" });
    }

    const payouts = loadPayouts();
    const payoutRecord = {
      affiliateCode,
      method,
      details,
      date: new Date().toISOString()
    };

    payouts.push(payoutRecord);
    savePayouts(payouts);

    await sendPayoutConfirmationEmail(payoutRecord, affiliate);

    return res.status(200).json({ success: true, payoutRecord });
  } catch (err) {
    console.error("Error logging payout:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});
// -----------------------------
// PRICE MAP FOR ALL PARKS
// -----------------------------
const priceMap = {
  // Single Park
  cherokee_single_monthly: "price_1S5FgaHw2ZCjSnG42ICAxf7i",
  cherokee_single_annual: "price_1S5FsxHw2ZCjSnG43MHiN6hj",
  meltonhill_single_monthly: "price_1S5FkjHw2ZCjSnG4rXhBv5Zk",
  meltonhill_single_annual: "price_1S5FrfHw2ZCjSnG41ipCFeY5",
  yarberry_single_monthly: "price_1S5FmFHw2ZCjSnG4VaUbYu1a",
  yarberry_single_annual: "price_1S5FpUHw2ZCjSnG4tqc0qHKl",
  greenlee_maysprings_single_monthly: "price_1S5FdFHw2ZCjSnG4wh4S9R72",
  greenlee_maysprings_single_annual: "price_1S5FugHw2ZCjSnG47pEr2XyA",
  greenlee_original_single_monthly: "price_1S5FcNHw2ZCjSnG4Nc5Fn6va",
  greenlee_original_single_annual: "price_1S5FvnHw2ZCjSnG4qJEDpbi9",

  // Multi Park Monthly
  cherokee_multi_monthly: "price_1S5F1aHw2ZCjSnG4MSfCkIh1",
  meltonhill_multi_monthly: "price_1S5F3DHw2ZCjSnG4VVlvmFo5",
  yarberry_multi_monthly: "price_1S5F4SHw2ZCjSnG4LNXwCf0L",
  greenlee_maysprings_multi_monthly: "price_1S5EyMHw2ZCjSnG4xE7YmDkQ",
  greenlee_original_multi_monthly: "price_1S5EwwHw2ZCjSnG4OLIgEwk0",

  // Multi Park Annual
  cherokee_multi_annual: "price_1S5EgRHw2ZCjSnG4pU8Ooac2",
  meltonhill_multi_annual: "price_1S5EiHHw2ZCjSnG4dzd4hNOQ",
  yarberry_multi_annual: "price_1S5EjGHw2ZCjSnG4MtRNHluA",
  greenlee_maysprings_multi_annual: "price_1S5EdHHw2ZCjSnG4zCtJX6U1",
  greenlee_original_multi_annual: "price_1S5EbCHw2ZCjSnG4HaYqjRLl",
};

// -----------------------------
// CREATE CHECKOUT SESSION
// -----------------------------
app.post("/create-checkout-session", async (req, res) => {
  const { parks, billing, referral, businessName } = req.body;

  if (!parks || parks.length === 0 || !billing) {
    return res
      .status(400)
      .json({ error: "Missing park selections or billing option." });
  }

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
      payment_method_types: ["card", "us_bank_account"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: "https://campgroundguides.com/success",
      cancel_url: "https://campgroundguides.com/cancel",
      metadata: {
        referral: referral || "none",
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
// REFERRAL ENDPOINT FOR MAKE.COM
// ---------------------------------------------
app.post("/api/referrals", (req, res) => {
  console.log("📩 Incoming referral:", req.body);
  res.json({ message: "Referral received", data: req.body });
});

// ---------------------------------------------
// START SERVER
// ---------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`✅ Server running on port ${PORT}`)
);

console.log("Stripe key loaded:", !!process.env.STRIPE_SECRET_KEY);