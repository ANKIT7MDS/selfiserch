import React, { useEffect, useState } from 'react';
import { Api } from '../services/api';
import { Photographer } from '../types';
import { useNavigate } from 'react-router-dom';

const SuperAdmin = () => {
  const navigate = useNavigate();
  const [photographers, setPhotographers] = useState<Photographer[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState("");
  
  // Edit State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    storage_limit_gb: number;
    expiry_date: string;
    account_status: string;
  }>({ storage_limit_gb: 5, expiry_date: '', account_status: 'active' });

  useEffect(() => {
    loadPhotographers();
  }, []);

  const loadPhotographers = async () => {
    setLoading(true);
    try {
      const list = await Api.adminListPhotographers();
      setPhotographers(list || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newEmail) return;
    try {
      await Api.adminCreatePhotographer(newEmail);
      setNewEmail("");
      loadPhotographers();
      alert("Photographer created. Check email for temporary password.");
    } catch (e) {
      alert("Create failed");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this user? This action is irreversible.")) return;
    try {
      await Api.adminDeletePhotographer(id);
      loadPhotographers();
    } catch (e) {
      alert("Delete failed");
    }
  };

  const openEditModal = (p: Photographer) => {
      setEditingId(p.user_id);
      setEditForm({
          storage_limit_gb: Math.round(p.storage_limit_bytes / 1024 / 1024 / 1024),
          expiry_date: p.expiry_date ? p.expiry_date.split('T')[0] : '',
          account_status: p.account_status || 'active'
      });
  };

  const handleUpdate = async () => {
      if(!editingId) return;
      try {
          await Api.adminUpdatePhotographer(editingId, {
              storage_limit_bytes: editForm.storage_limit_gb * 1024 * 1024 * 1024,
              expiry_date: editForm.expiry_date,
              account_status: editForm.account_status
          });
          setEditingId(null);
          loadPhotographers();
      } catch (e) {
          alert("Update failed");
      }
  };

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8 border-b border-gray-800 pb-4">
          <h1 className="text-3xl font-bold text-brand">Super Admin Panel</h1>
          <button onClick={() => { localStorage.clear(); navigate('/login'); }} className="text-red-500 hover:text-red-400">Logout</button>
        </div>

        {/* Create Section */}
        <div className="bg-dark-card border border-dark-border p-6 rounded-xl mb-8">
          <h2 className="text-xl font-bold mb-4">Create New Photographer</h2>
          <div className="flex gap-4 max-w-lg">
            <input 
              className="bg-black border border-gray-700 p-3 rounded-lg text-white flex-1 focus:border-brand outline-none" 
              placeholder="Email address" 
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
            />
            <button onClick={handleCreate} className="bg-brand text-black font-bold px-6 rounded-lg hover:brightness-110 transition">Create</button>
          </div>
        </div>

        {/* List Section */}
        <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-900 text-gray-400 uppercase text-xs">
                <tr>
                  <th className="p-4">Email / Username</th>
                  <th className="p-4">Plan / Usage</th>
                  <th className="p-4">Expiry</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {photographers.map(p => (
                  <tr key={p.user_id} className="hover:bg-gray-900/50 transition">
                    <td className="p-4">
                        <div className="font-bold">{p.username}</div>
                        <div className="text-sm text-gray-500">{p.email}</div>
                    </td>
                    <td className="p-4">
                      <div className="w-full bg-gray-800 h-2 rounded-full mt-1 mb-1 max-w-[150px]">
                          <div className="bg-brand h-full rounded-full" style={{ width: `${Math.min((p.total_storage_used_bytes / p.storage_limit_bytes) * 100, 100)}%` }}></div>
                      </div>
                      <span className="text-xs text-gray-400">
                        {(p.total_storage_used_bytes / 1024 / 1024).toFixed(2)} MB / {(p.storage_limit_bytes / 1024 / 1024 / 1024).toFixed(2)} GB
                      </span>
                    </td>
                    <td className="p-4 text-sm text-gray-300">
                        {p.expiry_date ? new Date(p.expiry_date).toLocaleDateString() : 'Lifetime'}
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded text-xs uppercase font-bold ${p.account_status === 'active' ? 'bg-green-900 text-green-400' : 'bg-red-900 text-red-400'}`}>
                        {p.account_status || 'Active'}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <button onClick={() => openEditModal(p)} className="text-blue-400 hover:text-blue-300 mr-4 font-medium">Edit</button>
                      <button onClick={() => handleDelete(p.user_id)} className="text-red-500 hover:text-red-400 font-medium">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {loading && <p className="p-8 text-center text-gray-500">Loading photographers...</p>}
        </div>

        {/* Edit Modal */}
        {editingId && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
                <div className="bg-dark-card border border-dark-border p-8 rounded-2xl w-full max-w-md shadow-2xl">
                    <h3 className="text-xl font-bold mb-6">Edit Photographer</h3>
                    
                    <div className="space-y-4">
                        <div>
                            <label className="block text-gray-400 text-xs mb-1">Storage Limit (GB)</label>
                            <input 
                                type="number" 
                                className="w-full bg-black border border-gray-700 p-3 rounded-lg text-white outline-none focus:border-brand"
                                value={editForm.storage_limit_gb}
                                onChange={e => setEditForm({...editForm, storage_limit_gb: Number(e.target.value)})}
                            />
                        </div>

                        <div>
                            <label className="block text-gray-400 text-xs mb-1">Expiry Date</label>
                            <input 
                                type="date" 
                                className="w-full bg-black border border-gray-700 p-3 rounded-lg text-white outline-none focus:border-brand"
                                value={editForm.expiry_date}
                                onChange={e => setEditForm({...editForm, expiry_date: e.target.value})}
                            />
                        </div>

                        <div>
                            <label className="block text-gray-400 text-xs mb-1">Account Status</label>
                            <select 
                                className="w-full bg-black border border-gray-700 p-3 rounded-lg text-white outline-none focus:border-brand"
                                value={editForm.account_status}
                                onChange={e => setEditForm({...editForm, account_status: e.target.value})}
                            >
                                <option value="active">Active</option>
                                <option value="disabled">Disabled</option>
                                <option value="expired">Expired</option>
                            </select>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 mt-8">
                        <button onClick={() => setEditingId(null)} className="px-4 py-2 text-gray-400 hover:text-white">Cancel</button>
                        <button onClick={handleUpdate} className="bg-brand text-black font-bold px-6 py-2 rounded-lg hover:brightness-110">Save Changes</button>
                    </div>
                </div>
            </div>
        )}

      </div>
    </div>
  );
};

export default SuperAdmin;