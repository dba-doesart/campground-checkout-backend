const express = require('express');
const app = express();
const stripe = require('stripe')('sk_test_YOUR_SECRET_KEY'); // Replace with your actual Stripe secret key
app.use(express.json());

const priceMap = {
  // Monthly
  cherokee_multi_monthly: 'price_abc123',
  meltonhill_multi_monthly: 'price_def456',
  yarberry_multi_monthly: 'price_ghi789',
  greenlee_maysprings_multi_monthly: 'price_jkl012',
  greenlee_original_multi_monthly: 'price_mno345',
  // Annual
  cherokee_multi_annual: 'price_xyz123',
  meltonhill_multi_annual: 'price_xyz456',
  yarberry_multi_annual: 'price_xyz789',
  greenlee_maysprings_multi_annual: 'price_xyz012',
  greenlee_original_multi_annual: 'price_xyz345'
};

app.post('/create-checkout-session', async (req, res) => {
  const { parks, billing } = req.body;

  const lineItems = parks.map(parkKey => {
    const priceId = priceMap[`${parkKey}_${billing}`];
    return {
      price: priceId,
      quantity: 1
    };
  });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: lineItems,
      success_url: 'https://yourdomain.com/success',
      cancel_url: 'https://yourdomain.com/cancel'
    });

    res.json({ checkoutUrl: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

app.listen(3000, () => console.log('Server running on port 3000'));
