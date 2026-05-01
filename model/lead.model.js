import mongoose from 'mongoose';

const LEAD_STAGES = ['lead', 'prospect', 'proposal', 'won', 'lost'];

const leadSchema = new mongoose.Schema({
  orgAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  title: { type: String, required: true, trim: true },
  client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  stage: { type: String, enum: LEAD_STAGES, default: 'lead' },
  value: { type: Number, default: 0 },
  currency: { type: String, default: 'INR' },
  probability: { type: Number, min: 0, max: 100, default: 20 },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  expectedCloseDate: { type: Date, default: null },
  notes: { type: String },
}, { timestamps: true });

leadSchema.index({ orgAdmin: 1, stage: 1 });

export default mongoose.model('Lead', leadSchema);
