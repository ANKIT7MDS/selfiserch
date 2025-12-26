import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Api } from '../services/api';
import { Photo } from '../types';

const ClientSelection = () => {
  const location = useLocation();
  const linkId = new URLSearchParams(location.search).get('linkId');

  const [step, setStep] = useState<'login' | 'gallery'>('login');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const handleLogin = async () => {
    if (!linkId || !pin) return alert("Please enter PIN");
    setLoading(true);
    try {
      // NOTE: Using getClientGallery which calls 'search' endpoint with mode='client_selection'
      // Your backend 'search' lambda should see this mode and return ALL photos for the linkId if PIN matches
      const res = await Api.getClientGallery(linkId, pin);
      
      // Fallback: If backend returns 'matches', 'photos', or 'items'
      const items = res.matches || res.photos || res.items || [];
      if (items.length > 0) {
        setPhotos(items);
        setStep('gallery');
      } else {
        alert("No photos found or Invalid PIN");
      }
    } catch (e) {
      console.error(e);
      alert("Access Denied. Check PIN or Link.");
    } finally {
      setLoading(false);
    }
  };

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const saveSelection = async () => {
    if (!linkId) return;
    if (selectedIds.size === 0) return alert("No photos selected");
    
    if(!confirm(`Send ${selectedIds.size} selected photos to photographer?`)) return;

    setSaving(true);
    try {
      await Api.saveClientSelection(linkId, Array.from(selectedIds));
      alert("Selection Saved Successfully! The photographer has been notified.");
    } catch (e) {
      alert("Failed to save selection.");
    } finally {
      setSaving(false);
    }
  };

  if (!linkId) return <div className="h-screen bg-black text-white flex items-center justify-center">Invalid Link</div>;

  // LOGIN VIEW
  if (step === 'login') {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
        <div className="bg-[#111] border border-white/10 p-8 rounded-2xl max-w-sm w-full text-center shadow-2xl">
          <h1 className="text-2xl font-bold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-brand to-emerald-400">Client Access</h1>
          <p className="text-gray-400 text-sm mb-6">Enter PIN to select photos for your album</p>
          
          <input 
            type="password" 
            placeholder="Enter Event PIN" 
            value={pin}
            onChange={e => setPin(e.target.value)}
            className="w-full bg-black border border-white/20 p-4 rounded-xl text-center text-xl tracking-widest mb-6 focus:border-brand outline-none"
          />
          
          <button 
            onClick={handleLogin} 
            disabled={loading}
            className="w-full bg-brand text-black font-bold py-4 rounded-xl hover:brightness-110 transition"
          >
            {loading ? 'Verifying...' : 'View Gallery'}
          </button>
        </div>
      </div>
    );
  }

  // GALLERY VIEW
  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-black/90 backdrop-blur border-b border-white/10 px-4 py-3 flex justify-between items-center">
        <div>
           <h1 className="font-bold text-lg">Photo Selection</h1>
           <p className="text-xs text-gray-400">{selectedIds.size} Selected</p>
        </div>
        <button 
          onClick={saveSelection}
          disabled={saving || selectedIds.size === 0}
          className={`px-6 py-2 rounded-full font-bold text-sm transition ${selectedIds.size > 0 ? 'bg-brand text-black hover:scale-105' : 'bg-white/10 text-gray-500'}`}
        >
          {saving ? 'Saving...' : 'Save Selection'}
        </button>
      </div>

      {/* Grid */}
      <div className="p-2 grid grid-cols-3 md:grid-cols-5 lg:grid-cols-8 gap-1">
        {photos.map(photo => {
          const isSelected = selectedIds.has(photo.photo_id);
          return (
            <div 
              key={photo.photo_id} 
              onClick={() => toggleSelection(photo.photo_id)}
              className={`relative aspect-square cursor-pointer transition ${isSelected ? 'opacity-100 scale-95 z-10' : 'opacity-100'}`}
            >
              <img 
                src={photo.thumbnail_url || photo.url} 
                loading="lazy" 
                className={`w-full h-full object-cover rounded-md ${isSelected ? 'ring-4 ring-brand' : ''}`} 
              />
              
              <div className={`absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center border transition ${isSelected ? 'bg-brand border-brand' : 'bg-black/30 border-white/50'}`}>
                {isSelected && <span className="text-black text-xs font-bold">✓</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ClientSelection;