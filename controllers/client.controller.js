import Client from '../model/client.model.js';
import { resolveOrgAdminId } from '../utils/teamScope.js';

export const createClient = async (req, res) => {
  try {
    const orgContext = req.query.orgContext ?? null;
    const orgAdmin = resolveOrgAdminId(req.user, orgContext);
    const client = await Client.create({ ...req.body, orgAdmin });
    res.status(201).json({ success: true, message: 'Client created', data: client });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getClients = async (req, res) => {
  try {
    const orgContext = req.query.orgContext ?? null;
    const orgAdmin = resolveOrgAdminId(req.user, orgContext);
    const { page = 1, limit = 200, search, status } = req.query;
    const filter = orgAdmin ? { orgAdmin } : {};
    if (status) filter.status = status;
    if (search) {
      const re = new RegExp(search, 'i');
      filter.$or = [{ name: re }, { company: re }, { email: re }];
    }
    const [clients, total] = await Promise.all([
      Client.find(filter)
        .sort({ createdAt: -1 })
        .skip((Number(page) - 1) * Number(limit))
        .limit(Number(limit)),
      Client.countDocuments(filter),
    ]);
    res.json({ success: true, data: clients, total, page: Number(page) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getClientById = async (req, res) => {
  try {
    const orgContext = req.query.orgContext ?? null;
    const orgAdmin = resolveOrgAdminId(req.user, orgContext);
    const client = await Client.findById(req.params.id);
    if (!client) return res.status(404).json({ success: false, message: 'Client not found' });
    if (orgAdmin && client.orgAdmin?.toString() !== orgAdmin.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    res.json({ success: true, data: client });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const updateClient = async (req, res) => {
  try {
    const orgContext = req.query.orgContext ?? null;
    const orgAdmin = resolveOrgAdminId(req.user, orgContext);
    const existing = await Client.findById(req.params.id).select('orgAdmin');
    if (!existing) return res.status(404).json({ success: false, message: 'Client not found' });
    if (orgAdmin && existing.orgAdmin?.toString() !== orgAdmin.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    const client = await Client.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    res.json({ success: true, message: 'Client updated', data: client });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteClient = async (req, res) => {
  try {
    const orgContext = req.query.orgContext ?? null;
    const orgAdmin = resolveOrgAdminId(req.user, orgContext);
    const existing = await Client.findById(req.params.id).select('orgAdmin');
    if (!existing) return res.status(404).json({ success: false, message: 'Client not found' });
    if (orgAdmin && existing.orgAdmin?.toString() !== orgAdmin.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    await Client.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Client deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
