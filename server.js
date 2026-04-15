// ======================================================
// Campground Guides Referral API - server.js
// Clean, unified version
// ======================================================

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import sgMail from "@sendgrid/mail";
import morgan from "morgan";

// Load environment variables
dotenv.config();

// ----------------------
// Basic Config
// ----------------------
const app = express();
app.set("trust proxy", 1);
app.use(express.json());
app.use(cors());
app.use(morgan(":method :url :status :res[content-length] - :response-time ms"));

// Initialize SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// ----------------------
// CORS Configuration
// ----------------------
const allowedOrigins = [
  "https://campgroundguides.com",
  "https://www.campgroundguides.com",
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
// Referral Route (extended with DB save)
// ----------------------
app.post("/submit-referral", async (req, res) => {
  try {
    const {
      referrer_name,
      referrer_last_name,
      referrer_email,
      referrer_business,
      business,
      dm_name,
      dm_email,
      dm_phone,
      relationship,
      permission,
    } = req.body;

    if (
      !referrer_name ||
      !referrer_last_name ||
      !referrer_email ||
      !business ||
      !dm_name ||
      !dm_email ||
      !relationship ||
      permission !== "yes"
    ) {
      return res.status(400).json({ error: "Missing or invalid required fields." });
    }

    // Save to MongoDB
    const referral = new Referral({
      referrerName: `${referrer_name} ${referrer_last_name}`,
      referrerEmail: referrer_email,
      friendName: dm_name,
      friendEmail: dm_email,
      source: "referral-form",
      status: "email_sent",
    });

    await referral.save();

    // Send notification email
    const msg = {
      to: "info@campgroundguides.com",
      from: "no-reply@campgroundguides.com",
      subject: "New Advertiser Referral Submitted",
      text: `
Referral details:
Referrer: ${referrer_name} ${referrer_last_name}
Email: ${referrer_email}
Business: ${referrer_business || ""}
Advertiser Business: ${business}
Decision Maker: ${dm_name}
DM Email: ${dm_email}
DM Phone: ${dm_phone || ""}
Relationship: ${relationship}
Permission: ${permission}
      `,
    };

    await sgMail.send(msg);

    res.status(200).json({ success: true, message: "Referral submitted successfully." });
  } catch (err) {
    console.error("Referral error:", err);
    res.status(500).json({ error: "Server error while submitting referral." });
  }
});

// ----------------------
// Environment Validation
// ----------------------
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const SENDGRID_TEMPLATE_ID = process.env.SENDGRID_TEMPLATE_ID;
const FROM_EMAIL = process.env.FROM_EMAIL || "info@campgroundguides.com";

if (!SENDGRID_API_KEY) console.error("❌ Missing SENDGRID_API_KEY");
if (!SENDGRID_TEMPLATE_ID) console.error("❌ Missing SENDGRID_TEMPLATE_ID");
if (!MONGODB_URI) console.error("❌ Missing MONGODB_URI");

// ----------------------
// Error Handler
// ----------------------
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err.stack);
  res.status(500).json({ error: "Internal server error." });
});

// ----------------------
// SendGrid Setup
// ----------------------
if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
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
const referralSchema = new mongoose.Schema(
  {
    referrerName: { type: String, required: true },
    referrerEmail: { type: String, required: true },
    friendName: { type: String, required: true },
    friendEmail: { type: String, required: true },
    source: { type: String, default: "referral-form" },
    status: { type: String, default: "email_sent" },
    errorMessage: { type: String, default: null },
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

function isValidEmail(email) {
  const re = /\S+@\S+\.\S+/;
  return re.test(email);
}

function logError(context, error) {
  console.error(`❌ [${context}]`, { message: error.message, stack: error.stack });
}

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