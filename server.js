/* ======================================================
   Campground Guides Referral API - server.js
   Clean, safe, stable version with phone number + full emails
   ====================================================== */


import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import nodemailer from "nodemailer";
import morgan from "morgan";
import checkoutRoutes from "./routes/checkout.js";

dotenv.config();


// ----------------------
// Basic Config
// ----------------------
const app = express();
app.set("trust proxy", 1);
app.use(express.json());
app.use(morgan(":method :url :status :res[content-length] - :response-time ms"));
app.use("/api", checkoutRoutes);

// ----------------------
// CORS Configuration
// ----------------------
const allowedOrigins = [
  "https://campgroundguides.com",
  "https://www.campgroundguides.com",
  "https://affiliate.campgroundguides.com",
  "https://multi-park.campgroundguides.com",
  "http://localhost:3000",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      console.warn("❗ Blocked CORS origin:", origin);
      return callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
    credentials: false,
  })
);

app.options("*", cors());

// ----------------------
// Environment Validation
// ----------------------
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;
const SMTP_HOST = process.env.SMTP_HOST || "smtp.hostinger.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_USER = process.env.SMTP_USER || "info@campgroundguides.com";
const SMTP_PASS = process.env.SMTP_PASS;
const FROM_EMAIL = process.env.FROM_EMAIL || "info@campgroundguides.com";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "info@campgroundguides.com";

if (!SMTP_PASS) console.error("❌ Missing SMTP_PASS (Hostinger mailbox password)");
if (!MONGODB_URI) console.error("❌ Missing MONGODB_URI");

// ----------------------
// Error Handler
// ----------------------
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err.stack);
  res.status(500).json({ error: "Internal server error." });
});

// ----------------------
// Email Setup (Hostinger mailbox via SMTP)
// ----------------------
const mailer = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465, // SSL on 465, STARTTLS on 587
  auth: { user: SMTP_USER, pass: SMTP_PASS },
});

if (SMTP_PASS) {
  mailer
    .verify()
    .then(() => console.log("✅ Email (SMTP) ready"))
    .catch((err) => console.error("❌ Email (SMTP) login failed:", err.message));
}

async function sendMail({ to, subject, text }) {
  return mailer.sendMail({
    from: `"Campground Guides" <${FROM_EMAIL}>`,
    to,
    subject,
    text,
  });
}

// ----------------------
// MongoDB / Mongoose Setup
// ----------------------
if (MONGODB_URI) {
  mongoose
    .connect(MONGODB_URI)
    .then(() => console.log("✅ Connected to MongoDB"))
    .catch((err) => console.error("❌ MongoDB connection error:", err.message));
}

// ----------------------
// Mongoose Schema & Model
// ----------------------

// We KEEP this schema exactly as-is so nothing breaks.
// We simply map your new fields into these existing ones.

const referralSchema = new mongoose.Schema(
  {
    referrerName: { type: String, required: true },
    referrerEmail: { type: String, required: true },

    // These are legacy fields — we keep them so MongoDB doesn't break.
    friendName: { type: String, required: true },
    friendEmail: { type: String, required: true },

    business: { type: String },
    source: { type: String, default: "referral-form" },
    status: { type: String, default: "submitted" },
    errorMessage: { type: String, default: null },

    // NEW FIELD — safe to add
    dmPhoneNumber: { type: String },
  },
  { timestamps: true }
);

let Referral;
try {
  Referral = mongoose.model("Referral");
} catch {
  Referral = mongoose.model("Referral", referralSchema);
}

// ----------------------
// Utility Helpers
// ----------------------
function normalizeEmail(email) {
  return email ? String(email).trim().toLowerCase() : "";
}

// ----------------------
// Referral Route (POST)
// ----------------------
app.post("/api/referrals", async (req, res) => {
  try {
    const {
      referrer_name,
      referrer_last_name,
      referrer_email,
      business,
      dm_name,
      dm_email,
      dm_phone_number,
      permission,
    } = req.body;
    const relationship =
      (req.body.relationship && String(req.body.relationship).trim()) ||
      "Not provided";

    // Validate required fields
    if (
      !referrer_name ||
      !referrer_last_name ||
      !referrer_email ||
      !business ||
      !dm_name ||
      !dm_email ||
      permission !== "yes"
    ) {
      return res
        .status(400)
        .json({ error: "Missing or invalid required fields." });
    }

    // Save referral to MongoDB (mapping new fields to legacy schema)
    const referral = new Referral({
      referrerName: `${referrer_name} ${referrer_last_name}`,
      referrerEmail: normalizeEmail(referrer_email),

      // Legacy fields mapped to new meaning
      friendName: dm_name,
      friendEmail: normalizeEmail(dm_email),

      business,
      dmPhoneNumber: dm_phone_number,
      source: "referral-form",
      status: "submitted",
    });

    await referral.save();

    // ----------------------
    // Send Emails
    // The referral is already saved, so an email problem should not
    // show the person an error (that caused duplicate submissions).
    // Failures are logged and recorded on the referral instead.
    // ----------------------
    try {

    // Thank-you email to referrer
    await sendMail({
      to: referrer_email,
      from: FROM_EMAIL,
      subject: "Thank you for your referral!",
      text: `Hi ${referrer_name},

Thank you for referring ${business} to Campground Guides! We appreciate your support.

— Campground Guides Team`,
    });

    // Heads-up email to the referred business
    await sendMail({
      to: dm_email,
      from: FROM_EMAIL,
      subject: "You were recommended to Campground Guides",
      text: `Hi ${dm_name},

You were recommended to us by someone who thinks highly of your business. At Campground Guides, we help RV travelers discover great local businesses through our digital guest service app.

We’d love to show you how your business could appear on our interactive map — complete with photos, videos, and your story.

If you’d like a quick 15‑minute walkthrough, just reply to this email and we’ll set up a time.

Warm regards,
Wade & Diana Wilson
Campground Guides`,
    });

    // Admin notification (full details)
    const adminMsg = {
      to: ADMIN_EMAIL,
      subject: "New Advertiser Referral Submitted",
      text: `A new advertiser referral has been submitted.

Referring Party: ${referrer_name} ${referrer_last_name}
Referrer Email: ${referrer_email}

Business (Referrer): ${business}

Decision Maker: ${dm_name}
Decision Maker Email: ${dm_email}
Decision Maker Phone: ${dm_phone_number}

Relationship: ${relationship}
Permission to Contact: ${permission}

Submitted via Campground Guides Referral Form.`,
    };

    await sendMail(adminMsg);
    } catch (emailErr) {
      console.error("Referral email error:", emailErr.message);
      referral.status = "email_failed";
      referral.errorMessage = emailErr.message;
      await referral.save().catch(() => {});
    }

    res
      .status(200)
      .json({ success: true, message: "Referral submitted successfully." });
  } catch (err) {
    console.error("Referral error:", err);
    res
      .status(500)
      .json({ error: "Server error while submitting referral." });
  }
});

// ----------------------
// Health Check
// ----------------------
app.get("/health", (req, res) => {
  const health = {
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    mongo: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  };
  res.status(200).json(health);
});

// ----------------------
// Root Route
// ----------------------
app.get("/", (req, res) => {
  res.send("Campground Guides Referral API is running.");
});

// ----------------------
// Start Server
// ----------------------
app.listen(PORT, () => {
  console.log(`🚀 Campground Guides Referral API running on port ${PORT}`);
});
