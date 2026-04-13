// ===============================
//  Campground Guides Backend
//  Full server.js (Clean Version)
// ===============================

import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import sendEmail from "./sendEmail.js";

dotenv.config();

const app = express();

// -------------------------------
// Middleware
// -------------------------------

// Parse JSON bodies
app.use(express.json());

// CORS
app.use(
  cors({
    origin: "https://campgroundguides.com",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  })
);

// -------------------------------
// MongoDB Connection
// -------------------------------
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

// -------------------------------
// Database Schemas
// -------------------------------
const ReferrerSchema = new mongoose.Schema({
  first_name: String,
  last_name: String,
  email: String,
  business: String,
});

const ReferralSchema = new mongoose.Schema({
  referrer: { type: mongoose.Schema.Types.ObjectId, ref: "Referrer" },
  business_referred: String,
  decision_maker_name: String,
  decision_maker_email: String,
  decision_maker_phone: String,
  relationship: String,
  permission: Boolean,
  createdAt: { type: Date, default: Date.now },
});

const Referrer = mongoose.model("Referrer", ReferrerSchema);
const Referral = mongoose.model("Referral", ReferralSchema);
// -------------------------------
// Referral Submission Route (Fixed for Instant Response)
// -------------------------------
app.post("/api/referrals", async (req, res) => {
  console.log("🔥 Referral endpoint hit");
  console.log("Incoming body:", req.body);

  // 1. IMMEDIATE RESPONSE — prevents 504 timeout
  res.status(200).json({
    success: true,
    message: "Referral received",
  });

  // 2. Continue processing in the background
  try {
    const {
      referring_first_name,
      referring_last_name,
      referring_email,
      referring_business,
      business_referred,
      decision_maker_name,
      decision_maker_email,
      decision_maker_phone,
      relationship,
      permission,
    } = req.body;

    // Normalize permission
    const permissionBoolean =
      permission === true ||
      permission === "true" ||
      permission === "Yes" ||
      permission === "yes";

    // Find or create referrer
    let referrer = await Referrer.findOne({ email: referring_email });

    if (!referrer) {
      referrer = await Referrer.create({
        first_name: referring_first_name,
        last_name: referring_last_name,
        email: referring_email,
        business: referring_business || "",
      });
    }

    // Create referral
    const referral = await Referral.create({
      referrer: referrer._id,
      business_referred,
      decision_maker_name,
      decision_maker_email,
      decision_maker_phone: decision_maker_phone || "",
      relationship: relationship || "",
      permission: permissionBoolean,
    });

    // Send email
    try {
      await sendEmail({
        to: "info@campgroundguides.com",
        subject: "New Advertiser Referral Submitted",
        html: `
          <h2>New Advertiser Referral</h2>
          <p><strong>Referring Party:</strong> ${referring_first_name} ${referring_last_name}</p>
          <p><strong>Email:</strong> ${referring_email}</p>
          <p><strong>Business (Referrer):</strong> ${referring_business || "N/A"}</p>
          <p><strong>Business Referred:</strong> ${business_referred}</p>
          <p><strong>Decision Maker:</strong> ${decision_maker_name}</p>
          <p><strong>Decision Maker Email:</strong> ${decision_maker_email}</p>
          <p><strong>Decision Maker Phone:</strong> ${decision_maker_phone || "N/A"}</p>
          <p><strong>Relationship:</strong> ${relationship || "N/A"}</p>
          <p><strong>Permission Confirmed:</strong> ${permissionBoolean ? "Yes" : "No"}</p>
        `,
      });
    } catch (emailError) {
      console.error("Email sending failed:", emailError);
    }

    console.log("Referral processed successfully");
  } catch (error) {
    console.error("Referral submission failed:", error);
  }
});
// -------------------------------
// Root Route
// -------------------------------
app.get("/", (req, res) => {
  res.send("Campground Guides Backend Running");
});

// -------------------------------
// Start Server
// -------------------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});