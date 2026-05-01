import Lead from '../model/lead.model.js';
import { resolveOrgAdminId } from '../utils/teamScope.js';

const populateLead = (q) =>
  q
    .populate('client', 'name company email phone')
    .populate('assignedTo', 'name email');

export const createLead = async (req, res) => {
  try {
    const orgContext = req.query.orgContext ?? null;
    const orgAdmin = resolveOrgAdminId(req.user, orgContext);
    const lead = await Lead.create({ ...req.body, orgAdmin });
    const populated = await populateLead(Lead.findById(lead._id));
    res.status(201).json({ success: true, message: 'Lead created', data: populated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getLeads = async (req, res) => {
  try {
    const orgContext = req.query.orgContext ?? null;
    const orgAdmin = resolveOrgAdminId(req.user, orgContext);
    const { page = 1, limit = 200, stage, search } = req.query;
    const filter = orgAdmin ? { orgAdmin } : {};
    if (stage) filter.stage = stage;
    if (search) filter.$or = [{ title: new RegExp(search, 'i') }];
    const [leads, total] = await Promise.all([
      populateLead(
        Lead.find(filter)
          .sort({ createdAt: -1 })
          .skip((Number(page) - 1) * Number(limit))
          .limit(Number(limit))
      ),
      Lead.countDocuments(filter),
    ]);
    res.json({ success: true, data: leads, total, page: Number(page) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getLeadById = async (req, res) => {
  try {
    const orgContext = req.query.orgContext ?? null;
    const orgAdmin = resolveOrgAdminId(req.user, orgContext);
    const lead = await populateLead(Lead.findById(req.params.id));
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });
    if (orgAdmin && lead.orgAdmin?.toString() !== orgAdmin.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    res.json({ success: true, data: lead });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const updateLead = async (req, res) => {
  try {
    const orgContext = req.query.orgContext ?? null;
    const orgAdmin = resolveOrgAdminId(req.user, orgContext);
    const existing = await Lead.findById(req.params.id).select('orgAdmin');
    if (!existing) return res.status(404).json({ success: false, message: 'Lead not found' });
    if (orgAdmin && existing.orgAdmin?.toString() !== orgAdmin.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    const lead = await populateLead(
      Lead.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
    );
    res.json({ success: true, message: 'Lead updated', data: lead });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const updateLeadStage = async (req, res) => {
  try {
    const orgContext = req.query.orgContext ?? null;
    const orgAdmin = resolveOrgAdminId(req.user, orgContext);
    const existing = await Lead.findById(req.params.id).select('orgAdmin');
    if (!existing) return res.status(404).json({ success: false, message: 'Lead not found' });
    if (orgAdmin && existing.orgAdmin?.toString() !== orgAdmin.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    const { stage } = req.body;
    const lead = await populateLead(
      Lead.findByIdAndUpdate(req.params.id, { stage }, { new: true })
    );
    res.json({ success: true, message: 'Stage updated', data: lead });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteLead = async (req, res) => {
  try {
    const orgContext = req.query.orgContext ?? null;
    const orgAdmin = resolveOrgAdminId(req.user, orgContext);
    const existing = await Lead.findById(req.params.id).select('orgAdmin');
    if (!existing) return res.status(404).json({ success: false, message: 'Lead not found' });
    if (orgAdmin && existing.orgAdmin?.toString() !== orgAdmin.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    await Lead.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Lead deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const revenueForecast = async (req, res) => {
  try {
    const orgContext = req.query.orgContext ?? null;
    const orgAdmin = resolveOrgAdminId(req.user, orgContext);
    const filter = orgAdmin ? { orgAdmin, stage: { $nin: ['lost'] } } : { stage: { $nin: ['lost'] } };
    const leads = await Lead.find(filter)
      .populate('client', 'name company')
      .select('title value probability stage expectedCloseDate client currency');

    const forecast = leads.map((l) => ({
      _id: l._id,
      title: l.title,
      client: l.client,
      stage: l.stage,
      value: l.value,
      probability: l.probability,
      weightedValue: Math.round(l.value * (l.probability / 100)),
      currency: l.currency,
      expectedCloseDate: l.expectedCloseDate,
    }));

    const totalWeighted = forecast.reduce((s, f) => s + f.weightedValue, 0);
    const totalValue = forecast.reduce((s, f) => s + f.value, 0);

    res.json({ success: true, data: forecast, totalWeighted, totalValue });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
