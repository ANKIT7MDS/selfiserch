import React, { useState, useRef, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import { Api } from '../services/api';
import { useLocation } from 'react-router-dom';
import { Photo } from '../types';

const GuestPortal = () => {
  const location = useLocation();
  const linkId = new URLSearchParams(location.search).get('linkId');
  
  const [step, setStep] = useState<'capture' | 'form' | 'results'>('capture');
  const [selfie, setSelfie] = useState<string | null>(null);
  const [matches, setMatches] = useState<Photo[]>([]);
  const [formData, setFormData] = useState({ name: '', mobile: '' });
  const [loading, setLoading] = useState(false);
  const webcamRef = useRef<Webcam>(null);

  // Advanced Features State
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [activeFilter, setActiveFilter] = useState<string>('All');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Extract unique tags from photos
  const allTags = ['All', ...Array.from(new Set(matches.flatMap(p => p.ai_tags || [])))];

  // Capture Selfie
  const capture = useCallback(() => {
    if (webcamRef.current) {
      const imageSrc = webcamRef.current.getScreenshot();
      setSelfie(imageSrc);
    }
  }, [webcamRef]);

  // Search Logic
  const handleSearch = async () => {
    if (!selfie || !linkId) return;
    setLoading(true);
    try {
      const res = await Api.findMatches(linkId, selfie);
      if (res.matches && res.matches.length > 0) {
        setMatches(res.matches);
        setStep('form');
      } else {
        alert("No photos found matching your face. Try again with better lighting.");
        setSelfie(null);
      }
    } catch (e) {
      alert("Search failed or Link Expired.");
    } finally {
      setLoading(false);
    }
  };

  // Unlock Gallery
  const handleUnlock = async () => {
    if (!formData.name || !formData.mobile) return;
    setLoading(true);
    try {
      await Api.saveGuestDetails({
        linkId,
        name: formData.name,
        mobile: formData.mobile,
        selfie_image: selfie,
        photo_count: matches.length
      });
      setStep('results');
    } catch (e) {
      alert("Could not save details.");
    } finally {
      setLoading(false);
    }
  };

  // Selection Logic
  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedPhotos);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedPhotos(newSet);
  };

  const selectAll = () => {
    if (selectedPhotos.size === filteredPhotos.length) {
      setSelectedPhotos(new Set());
    } else {
      setSelectedPhotos(new Set(filteredPhotos.map(p => p.photo_id)));
    }
  };

  // Download Logic
  const handleDownloadSelected = () => {
    // Note: In a real prod env, send IDs to backend to get a ZIP url.
    // For now, we simulate by opening individual links (browser may block popups if too many)
    const photosToDownload = matches.filter(p => selectedPhotos.has(p.photo_id));
    if (photosToDownload.length === 0) return alert("Select photos first");
    
    if (confirm(`Download ${photosToDownload.length} photos? (Enable popups if blocked)`)) {
      photosToDownload.forEach(p => {
        const link = document.createElement('a');
        link.href = p.url;
        link.download = `EventLens_${p.photo_id}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      });
    }
  };

  const filteredPhotos = activeFilter === 'All' 
    ? matches 
    : matches.filter(p => p.ai_tags?.includes(activeFilter));

  if (!linkId) return <div className="h-screen flex items-center justify-center bg-black text-white">Invalid Link</div>;

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-800 flex justify-between items-center sticky top-0 bg-black/90 z-20 backdrop-blur-md">
        <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-brand to-blue-500">EventLens Search</h1>
        {step === 'results' && (
           <div className="text-sm">
             <span className="text-brand font-bold">{matches.length}</span> Photos Found
           </div>
        )}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-4">
        
        {/* STEP 1: CAPTURE */}
        {step === 'capture' && (
          <div className="w-full max-w-md flex flex-col items-center gap-6">
            {!selfie ? (
              <div className="relative w-full aspect-[3/4] bg-gray-900 rounded-2xl overflow-hidden border-2 border-brand/50 shadow-[0_0_30px_rgba(0,230,118,0.2)]">
                <Webcam
                  audio={false}
                  ref={webcamRef}
                  screenshotFormat="image/jpeg"
                  className="w-full h-full object-cover"
                  videoConstraints={{ facingMode: "user" }}
                />
              </div>
            ) : (
              <div className="relative w-full aspect-[3/4]">
                <img src={selfie} className="w-full h-full object-cover rounded-2xl border-2 border-white" alt="Captured" />
              </div>
            )}

            <div className="flex gap-4 w-full">
              {!selfie ? (
                <button onClick={capture} className="flex-1 bg-white text-black py-4 rounded-full font-bold text-lg hover:bg-gray-200 transition">
                  Take Selfie 📸
                </button>
              ) : (
                <>
                  <button onClick={() => setSelfie(null)} className="flex-1 bg-gray-800 py-4 rounded-full font-bold">Retake</button>
                  <button onClick={handleSearch} disabled={loading} className="flex-1 bg-brand text-black py-4 rounded-full font-bold">
                    {loading ? 'Searching...' : 'Find Photos 🔍'}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* STEP 2: FORM */}
        {step === 'form' && (
          <div className="w-full max-w-sm bg-dark-card p-8 rounded-3xl border border-dark-border text-center">
            <div className="w-20 h-20 bg-brand/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <span className="text-3xl">🎉</span>
            </div>
            <h2 className="text-2xl font-bold mb-2">Found {matches.length} Matches!</h2>
            <p className="text-gray-400 mb-6">Enter details to unlock your gallery.</p>
            
            <input 
              type="text" placeholder="Your Name" 
              className="w-full bg-black border border-gray-700 p-3 rounded-xl mb-3 text-white focus:border-brand outline-none"
              value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
            />
            <input 
              type="tel" placeholder="Mobile Number" 
              className="w-full bg-black border border-gray-700 p-3 rounded-xl mb-6 text-white focus:border-brand outline-none"
              value={formData.mobile} onChange={e => setFormData({...formData, mobile: e.target.value})}
            />
            
            <button onClick={handleUnlock} disabled={loading} className="w-full bg-brand text-black font-bold py-3 rounded-xl hover:scale-105 transition">
              {loading ? 'Unlocking...' : 'Unlock Photos 🔓'}
            </button>
          </div>
        )}

        {/* STEP 3: RESULTS (Gallery) */}
        {step === 'results' && (
          <div className="w-full max-w-6xl pb-20">
            {/* Toolbar */}
            <div className="flex flex-col md:flex-row gap-4 justify-between items-center mb-6 bg-dark-card p-4 rounded-xl border border-dark-border">
                {/* Filters */}
                <div className="flex gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0">
                    {allTags.map(tag => (
                        <button 
                            key={tag}
                            onClick={() => setActiveFilter(tag)}
                            className={`px-4 py-1 rounded-full text-sm whitespace-nowrap ${activeFilter === tag ? 'bg-brand text-black font-bold' : 'bg-gray-800 text-gray-300'}`}
                        >
                            {tag}
                        </button>
                    ))}
                </div>

                {/* Actions */}
                <div className="flex gap-3 w-full md:w-auto">
                    <button onClick={selectAll} className="flex-1 md:flex-none px-4 py-2 border border-gray-600 rounded-lg hover:bg-gray-800">
                        {selectedPhotos.size === filteredPhotos.length ? 'Deselect All' : 'Select All'}
                    </button>
                    <button 
                        onClick={handleDownloadSelected}
                        disabled={selectedPhotos.size === 0}
                        className={`flex-1 md:flex-none px-6 py-2 rounded-lg font-bold transition ${selectedPhotos.size > 0 ? 'bg-brand text-black' : 'bg-gray-800 text-gray-500'}`}
                    >
                        Download ({selectedPhotos.size})
                    </button>
                </div>
            </div>
            
            {/* Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2 md:gap-4">
              {filteredPhotos.map((photo, i) => (
                <div 
                    key={photo.photo_id} 
                    className={`relative group aspect-square bg-gray-900 rounded-lg overflow-hidden cursor-pointer border-2 transition ${selectedPhotos.has(photo.photo_id) ? 'border-brand' : 'border-transparent'}`}
                    onClick={() => toggleSelection(photo.photo_id)}
                >
                  <img src={photo.thumbnail_url || photo.url} loading="lazy" className="w-full h-full object-cover" alt="Result" />
                  
                  {/* Selection Checkbox UI */}
                  <div className={`absolute top-2 right-2 w-6 h-6 rounded-full border-2 flex items-center justify-center ${selectedPhotos.has(photo.photo_id) ? 'bg-brand border-brand' : 'bg-black/50 border-white'}`}>
                    {selectedPhotos.has(photo.photo_id) && <span className="text-black text-xs">✓</span>}
                  </div>

                  {/* Hover Actions */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2">
                    <button 
                        onClick={(e) => { e.stopPropagation(); setLightboxIndex(i); }} 
                        className="bg-white/20 backdrop-blur-sm p-2 rounded-full hover:bg-white/40"
                    >
                        👁️
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Lightbox / Slide View */}
            {lightboxIndex !== null && (
                <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
                    <button onClick={() => setLightboxIndex(null)} className="absolute top-4 right-4 text-white text-4xl z-50">&times;</button>
                    
                    <button 
                        onClick={() => setLightboxIndex((prev) => (prev! > 0 ? prev! - 1 : filteredPhotos.length - 1))}
                        className="absolute left-4 text-white text-4xl p-4 hover:bg-white/10 rounded-full"
                    >
                        &#8249;
                    </button>

                    <div className="max-w-4xl max-h-[80vh]">
                        <img 
                            src={filteredPhotos[lightboxIndex].url} 
                            className="max-h-[80vh] max-w-full object-contain" 
                            alt="Full View" 
                        />
                        <div className="text-center mt-4">
                            <a href={filteredPhotos[lightboxIndex].url} download className="bg-brand text-black px-6 py-2 rounded-full font-bold">
                                Download High Res
                            </a>
                        </div>
                    </div>

                    <button 
                        onClick={() => setLightboxIndex((prev) => (prev! < filteredPhotos.length - 1 ? prev! + 1 : 0))}
                        className="absolute right-4 text-white text-4xl p-4 hover:bg-white/10 rounded-full"
                    >
                        &#8250;
                    </button>
                </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default GuestPortal;