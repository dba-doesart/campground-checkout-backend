// ======================================================
// Campground Guides Referral API - server.js
// Corrected version with proper field names
// ======================================================

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import sgMail from "@sendgrid/mail";
import morgan from "morgan";
import path from "path";

dotenv.config();

const app = express();
app.set("trust proxy", 1);
app.use(express.json());
app.use(morgan(":method :url :status :res[content-length] - :response-time ms"));

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

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const SENDGRID_TEMPLATE_ID = process.env.SENDGRID_TEMPLATE_ID;
const FROM_EMAIL = process.env.FROM_EMAIL || "info@campgroundguides.com";

if (!SENDGRID_API_KEY) console.error("❌ Missing SENDGRID_API_KEY");
if (!SENDGRID_TEMPLATE_ID) console.error("❌ Missing SENDGRID_TEMPLATE_ID");
if (!MONGODB_URI) console.error("❌ Missing MONGODB_URI");

if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
}

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
    referrer_name: { type: String, required: true },
    referrer_last_name: { type: String, required: true },
    referrer_email: { type: String, required: true },
    referrer_business: { type: String, required: true },
    business: { type: String, required: true },
    dm_name: { type: String, required: true }, // or decision_maker_name
    dm_email: { type: String, required: true }, // or decision_maker_email
    dm_phone: { type: String, required: true }, // or decision_maker_phone
    relationship: { type: String, required: true },
    permission: { type: String, enum: ["yes", "no"], required: true },
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

    // Required field check
    if (
      !referrer_name ||
      !referrer_last_name ||
      !referrer_email ||
      !business ||
      !dm_name ||
      !dm_email ||
      !relationship ||
      !permission
    ) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    // Normalize and validate emails
    const normalizedReferrerEmail = normalizeEmail(referrer_email);
    const normalizedDmEmail = normalizeEmail(dm_email);

    if (!isValidEmail(normalizedReferrerEmail)) {
      return res.status(400).json({ success: false, error: "Invalid referrer email format" });
    }
    if (!isValidEmail(normalizedDmEmail)) {
      return res.status(400).json({ success: false, error: "Invalid decision maker email format" });
    }

    // Permission must be "yes" (checkbox checked)
    if (permission !== "yes") {
      return res.status(400).json({ success: false, error: "Permission must be yes" });
    }

    if (!SENDGRID_API_KEY || !SENDGRID_TEMPLATE_ID) {
      return res.status(500).json({ success: false, error: "Email service not configured" });
    }

    // Build SendGrid message with template variables
    // const msg = {
//      to: "info@campgroundguides.com", // notify your team
//      from: FROM_EMAIL,
//      templateId: SENDGRID_TEMPLATE_ID,
//      dynamic_template_data: {
//        referring_first_name: referrer_name,
//      referring_last_name: referrer_last_name,
//        referring_email: normalizedReferrerEmail,
//        referring_business: referrer_business,
//        business_referred: business,
//        decision_maker_name: dm_name,
//        decision_maker_email: normalizedDmEmail,
//        decision_maker_phone: dm_phone,
//        relationship: relationship,
//        permission: permission
//      },
//    };
// old template send commented out
 //   if (MONGODB_URI) {
 //     try {
 //   await sgMail.send(msg);
//   console.log("✅ SendGrid email sent to info@campgroundguides.com");
// } catch (err) {
//   emailError = err;
//   logError("SendGrid send", err);
// }

const msg = {
  to: 'campgroundguides@gmail.com',   // test recipient
  from: process.env.FROM_EMAIL,       // Gmail sender
  reply_to: 'info@campgroundguides.com',
  subject: 'Referral Test',
  text: 'This is a test email to confirm redirect flow.',
};

sgMail.send(msg)
  .then(() => {
    console.log('✅ Test email sent successfully');
  })
  .catch((error) => {
    console.error('❌ SendGrid error:', error);
    emailError = error;
  });

// Save referral to MongoDB

        await Referral.create({
          referrer_name,
          referrer_last_name,
          referrer_email: normalizedReferrerEmail,
          referrer_business,
          business,
          dm_name,
          dm_email: normalizedDmEmail,
          dm_phone,
          relationship,
          permission,
          status: emailError ? "failed" : "email_sent",
          errorMessage: emailError ? emailError.message : null,
        });
      } catch (dbErr) {
        logError("MongoDB save referral", dbErr);
      
    }

    if (emailError) {
      return res.status(500).json({ success: false, error: "Failed to send referral email" });
    }

    return res.redirect("https://campgroundguides.com/thank-you-affiliate");
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