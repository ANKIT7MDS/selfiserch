import React, { useEffect, useState } from 'react';
import { Api } from '../services/api';
import { Collection, AccountStatus } from '../types';
import { useNavigate } from 'react-router-dom';

const Dashboard = () => {
  const navigate = useNavigate();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [account, setAccount] = useState<AccountStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");

  const user = JSON.parse(localStorage.getItem('user') || '{}');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [colData, accData] = await Promise.all([
        Api.getCollections(),
        Api.getAccountStatus()
      ]);
      setCollections(colData.Items || []);
      setAccount(accData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newCollectionName) return;
    try {
      await Api.upsertCollection(newCollectionName);
      setNewCollectionName("");
      setIsModalOpen(false);
      fetchData();
    } catch (e) {
      alert("Failed to create");
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("Are you sure? This deletes ALL photos and events within.")) return;
    try {
      await Api.deleteCollection(id);
      setCollections(prev => prev.filter(c => c.collection_id !== id));
    } catch (e) {
      alert("Delete failed");
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (loading) return <div className="flex h-screen items-center justify-center text-brand">Loading...</div>;

  return (
    <div className="min-h-screen bg-dark-bg text-white p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-center mb-8 border-b border-dark-border pb-6">
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
            Photographer Dashboard
          </h1>
          <div className="flex items-center gap-4 mt-4 md:mt-0">
            <span className="text-sm text-gray-400">Hi, {user.email}</span>
            <button onClick={() => { localStorage.clear(); navigate('/login'); }} className="text-red-500 border border-red-500/30 px-4 py-1 rounded-full hover:bg-red-500/10 transition">
              Logout
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-dark-card border border-dark-border p-6 rounded-2xl flex items-center justify-between">
            <div>
              <span className="text-gray-400 text-sm block">Storage Used</span>
              <span className="text-2xl font-bold text-brand">{formatBytes(account?.total_storage_used_bytes || 0)}</span>
              <span className="text-gray-500 text-xs ml-2">/ {formatBytes(account?.storage_limit_bytes || 0)}</span>
            </div>
            <div className="text-4xl">📊</div>
          </div>
          <div className="bg-dark-card border border-dark-border p-6 rounded-2xl flex items-center justify-between">
            <div>
              <span className="text-gray-400 text-sm block">Plan Expiry</span>
              <span className="text-2xl font-bold text-white">{account?.expiry_date ? new Date(account.expiry_date).toLocaleDateString() : 'Lifetime'}</span>
            </div>
            <div className="text-4xl">📅</div>
          </div>
        </div>

        {/* Collections */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold">Your Collections</h2>
          <button onClick={() => setIsModalOpen(true)} className="bg-brand text-black font-bold px-6 py-2 rounded-full hover:bg-brand-hover shadow-lg shadow-brand/20 transition">
            + New Collection
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {collections.map(col => (
            <div 
              key={col.collection_id} 
              onClick={() => navigate(`/collection/${col.collection_id}`)}
              className="bg-dark-card border border-dark-border p-6 rounded-2xl cursor-pointer hover:border-brand/50 hover:-translate-y-1 transition group relative"
            >
              <h3 className="text-xl font-bold mb-2 group-hover:text-brand transition">{col.name}</h3>
              <div className="flex justify-between text-sm text-gray-400 mt-4">
                <span>Events: {col.event_count || 0}</span>
                <span>Photos: {col.total_photo_count || 0}</span>
              </div>
              <div className="mt-4 pt-4 border-t border-dark-border flex justify-between items-center">
                <span className="text-xs text-gray-500">{new Date(col.created_at).toLocaleDateString()}</span>
                <button 
                  onClick={(e) => handleDelete(e, col.collection_id)}
                  className="text-red-500 hover:bg-red-500/10 p-2 rounded-full transition"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Create Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-dark-card border border-dark-border p-8 rounded-2xl w-full max-w-md">
              <h3 className="text-xl font-bold mb-4">Create Collection</h3>
              <input 
                type="text" 
                placeholder="Collection Name (e.g. Wedding 2025)" 
                className="w-full bg-black border border-dark-border p-3 rounded-lg text-white mb-6 focus:border-brand outline-none"
                value={newCollectionName}
                onChange={e => setNewCollectionName(e.target.value)}
              />
              <div className="flex justify-end gap-3">
                <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-gray-400 hover:text-white">Cancel</button>
                <button onClick={handleCreate} className="bg-brand text-black font-bold px-6 py-2 rounded-lg">Create</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;