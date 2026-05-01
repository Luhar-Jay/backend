import ContactLog from '../model/contactLog.model.js';
import { resolveOrgAdminId } from '../utils/teamScope.js';

export const createContactLog = async (req, res) => {
  try {
    const orgContext = req.query.orgContext ?? null;
    const orgAdmin = resolveOrgAdminId(req.user, orgContext);
    const log = await ContactLog.create({
      ...req.body,
      orgAdmin,
      loggedBy: req.user._id,
      loggedAt: req.body.loggedAt || new Date(),
    });
    const populated = await ContactLog.findById(log._id).populate('loggedBy', 'name');
    res.status(201).json({ success: true, message: 'Log added', data: populated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getContactLogs = async (req, res) => {
  try {
    const orgContext = req.query.orgContext ?? null;
    const orgAdmin = resolveOrgAdminId(req.user, orgContext);
    const { clientId, leadId } = req.query;
    const filter = orgAdmin ? { orgAdmin } : {};
    if (clientId) filter.client = clientId;
    if (leadId) filter.lead = leadId;
    const logs = await ContactLog.find(filter)
      .populate('loggedBy', 'name')
      .sort({ loggedAt: -1 });
    res.json({ success: true, data: logs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteContactLog = async (req, res) => {
  try {
    const orgContext = req.query.orgContext ?? null;
    const orgAdmin = resolveOrgAdminId(req.user, orgContext);
    const existing = await ContactLog.findById(req.params.id).select('orgAdmin');
    if (!existing) return res.status(404).json({ success: false, message: 'Log not found' });
    if (orgAdmin && existing.orgAdmin?.toString() !== orgAdmin.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    await ContactLog.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Log deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
