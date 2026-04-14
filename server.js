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
app.use(morgan(":method :url :status :res[content-length] - :response-time ms"));

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
// Referral Submission
// ----------------------
app.post("/api/referral", async (req, res) => {
  console.log("📩 Incoming referral submission body:", req.body);

  try {
    const { referrerName, referrerEmail, friendName, friendEmail } = req.body;

    if (!referrerName || !referrerEmail || !friendName || !friendEmail) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    const normalizedReferrerEmail = normalizeEmail(referrerEmail);
    const normalizedFriendEmail = normalizeEmail(friendEmail);

    if (!isValidEmail(normalizedReferrerEmail)) {
      return res.status(400).json({ success: false, error: "Invalid referrer email format" });
    }
    if (!isValidEmail(normalizedFriendEmail)) {
      return res.status(400).json({ success: false, error: "Invalid friend email format" });
    }

    if (!SENDGRID_API_KEY || !SENDGRID_TEMPLATE_ID) {
      return res.status(500).json({ success: false, error: "Email service not configured" });
    }

    const msg = {
      to: normalizedFriendEmail,
      from: FROM_EMAIL,
      templateId: SENDGRID_TEMPLATE_ID,
      dynamic_template_data: {
        referrerName,
        referrerEmail: normalizedReferrerEmail,
        friendName,
        friendEmail: normalizedFriendEmail,
      },
    };

    let emailError = null;
    try {
      await sgMail.send(msg);
      console.log("✅ SendGrid email sent to:", normalizedFriendEmail);
    } catch (err) {
      emailError = err;
      logError("SendGrid send", err);
    }

    if (MONGODB_URI) {
      try {
        await Referral.create({
          referrerName,
          referrerEmail: normalizedReferrerEmail,
          friendName,
          friendEmail: normalizedFriendEmail,
          status: emailError ? "failed" : "email_sent",
          errorMessage: emailError ? emailError.message : null,
        });
      } catch (dbErr) {
        logError("MongoDB save referral", dbErr);
      }
    }

    if (emailError) {
      return res.status(500).json({ success: false, error: "Failed to send referral email" });
    }

    return res.status(200).json({
      success: true,
      redirect: "https://campgroundguides.com/thank-you-affiliate",
    });
  } catch (error) {
    logError("Referral endpoint", error);
    return res.status(500).json({ success: false, error: "Failed to process referral" });
  }
});

// ----------------------
// Start Server
// ----------------------
app.listen(PORT, () => {
  console.log(`🚀 Campground Guides Referral API running on port ${PORT}`);
});