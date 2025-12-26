import React, { useEffect, useState } from 'react';
import { Api } from '../services/api';
import { Photographer } from '../types';
import { useNavigate } from 'react-router-dom';

const SuperAdmin = () => {
  const navigate = useNavigate();
  const [photographers, setPhotographers] = useState<Photographer[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState("");

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
    if (!confirm("Delete this user?")) return;
    try {
      await Api.adminDeletePhotographer(id);
      loadPhotographers();
    } catch (e) {
      alert("Delete failed");
    }
  };

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8 border-b border-gray-800 pb-4">
          <h1 className="text-3xl font-bold text-brand">Super Admin</h1>
          <button onClick={() => { localStorage.clear(); navigate('/login'); }} className="text-red-500">Logout</button>
        </div>

        <div className="bg-dark-card border border-dark-border p-6 rounded-xl mb-8">
          <h2 className="text-xl font-bold mb-4">Create Photographer</h2>
          <div className="flex gap-4">
            <input 
              className="bg-black border border-gray-700 p-2 rounded text-white flex-1" 
              placeholder="Email address" 
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
            />
            <button onClick={handleCreate} className="bg-brand text-black font-bold px-6 rounded hover:bg-green-400">Create</button>
          </div>
        </div>

        <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-gray-900 text-gray-400 uppercase text-xs">
              <tr>
                <th className="p-4">Username</th>
                <th className="p-4">Email</th>
                <th className="p-4">Status</th>
                <th className="p-4">Usage</th>
                <th className="p-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {photographers.map(p => (
                <tr key={p.user_id} className="hover:bg-gray-900/50">
                  <td className="p-4">{p.username}</td>
                  <td className="p-4">{p.email}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded text-xs ${p.account_status === 'active' ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
                      {p.account_status}
                    </span>
                  </td>
                  <td className="p-4 text-xs">
                    {(p.total_storage_used_bytes / 1024 / 1024).toFixed(2)} MB / {(p.storage_limit_bytes / 1024 / 1024 / 1024).toFixed(2)} GB
                  </td>
                  <td className="p-4">
                    <button onClick={() => handleDelete(p.user_id)} className="text-red-500 hover:underline">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading && <p className="p-4 text-center text-gray-500">Loading...</p>}
        </div>
      </div>
    </div>
  );
};

export default SuperAdmin;