import React, { useState, useRef, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import { Api } from '../services/api';
import { useLocation } from 'react-router-dom';
import { Photo, Collection } from '../types';

const GuestPortal = () => {
  const location = useLocation();
  const linkId = new URLSearchParams(location.search).get('linkId');
  
  // App Flow State
  const [step, setStep] = useState<'capture' | 'form' | 'results'>('capture');
  const [searchMode, setSearchMode] = useState<'camera' | 'upload'>('camera');
  const [loading, setLoading] = useState(false);
  
  // Data State
  const [collectionMeta, setCollectionMeta] = useState<Partial<Collection> | null>(null);
  const [selfie, setSelfie] = useState<string | null>(null);
  const [matches, setMatches] = useState<Photo[]>([]);
  const [formData, setFormData] = useState({ name: '', mobile: '' });
  const [pin, setPin] = useState("");
  
  // UI State
  const [activeFilter, setActiveFilter] = useState<string>('All');
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  
  const webcamRef = useRef<Webcam>(null);

  // 1. Initial Load: Fetch Collection Metadata for Branding
  useEffect(() => {
      if (linkId) {
          Api.getPublicCollectionInfo(linkId).then(data => {
             // Assuming API returns collection info in data or data.collection
             const info = data.collection || data;
             setCollectionMeta(info);
             
             // Apply Brand Color Dynamically
             if(info.custom_theme?.primary_color) {
                 document.documentElement.style.setProperty('--brand-color', info.custom_theme.primary_color);
             }
          }).catch(err => console.error("Failed to load branding", err));
      }
  }, [linkId]);

  // Derived State
  const allTags = ['All', ...Array.from(new Set(matches.flatMap(p => p.ai_tags || [])))];
  const filteredPhotos = matches.filter(p => activeFilter === 'All' || p.ai_tags?.includes(activeFilter));

  // --- Handlers ---

  const capture = useCallback(() => {
    if (webcamRef.current) {
      const imageSrc = webcamRef.current.getScreenshot();
      setSelfie(imageSrc);
    }
  }, [webcamRef]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onloadend = () => setSelfie(reader.result as string);
          reader.readAsDataURL(file);
      }
  };

  const handleSearch = async () => {
    if (!selfie || !linkId) return;
    setLoading(true);
    try {
      const res = await Api.findMatches(linkId, selfie, pin);
      if (res.matches && res.matches.length > 0) {
        setMatches(res.matches);
        setStep('form');
      } else {
        alert("No photos found matching your face. Try again with better lighting.");
        setSelfie(null);
      }
    } catch (e: any) {
      alert(e.message.includes("Invalid PIN") ? "Incorrect PIN." : "Search failed. Link expired?");
    } finally {
      setLoading(false);
    }
  };

  const handleUnlock = async () => {
    if (!formData.name || !formData.mobile) return alert("Please details to proceed.");
    setLoading(true);
    try {
      await Api.saveGuestDetails({ linkId, name: formData.name, mobile: formData.mobile, selfie_image: selfie, photo_count: matches.length });
      setStep('results');
    } catch (e) {
      alert("Error saving details.");
    } finally {
      setLoading(false);
    }
  };

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedPhotos);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedPhotos(newSet);
  };

  const handleDownload = () => {
    const photosToDownload = matches.filter(p => selectedPhotos.has(p.photo_id));
    if (confirm(`Download ${photosToDownload.length} photos?`)) {
      photosToDownload.forEach(p => {
        const link = document.createElement('a');
        link.href = p.url;
        link.download = `Photo_${p.photo_id}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      });
      setSelectedPhotos(new Set()); // Reset selection
    }
  };

  const handleShare = () => {
      const text = `I found ${selectedPhotos.size} photos of me at ${collectionMeta?.name || 'the event'}!`;
      const url = window.location.href;
      window.open(`https://wa.me/?text=${encodeURIComponent(text + " " + url)}`, '_blank');
  };

  // --- Render Helpers ---

  // Dynamic Background Style
  const bgStyle = collectionMeta?.custom_theme?.background_image 
    ? { backgroundImage: `url(${collectionMeta.custom_theme.background_image})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: 'radial-gradient(circle at center, #1a1a1a 0%, #000000 100%)' };

  if (!linkId) return <div className="h-screen flex items-center justify-center bg-black text-white">Invalid Link</div>;

  return (
    <div className="min-h-screen flex flex-col font-sans text-white relative overflow-hidden" style={bgStyle}>
      
      {/* 1. Glass Backdrop Overlay for Readability */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[8px] z-0"></div>

      {/* 2. Header Section (Premium) */}
      <header className="relative z-20 px-6 py-6 flex flex-col items-center text-center animate-fade-in">
         {collectionMeta?.custom_theme?.logo_url ? (
             <img src={collectionMeta.custom_theme.logo_url} alt="Logo" className="h-16 mb-4 object-contain drop-shadow-lg" />
         ) : (
             <div className="text-brand font-black tracking-tighter text-2xl mb-2">EVENTLENS</div>
         )}
         <h1 className="text-3xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-b from-white to-white/70 tracking-tight">
             {collectionMeta?.name || 'Event Gallery'}
         </h1>
         <p className="text-white/60 text-sm mt-2 font-light">
             {new Date().toDateString()} • AI Powered Search
         </p>
      </header>

      {/* 3. Main Content Area */}
      <main className="relative z-20 flex-1 flex flex-col items-center w-full max-w-7xl mx-auto p-4 md:p-8">
        
        {/* VIEW: CAPTURE */}
        {step === 'capture' && (
            <div className="w-full max-w-md animate-slide-up">
                
                {/* Mode Switcher */}
                <div className="flex bg-black/40 p-1 rounded-full border border-white/10 mb-6 backdrop-blur-md">
                    <button onClick={() => setSearchMode('camera')} className={`flex-1 py-3 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${searchMode === 'camera' ? 'bg-brand text-black shadow-lg' : 'text-gray-400 hover:text-white'}`}>Camera</button>
                    <button onClick={() => setSearchMode('upload')} className={`flex-1 py-3 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${searchMode === 'upload' ? 'bg-brand text-black shadow-lg' : 'text-gray-400 hover:text-white'}`}>Upload</button>
                </div>

                {/* Media Container */}
                <div className="relative aspect-[3/4] bg-black rounded-[32px] overflow-hidden border border-white/10 shadow-2xl mb-6 group">
                    {!selfie ? (
                        searchMode === 'camera' ? (
                            <Webcam audio={false} ref={webcamRef} screenshotFormat="image/jpeg" className="w-full h-full object-cover" videoConstraints={{ facingMode: "user" }} />
                        ) : (
                            <label className="w-full h-full flex flex-col items-center justify-center cursor-pointer hover:bg-white/5 transition">
                                <div className="w-20 h-20 bg-white/10 rounded-full flex items-center justify-center mb-4 text-4xl">📂</div>
                                <span className="text-gray-400 font-medium">Tap to Select Photo</span>
                                <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                            </label>
                        )
                    ) : (
                        <img src={selfie} className="w-full h-full object-cover" alt="Selfie" />
                    )}
                    
                    {/* Scanner Effect */}
                    {!selfie && searchMode === 'camera' && <div className="absolute top-[10%] left-0 right-0 h-1 bg-brand/50 blur-md animate-scan"></div>}
                </div>

                {/* PIN Input (Optional) */}
                <input 
                    type="password" 
                    placeholder="Enter PIN (if required)" 
                    value={pin} onChange={e => setPin(e.target.value)} 
                    className="w-full bg-black/50 border border-white/20 rounded-xl px-4 py-4 text-center text-white placeholder-gray-500 mb-4 focus:border-brand outline-none backdrop-blur-md"
                />

                {/* Main Action Button */}
                {!selfie ? (
                    searchMode === 'camera' && (
                        <button onClick={capture} className="w-full bg-white text-black font-bold text-lg py-4 rounded-2xl hover:bg-gray-200 transition shadow-lg">Take Photo 📸</button>
                    )
                ) : (
                    <div className="flex gap-3">
                        <button onClick={() => setSelfie(null)} className="flex-1 bg-white/10 text-white font-bold py-4 rounded-2xl backdrop-blur-md border border-white/10">Retake</button>
                        <button onClick={handleSearch} disabled={loading} className="flex-[2] bg-brand text-black font-bold text-lg py-4 rounded-2xl shadow-[0_0_20px_rgba(0,230,118,0.4)] hover:scale-[1.02] transition">
                            {loading ? 'Scanning...' : 'Search Photos 🔍'}
                        </button>
                    </div>
                )}
            </div>
        )}

        {/* VIEW: FORM */}
        {step === 'form' && (
            <div className="w-full max-w-sm glass-panel p-8 rounded-3xl text-center animate-pop relative overflow-hidden">
                <div className="w-20 h-20 bg-gradient-to-tr from-brand to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg text-3xl">🎉</div>
                <h2 className="text-2xl font-bold mb-2">Success!</h2>
                <p className="text-gray-400 mb-8">We found <span className="text-brand font-bold">{matches.length} photos</span> matching your face.</p>
                <div className="space-y-4 mb-8">
                    <input type="text" placeholder="Your Name" className="w-full bg-black/50 border border-white/20 p-4 rounded-xl text-white outline-none focus:border-brand" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                    <input type="tel" placeholder="Mobile Number" className="w-full bg-black/50 border border-white/20 p-4 rounded-xl text-white outline-none focus:border-brand" value={formData.mobile} onChange={e => setFormData({...formData, mobile: e.target.value})} />
                </div>
                <button onClick={handleUnlock} disabled={loading} className="w-full bg-brand text-black font-bold py-4 rounded-xl hover:brightness-110 transition shadow-lg">
                    {loading ? 'Unlocking...' : 'View Gallery 🔓'}
                </button>
            </div>
        )}

        {/* VIEW: RESULTS */}
        {step === 'results' && (
            <div className="w-full animate-fade-in pb-24">
                
                {/* Chips Filters */}
                <div className="sticky top-0 z-30 bg-[#050505]/80 backdrop-blur-xl py-4 -mx-4 px-4 mb-6 border-b border-white/5">
                    <div className="flex gap-3 overflow-x-auto scrollbar-hide max-w-7xl mx-auto">
                        {allTags.map(tag => (
                            <button 
                                key={tag} 
                                onClick={() => setActiveFilter(tag)}
                                className={`px-5 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all border ${activeFilter === tag ? 'bg-white text-black border-white scale-105' : 'bg-white/5 text-gray-400 border-white/10 hover:border-white/30'}`}
                            >
                                {tag}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Photo Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2 md:gap-4">
                    {filteredPhotos.map((photo, i) => (
                        <div 
                            key={photo.photo_id} 
                            onClick={() => toggleSelection(photo.photo_id)}
                            className={`relative aspect-square rounded-xl overflow-hidden cursor-pointer group transition-all duration-300 ${selectedPhotos.has(photo.photo_id) ? 'ring-4 ring-brand scale-95' : 'hover:scale-[1.02]'}`}
                        >
                            <img src={photo.thumbnail_url || photo.url} className="w-full h-full object-cover" loading="lazy" alt="Moment" />
                            
                            {/* Selection Overlay */}
                            <div className={`absolute inset-0 bg-black/20 transition-opacity ${selectedPhotos.has(photo.photo_id) ? 'opacity-100' : 'opacity-0'}`}>
                                <div className="absolute top-2 right-2 w-6 h-6 bg-brand rounded-full flex items-center justify-center text-black text-xs font-bold shadow-lg">✓</div>
                            </div>

                            {/* Hover Eye */}
                            <button onClick={(e) => { e.stopPropagation(); setLightboxIndex(i); }} className="absolute bottom-2 right-2 bg-black/60 text-white w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity">
                                👁
                            </button>
                        </div>
                    ))}
                </div>

                {/* Sticky Bottom Action Bar (Mobile-First UX) */}
                <div className={`fixed bottom-0 left-0 w-full p-4 z-40 transform transition-transform duration-300 ${selectedPhotos.size > 0 ? 'translate-y-0' : 'translate-y-full'}`}>
                    <div className="max-w-2xl mx-auto bg-[#1a1a1a]/90 backdrop-blur-xl border border-white/10 rounded-2xl p-4 flex items-center justify-between shadow-2xl premium-shadow">
                        <div className="text-white font-medium ml-2">
                            <span className="text-brand font-bold text-lg">{selectedPhotos.size}</span> selected
                        </div>
                        <div className="flex gap-3">
                            <button onClick={handleShare} className="w-12 h-12 bg-[#25D366] rounded-full flex items-center justify-center text-black shadow-lg hover:scale-110 transition">
                                <span className="text-xl">💬</span>
                            </button>
                            <button onClick={handleDownload} className="px-6 h-12 bg-white text-black font-bold rounded-full shadow-lg hover:scale-105 transition">
                                Download ⬇
                            </button>
                        </div>
                    </div>
                </div>

            </div>
        )}

      </main>
      
      {/* Lightbox Modal */}
      {lightboxIndex !== null && (
          <div className="fixed inset-0 z-50 bg-black/98 flex items-center justify-center backdrop-blur-xl animate-fade-in p-4">
              <button onClick={() => setLightboxIndex(null)} className="absolute top-6 right-6 z-50 w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-white hover:bg-white/20">✕</button>
              <img src={filteredPhotos[lightboxIndex].url} className="max-h-[85vh] max-w-full rounded-lg shadow-2xl object-contain" alt="Full" />
              {/* Simple Controls */}
              <div className="absolute bottom-8 flex gap-4">
                  <button onClick={() => { toggleSelection(filteredPhotos[lightboxIndex!].photo_id); setLightboxIndex(null); }} className={`px-8 py-3 rounded-full font-bold shadow-lg transition ${selectedPhotos.has(filteredPhotos[lightboxIndex!].photo_id) ? 'bg-brand text-black' : 'bg-white text-black'}`}>
                      {selectedPhotos.has(filteredPhotos[lightboxIndex!].photo_id) ? 'Selected ✓' : 'Select Photo'}
                  </button>
              </div>
          </div>
      )}

    </div>
  );
};

export default GuestPortal;