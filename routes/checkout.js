import express from "express";
import Stripe from "stripe";

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Your price table
const PRICE_TABLE = {
  monthly: {
    1: "price_1U47y2Hw2ZCjSnG408sI7KX1",
    2: "price_1U46FjHw2ZCjSnG4luCpj0BA",
    3: "price_1U46QoHw2ZCjSnG4LbXG0l6r",
    4: "price_1U475eHw2ZCjSnG4iYd7hbSG",
    5: "price_1U479gHw2ZCjSnG4SO9fcR2T",
    6: "price_1U47HDHw2ZCjSnG4SV0YeJoB",
    7: "price_1U47OCHw2ZCjSnG47Vjr2Nls",
    8: "price_1U47Y7Hw2ZCjSnG4yfsQ29Cz"
  },
  annual: {
    1: "price_1U4807Hw2ZCjSnG4Up02k2Yk",
    2: "price_1U46MTHw2ZCjSnG4L50UoDfq",
    3: "price_1U46SNHw2ZCjSnG4iiFeF2DD",
    4: "price_1U477PHw2ZCjSnG45dOI5Mnt",
    5: "price_1U47DhHw2ZCjSnG4zFlnHZSm",
    6: "price_1U47JnHw2ZCjSnG48NWpH5vb",
    7: "price_1U47UjHw2ZCjSnG4Q6nEj6YA",
    8: "price_1U47cVHw2ZCjSnG4Y7zyaerS"
  }
};

router.post("/create-checkout", async (req, res) => {
  try {
    const { parkCount, billingCycle, selectedParks, email } = req.body;

    const priceId = PRICE_TABLE[billingCycle][parkCount];

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          price: priceId,
          quantity: 1
        }
      ],
      customer_email: email,
      metadata: {
        parks_selected: selectedParks.join(", "),
        park_count: parkCount,
        billing_cycle: billingCycle
      },
      success_url: process.env.SUCCESS_URL,
      cancel_url: process.env.CANCEL_URL
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to create checkout session" });
  }
});

export default router;
