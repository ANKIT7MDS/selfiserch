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
  
  // Lightbox
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const handleLogin = async () => {
    if (!linkId || !pin) return alert("Please enter PIN");
    setLoading(true);
    try {
      // NOTE: Using getClientGallery which calls 'search' endpoint with mode='client_selection'
      const res = await Api.getClientGallery(linkId, pin);
      
      // IMPROVED: Robust checking for data in response
      let items: Photo[] = [];
      if (Array.isArray(res)) items = res;
      else if (res.matches && Array.isArray(res.matches)) items = res.matches;
      else if (res.photos && Array.isArray(res.photos)) items = res.photos;
      else if (res.items && Array.isArray(res.items)) items = res.items;
      
      if (items.length > 0) {
        setPhotos(items);
        setStep('gallery');
      } else {
        alert("No photos found in this collection or Invalid PIN");
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
        {photos.map((photo, i) => {
          const isSelected = selectedIds.has(photo.photo_id);
          return (
            <div 
              key={photo.photo_id} 
              className={`relative aspect-square cursor-pointer transition ${isSelected ? 'opacity-100 scale-95 z-10' : 'opacity-100'}`}
            >
              <img 
                src={photo.thumbnail_url || photo.url} 
                loading="lazy" 
                onClick={() => setLightboxIndex(i)} // Open Lightbox
                className={`w-full h-full object-cover rounded-md ${isSelected ? 'ring-4 ring-brand' : ''}`} 
              />
              
              {/* Select Button Overlay */}
              <div 
                  onClick={(e) => { e.stopPropagation(); toggleSelection(photo.photo_id); }}
                  className={`absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center border shadow-lg cursor-pointer transition active:scale-90 ${isSelected ? 'bg-brand border-brand' : 'bg-black/50 border-white/50 hover:bg-black/80'}`}
              >
                <span className={`text-sm font-bold ${isSelected ? 'text-black' : 'text-white'}`}>{isSelected ? '✓' : '+'}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Lightbox Modal */}
      {lightboxIndex !== null && (
          <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center backdrop-blur-xl animate-fade-in">
              <button onClick={() => setLightboxIndex(null)} className="absolute top-6 right-6 w-12 h-12 flex items-center justify-center bg-white/10 rounded-full text-white hover:bg-white/20 transition z-50">&times;</button>
              
              <button onClick={() => setLightboxIndex(p => p! > 0 ? p! - 1 : photos.length - 1)} className="absolute left-4 text-white text-4xl p-4 z-50">&#8249;</button>

              <div className="relative max-w-full max-h-full p-4 flex flex-col items-center">
                  <img src={photos[lightboxIndex].url} className="max-h-[80vh] max-w-full object-contain rounded-lg shadow-2xl" alt="Preview" />
                  
                  {/* FRONTEND WATERMARK */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-10">
                       <div className="text-white text-6xl font-black rotate-[-30deg] select-none">EVENTLENS</div>
                  </div>

                  {/* Action Bar */}
                  <div className="mt-6 flex gap-4">
                      <button 
                          onClick={() => toggleSelection(photos[lightboxIndex!].photo_id)}
                          className={`px-8 py-3 rounded-full font-bold transition shadow-lg ${selectedIds.has(photos[lightboxIndex!].photo_id) ? 'bg-brand text-black' : 'bg-white text-black hover:bg-gray-200'}`}
                      >
                          {selectedIds.has(photos[lightboxIndex!].photo_id) ? '✓ Selected' : 'Select Photo'}
                      </button>
                  </div>
              </div>

              <button onClick={() => setLightboxIndex(p => p! < photos.length - 1 ? p! + 1 : 0)} className="absolute right-4 text-white text-4xl p-4 z-50">&#8250;</button>
          </div>
      )}
    </div>
  );
};

export default ClientSelection;