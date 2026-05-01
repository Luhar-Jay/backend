import mongoose from 'mongoose';

const clientSchema = new mongoose.Schema({
  orgAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  name: { type: String, required: true, trim: true },
  company: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  phone: { type: String, trim: true },
  website: { type: String, trim: true },
  industry: { type: String, trim: true },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  notes: { type: String },
}, { timestamps: true });

clientSchema.index({ orgAdmin: 1, createdAt: -1 });

export default mongoose.model('Client', clientSchema);
