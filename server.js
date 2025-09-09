const express = require('express');
const app = express();
const stripe = require('stripe')('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'); // Replace with your actual Stripe secret key
app.use(express.json());

const priceMap = {
  // Single
  cherokee_single_monthly: 'price_1S5FgaHw2ZCjSnG42ICAxf7i',
  cherokee_single_annual: 'price_1S5FsxHw2ZCjSnG43MHiN6hj',
  meltonhill_single_monthly: 'price_1S5FkjHw2ZCjSnG4rXhBv5Zk',
  meltonhill_single_annual: 'price_1S5FrfHw2ZCjSnG41ipCFeY5',
  yarberry_single_monthly: 'price_1S5FmFHw2ZCjSnG4VaUbYu1a',
  yarberry_single_annual: 'price_1S5FpUHw2ZCjSnG4tqc0qHKl',
  greenlee_maysprings_single_monthly: 'price_1S5FdFHw2ZCjSnG4wh4S9R72',
  greenlee_maysprings_single_annual: 'price_1S5FugHw2ZCjSnG47pEr2XyA',
  greenlee_original_single_monthly: 'price_1S5FcNHw2ZCjSnG4Nc5Fn6va',
  greenlee_original_single_annual: 'price_1S5FvnHw2ZCjSnG4qJEDpbi9',
  // Monthly
  cherokee_multi_monthly: 'price_1S5F1aHw2ZCjSnG4MSfCkIh1',
  meltonhill_multi_monthly: 'price_1S5F3DHw2ZCjSnG4VVlvmFo5',
  yarberry_multi_monthly: 'price_1S5F4SHw2ZCjSnG4LNXwCf0L',
  greenlee_maysprings_multi_monthly: 'price_1S5EyMHw2ZCjSnG4xE7YmDkQ',
  greenlee_original_multi_monthly: 'price_1S5EwwHw2ZCjSnG4OLIgEwk0',
  // Annual
  cherokee_multi_annual: 'price_1S5EgRHw2ZCjSnG4pU8Ooac2',
  meltonhill_multi_annual: 'price_1S5EiHHw2ZCjSnG4dzd4hNOQ',
  yarberry_multi_annual: 'price_1S5EjGHw2ZCjSnG4MtRNHluA',
  greenlee_maysprings_multi_annual: 'price_1S5EdHHw2ZCjSnG4zCtJX6U1',
  greenlee_original_multi_annual: 'price_1S5EbCHw2ZCjSnG4HaYqjRLl'
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
      success_url: 'https://campgroundguides.com/success',
      cancel_url: 'https://campgroundguides.com/cancel'
    });

    res.json({ checkoutUrl: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

app.listen(3000, () => console.log('Server running on port 3000'));
