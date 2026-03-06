const mongoose = require('mongoose');

const SubscriptionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  plan: { type: String, enum: ['trial', 'monthly', 'yearly'], default: 'trial' },
  status: { type: String, enum: ['active', 'pending', 'expired'], default: 'trial' },
  expiry: { type: Date },
  payment: {
    utr: String,
    qrUrl: String,
    approved: { type: Boolean, default: false },
  },
});

module.exports = mongoose.model('Subscription', SubscriptionSchema); 