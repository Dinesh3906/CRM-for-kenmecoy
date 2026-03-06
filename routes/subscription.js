const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const QRCode = require('qrcode');

// All routes require authentication unless admin
router.use(auth);

// Get available plans
router.get('/plans', (req, res) => {
  res.json([
    { plan: 'monthly', price: 799, duration: 30, label: 'Monthly' },
    { plan: 'yearly', price: 8629, duration: 365, label: 'Yearly' },
  ]);
});

// Create subscription and use static QR code
router.post('/create', async (req, res) => {
  try {
    const { plan } = req.body;
    const user = req.user;
    console.log('Attempting to create subscription for user:', user._id, 'plan:', plan);
    // Prevent multiple pending subscriptions
    const existingPending = await Subscription.findOne({ user: user._id, status: 'pending' });
    if (existingPending) {
      console.log('Existing pending subscription found:', existingPending);
      return res.json({ qrUrl: existingPending.payment.qrUrl, subscriptionId: existingPending._id });
    }
    // Use static payment QR
    const qrUrl = '/payment-qr.png';
    // Create subscription record
    const sub = new Subscription({
      user: user._id,
      plan,
      status: 'pending',
      payment: { qrUrl },
    });
    await sub.save();
    console.log('New subscription created:', sub);
    res.json({ qrUrl, subscriptionId: sub._id });
  } catch (err) {
    console.error('Error creating subscription:', err);
    res.status(500).json({ message: 'Error creating subscription' });
  }
});

// Submit UTR after payment
router.post('/utr', async (req, res) => {
  try {
    const { subscriptionId, utr } = req.body;
    const sub = await Subscription.findById(subscriptionId);
    if (!sub) return res.status(404).json({ message: 'Subscription not found' });
    sub.payment.utr = utr;
    sub.status = 'pending';
    await sub.save();
    // Update user
    const user = await User.findById(sub.user);
    user.subscription.payment.utr = utr;
    user.subscription.status = 'pending';
    await user.save();
    res.json({ message: 'UTR submitted, pending admin approval.' });
  } catch (err) {
    res.status(500).json({ message: 'Error submitting UTR' });
  }
});

// Check subscription status
router.get('/status', async (req, res) => {
  try {
    const user = req.user;
    res.json({ subscription: user.subscription, _id: user._id, email: user.email });
  } catch (err) {
    res.status(500).json({ message: 'Error checking status' });
  }
});

// Admin: list pending subscriptions
router.get('/admin/pending', async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ message: 'Forbidden' });
  const pending = await Subscription.find({ status: 'pending' }).populate('user', 'email');
  res.json(pending);
});

// Admin: approve subscription
router.post('/admin/approve', async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ message: 'Forbidden' });
  const { subscriptionId } = req.body;
  const sub = await Subscription.findById(subscriptionId);
  if (!sub) return res.status(404).json({ message: 'Subscription not found' });
  sub.status = 'active';
  sub.payment.approved = true;
  // Set expiry
  const now = new Date();
  sub.expiry = new Date(now.getTime() + (sub.plan === 'yearly' ? 365 : 30) * 24 * 60 * 60 * 1000);
  await sub.save();
  // Update user
  const user = await User.findById(sub.user);
  user.subscription = {
    plan: sub.plan,
    status: 'active',
    expiry: sub.expiry,
    payment: sub.payment,
  };
  // Reset API request count for paid plans
  if (sub.plan === 'monthly' || sub.plan === 'yearly') {
    user.apiRequestCount = 0;
  }
  await user.save();
  res.json({ message: 'Subscription approved.' });
});

module.exports = router; 