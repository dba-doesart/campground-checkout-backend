// ======================================================
// Campground Guides Referral API - server.js
// Complete, structured, production-style version
// ======================================================

// ----------------------
// Imports & Setup
// ----------------------
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import sgMail from "@sendgrid/mail";
import morgan from "morgan";
import path from "path";

// Load environment variables from .env (in local dev; Render injects env vars)
dotenv.config();

// ----------------------
// Basic Config
// ----------------------
const app = express();

// Trust proxy (useful on Render / behind proxies)
app.set("trust proxy", 1);

// JSON body parsing
app.use(express.json());

// HTTP request logging
app.use(
  morgan(":method :url :status :res[content-length] - :response-time ms")
);

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
      // Allow non-browser tools (like curl/postman) with no origin
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) !== -1) {
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

// Handle preflight explicitly (optional but explicit)
app.options("*", cors());

// ----------------------
// Environment Validation
// ----------------------
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const SENDGRID_TEMPLATE_ID = process.env.SENDGRID_TEMPLATE_ID;
const FROM_EMAIL = process.env.FROM_EMAIL || "info@campgroundguides.com";

if (!SENDGRID_API_KEY) {
  console.error("❌ Missing SENDGRID_API_KEY in environment variables");
}

if (!SENDGRID_TEMPLATE_ID) {
  console.error("❌ Missing SENDGRID_TEMPLATE_ID in environment variables");
}

if (!MONGODB_URI) {
  console.error("❌ Missing MONGODB_URI in environment variables");
}

// ----------------------
// SendGrid Setup
// ----------------------
if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
}

// ----------------------
// MongoDB / Mongoose Setup
// ----------------------
if (process.env.MONGODB_URI) {
  mongoose
    .connect(process.env.MONGODB_URI)
    .then(() => {
      console.log("✅ Connected to MongoDB");
    })
    .catch((err) => {
      console.error("❌ MongoDB connection error:", err.message);
    });
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
    status: { type: String, default: "email_sent" }, // or "pending", "failed"
    errorMessage: { type: String, default: null },
  },
  {
    timestamps: true,
  }
);

let Referral;
try {
  Referral = mongoose.model("Referral");
} catch (e) {
  Referral = mongoose.model("Referral", referralSchema);
}

// ======================================================
// Utility Helpers
// ======================================================

/**
 * Normalize email (trim + lowercase)
 */
function normalizeEmail(email) {
  if (!email) return "";
  return String(email).trim().toLowerCase();
}

/**
 * Basic email format check (not perfect, but good enough)
 */
function isValidEmail(email) {
  const re = /\S+@\S+\.\S+/;
  return re.test(email);
}

/**
 * Log structured error
 */
function logError(context, error) {
  console.error(`❌ [${context}]`, {
    message: error.message,
    stack: error.stack,
  });
}

// ======================================================
// Routes Referrals
// ======================================================
const express = require("express");
const router = express.Router();
const Referral = require("../models/Referral"); // adjust path to your model
const sgMail = require("@sendgrid/mail");

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// POST /api/referrals
router.post("/", async (req, res) => {
  console.log("🔥 Referral endpoint hit");
  try {
    const referral = new Referral(req.body);
    await referral.save();

    await sgMail.send({
      to: "info@campgroundguides.com",
      from: process.env.EMAIL_USER,
      templateId: process.env.SENDGRID_TEMPLATE_ID,
      dynamic_template_data: req.body
    });

    res.status(200).json({ message: "Referral submitted successfully" });
  } catch (err) {
    console.error("❌ Referral submission error:", err);
    res.status(500).json({ error: "Referral submission failed" });
  }
});

module.exports = router;
// ----------------------
// Health Check
// ----------------------
app.get("/health", async (req, res) => {
  const health = {
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  };

  // Optionally check MongoDB
  if (mongoose.connection.readyState === 1) {
    health.mongo = "connected";
  } else {
    health.mongo = "disconnected";
  }

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

    // Basic validation
    if (!referrerName || !referrerEmail || !friendName || !friendEmail) {
      console.log("❌ Missing required fields in referral submission");
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
      });
    }

    const normalizedReferrerEmail = normalizeEmail(referrerEmail);
    const normalizedFriendEmail = normalizeEmail(friendEmail);

    if (!isValidEmail(normalizedReferrerEmail)) {
      return res.status(400).json({
        success: false,
        error: "Invalid referrer email format",
      });
    }

    if (!isValidEmail(normalizedFriendEmail)) {
      return res.status(400).json({
        success: false,
        error: "Invalid friend email format",
      });
    }

    // ----------------------
    // Prepare SendGrid Message
    // ----------------------
    if (!SENDGRID_API_KEY || !SENDGRID_TEMPLATE_ID) {
      console.error("❌ SendGrid not fully configured");
      return res.status(500).json({
        success: false,
        error: "Email service not configured",
      });
    }

    const msg = {
      to: normalizedFriendEmail,
      from: FROM_EMAIL,
      templateId: SENDGRID_TEMPLATE_ID,
      dynamicTemplateData: {
        referrerName,
        referrerEmail: normalizedReferrerEmail,
        friendName,
        friendEmail: normalizedFriendEmail,
      },
    };

    // ----------------------
    // Send Email
    // ----------------------
    let emailError = null;
    try {
      await sgMail.send(msg);
      console.log("✅ SendGrid email sent successfully to:", normalizedFriendEmail);
    } catch (err) {
      emailError = err;
      logError("SendGrid send", err);
    }

    // ----------------------
    // Save Referral to DB (even if email failed, for debugging)
    // ----------------------
    let savedReferral = null;
    if (MONGODB_URI) {
      try {
        savedReferral = await Referral.create({
          referrerName,
          referrerEmail: normalizedReferrerEmail,
          friendName,
          friendEmail: normalizedFriendEmail,
          status: emailError ? "failed" : "email_sent",
          errorMessage: emailError ? emailError.message : null,
        });
        console.log("💾 Referral saved with id:", savedReferral._id.toString());
      } catch (dbErr) {
        logError("MongoDB save referral", dbErr);
      }
    } else {
      console.warn("⚠️ MONGODB_URI not set; referral not persisted.");
    }

    // ----------------------
    // Response to Frontend
    // ----------------------
    if (emailError) {
      // Email failed, but we may still have saved the referral
      return res.status(500).json({
        success: false,
        error: "Failed to send referral email",
        redirect: null,
      });
    }

    // Success: tell frontend where to redirect
    return res.status(200).json({
      success: true,
      redirect: "https://campgroundguides.com/thank-you-affiliate",
    });
  } catch (error) {
    logError("Referral endpoint", error);

    return res.status(500).json({
      success: false,
      error: "Failed to process referral",
    });
  }
});

// ----------------------
// Optional: Static Hosting (if you ever serve a built frontend)
// ----------------------
// const clientBuildPath = path.join(__dirname, "client", "build");
// app.use(express.static(clientBuildPath));

// app.get("*", (req, res) => {
//   res.sendFile(path.join(clientBuildPath, "index.html"));
// });

// ======================================================
// Start Server
// ======================================================
app.listen(PORT, () => {
  console.log(`🚀 Campground Guides Referral API running on port ${PORT}`);
});