import mongoose from 'mongoose';

const contactLogSchema = new mongoose.Schema({
  orgAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null },
  type: { type: String, enum: ['call', 'email', 'meeting', 'note'], required: true },
  summary: { type: String, required: true, trim: true },
  loggedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  loggedAt: { type: Date, default: Date.now },
}, { timestamps: true });

contactLogSchema.index({ client: 1, loggedAt: -1 });
contactLogSchema.index({ lead: 1, loggedAt: -1 });

export default mongoose.model('ContactLog', contactLogSchema);
