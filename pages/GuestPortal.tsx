import React, { useState, useRef, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import { Api } from '../services/api';
import { useLocation } from 'react-router-dom';
import { Photo } from '../types';

const GuestPortal = () => {
  const location = useLocation();
  const linkId = new URLSearchParams(location.search).get('linkId');
  
  const [step, setStep] = useState<'capture' | 'form' | 'results'>('capture');
  const [searchMode, setSearchMode] = useState<'camera' | 'upload'>('camera');
  const [selfie, setSelfie] = useState<string | null>(null);
  const [matches, setMatches] = useState<Photo[]>([]);
  const [formData, setFormData] = useState({ name: '', mobile: '' });
  const [loading, setLoading] = useState(false);
  const [pin, setPin] = useState("");
  const webcamRef = useRef<Webcam>(null);

  // Advanced Features State
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [activeFilter, setActiveFilter] = useState<string>('All');
  const [searchText, setSearchText] = useState("");
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

  // Handle File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onloadend = () => {
              setSelfie(reader.result as string);
          };
          reader.readAsDataURL(file);
      }
  };

  // Search Logic with PIN
  const handleSearch = async () => {
    if (!selfie || !linkId) return;
    setLoading(true);
    try {
      // Sending PIN in payload
      const res = await Api.findMatches(linkId, selfie, pin);
      
      if (res.matches && res.matches.length > 0) {
        setMatches(res.matches);
        setStep('form');
      } else {
        alert("No photos found matching your face. Try again with better lighting.");
        setSelfie(null);
      }
    } catch (e: any) {
      if (e.message.includes("Invalid PIN")) {
          alert("Incorrect PIN. Please try again.");
      } else {
          alert("Search failed. Link may be expired or invalid.");
      }
    } finally {
      setLoading(false);
    }
  };

  // Unlock Gallery & Save Leads
  const handleUnlock = async () => {
    if (!formData.name || !formData.mobile) {
        alert("Please enter Name and Mobile to proceed.");
        return;
    }
    setLoading(true);
    try {
      await Api.saveGuestDetails({
        linkId,
        name: formData.name,
        mobile: formData.mobile,
        selfie_image: selfie, // Ensure Base64 is sent
        photo_count: matches.length
      });
      setStep('results');
    } catch (e) {
      console.error(e);
      alert("Could not save details. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Selection & Download Logic
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

  const handleDownloadSelected = () => {
    const photosToDownload = matches.filter(p => selectedPhotos.has(p.photo_id));
    if (photosToDownload.length === 0) return alert("Select photos first");
    
    if (confirm(`Download ${photosToDownload.length} photos?`)) {
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

  const handleShare = (photo?: Photo) => {
      let text = "Check out my photos from the event!";
      let url = window.location.href;
      if(photo) {
          text = "Look at this photo of me!";
          url = photo.url;
      } else {
         text = `I found ${matches.length} photos of me! Check them out here:`;
      }
      const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text + " " + url)}`;
      window.open(whatsappUrl, '_blank');
  };

  const filteredPhotos = matches.filter(p => {
    const tagMatch = activeFilter === 'All' || p.ai_tags?.includes(activeFilter);
    const textMatch = searchText === "" || 
                      (p.ai_tags && p.ai_tags.some(t => t.toLowerCase().includes(searchText.toLowerCase())));
    return tagMatch && textMatch;
  });

  if (!linkId) return <div className="h-screen flex items-center justify-center bg-black text-white font-bold text-xl">Invalid Link 🚫</div>;

  return (
    <div className="min-h-screen bg-black text-white flex flex-col font-sans overflow-x-hidden selection:bg-brand selection:text-black">
      
      {/* Dynamic Background */}
      <div className="fixed inset-0 pointer-events-none z-0">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-brand/10 rounded-full blur-[120px] animate-pulse"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 rounded-full blur-[120px] animate-pulse" style={{animationDelay: '2s'}}></div>
      </div>

      {/* Header */}
      <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center sticky top-0 bg-black/80 z-50 backdrop-blur-xl">
        <h1 className="text-xl font-black bg-clip-text text-transparent bg-gradient-to-r from-brand to-emerald-400 tracking-tight">EventLens<span className="text-white text-xs font-normal align-top ml-1">AI</span></h1>
        {step === 'results' && (
           <div className="text-xs bg-brand/10 text-brand px-3 py-1 rounded-full border border-brand/20 shadow-[0_0_10px_rgba(0,230,118,0.2)]">
             <span className="font-bold">{matches.length}</span> Found
           </div>
        )}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-4 z-10 w-full max-w-7xl mx-auto">
        
        {/* STEP 1: CAPTURE / UPLOAD */}
        {step === 'capture' && (
          <div className="w-full max-w-md flex flex-col items-center gap-6 animate-fade-in">
            <div className="text-center space-y-2">
                <h2 className="text-4xl font-bold text-white tracking-tight">Find Your Photos</h2>
                <p className="text-gray-400 text-sm font-light">AI Facial Recognition System</p>
            </div>
            
            {/* Toggle Switch */}
            <div className="bg-[#111] p-1.5 rounded-full flex w-full max-w-[280px] border border-white/10 shadow-inner">
                <button 
                    onClick={() => { setSearchMode('camera'); setSelfie(null); }}
                    className={`flex-1 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all duration-300 ${searchMode === 'camera' ? 'bg-brand text-black shadow-lg scale-105' : 'text-gray-500 hover:text-white'}`}
                >
                    Camera
                </button>
                <button 
                    onClick={() => { setSearchMode('upload'); setSelfie(null); }}
                    className={`flex-1 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all duration-300 ${searchMode === 'upload' ? 'bg-brand text-black shadow-lg scale-105' : 'text-gray-500 hover:text-white'}`}
                >
                    Upload
                </button>
            </div>

            {/* Media Area */}
            {!selfie ? (
              <div className="relative w-full aspect-[3/4] bg-[#0a0a0a] rounded-[2rem] overflow-hidden border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col items-center justify-center group">
                {searchMode === 'camera' ? (
                     <Webcam
                     audio={false}
                     ref={webcamRef}
                     screenshotFormat="image/jpeg"
                     className="w-full h-full object-cover"
                     videoConstraints={{ facingMode: "user" }}
                   />
                ) : (
                    <label className="cursor-pointer w-full h-full flex flex-col items-center justify-center hover:bg-white/5 transition-all duration-300 group-hover:border-brand/30">
                        <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-4 group-hover:scale-110 transition duration-300">
                             <span className="text-4xl">📂</span>
                        </div>
                        <span className="text-gray-300 font-medium">Tap to Select Photo</span>
                        <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                    </label>
                )}
                {/* Scanner Overlay */}
                <div className="absolute inset-0 border-[1px] border-brand/20 rounded-[2rem] pointer-events-none"></div>
                <div className="absolute top-[20%] left-[10%] right-[10%] h-0.5 bg-brand/50 blur-sm animate-scan"></div>
              </div>
            ) : (
              <div className="relative w-full aspect-[3/4] group rounded-[2rem] overflow-hidden shadow-2xl border border-brand/20">
                <img src={selfie} className="w-full h-full object-cover" alt="Captured" />
                <button 
                    onClick={() => setSelfie(null)} 
                    className="absolute top-4 right-4 bg-black/40 hover:bg-red-500/80 backdrop-blur-md text-white w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 border border-white/20"
                >
                    ✕
                </button>
              </div>
            )}

            {/* Actions */}
            <div className="w-full space-y-4">
                {/* PIN Input */}
                <div className="relative">
                    <input 
                        type="password" 
                        placeholder="Enter Event PIN (if required)" 
                        value={pin}
                        onChange={(e) => setPin(e.target.value)}
                        className="w-full bg-[#111] border border-white/10 rounded-xl px-4 py-3 text-center text-white focus:border-brand outline-none transition placeholder-gray-600 tracking-widest"
                    />
                </div>

              {!selfie ? (
                searchMode === 'camera' && (
                    <button onClick={capture} className="w-full bg-white text-black py-4 rounded-xl font-bold text-lg hover:bg-gray-200 transition shadow-[0_0_20px_rgba(255,255,255,0.2)]">
                    Take Selfie 📸
                    </button>
                )
              ) : (
                <button onClick={handleSearch} disabled={loading} className="w-full bg-gradient-to-r from-brand to-emerald-500 text-black py-4 rounded-xl font-bold text-lg hover:brightness-110 transition shadow-[0_0_30px_rgba(0,230,118,0.4)] relative overflow-hidden">
                  {loading ? (
                      <span className="flex items-center justify-center gap-2">
                          <span className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin"></span>
                          Scanning Database...
                      </span>
                  ) : 'Find My Photos 🔍'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* STEP 2: FORM */}
        {step === 'form' && (
          <div className="w-full max-w-sm bg-[#0a0a0a]/90 backdrop-blur-xl p-8 rounded-3xl border border-white/10 text-center shadow-2xl animate-fade-in-up relative overflow-hidden">
            {/* Confetti Effect Background */}
            <div className="absolute inset-0 bg-gradient-to-b from-brand/5 to-transparent pointer-events-none"></div>

            <div className="w-24 h-24 bg-gradient-to-tr from-brand to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_0_40px_rgba(0,230,118,0.3)] animate-bounce-slow">
              <span className="text-4xl">🎉</span>
            </div>
            <h2 className="text-3xl font-bold mb-2">Success!</h2>
            <p className="text-gray-400 mb-8">We found <span className="text-brand font-bold">{matches.length} photos</span> matching your face.</p>
            
            <div className="space-y-4 mb-8">
                <div className="group bg-black/50 border border-white/10 rounded-2xl px-4 py-4 flex items-center gap-4 focus-within:border-brand transition-all duration-300">
                    <span className="text-gray-500 text-xl group-focus-within:text-brand transition">👤</span>
                    <input 
                        type="text" placeholder="Your Name" 
                        className="bg-transparent w-full outline-none text-white placeholder-gray-600 font-medium"
                        value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
                    />
                </div>
                <div className="group bg-black/50 border border-white/10 rounded-2xl px-4 py-4 flex items-center gap-4 focus-within:border-brand transition-all duration-300">
                    <span className="text-gray-500 text-xl group-focus-within:text-brand transition">📱</span>
                    <input 
                        type="tel" placeholder="Mobile Number" 
                        className="bg-transparent w-full outline-none text-white placeholder-gray-600 font-medium"
                        value={formData.mobile} onChange={e => setFormData({...formData, mobile: e.target.value})}
                    />
                </div>
            </div>
            
            <button onClick={handleUnlock} disabled={loading} className="w-full bg-brand text-black font-bold py-4 rounded-xl hover:scale-[1.02] active:scale-95 transition shadow-[0_0_30px_rgba(0,230,118,0.3)]">
              {loading ? 'Unlocking Gallery...' : 'Unlock Photos 🔓'}
            </button>
          </div>
        )}

        {/* STEP 3: RESULTS (Gallery) */}
        {step === 'results' && (
          <div className="w-full max-w-[1600px] pb-20 animate-fade-in">
            {/* Toolbar */}
            <div className="flex flex-col gap-4 mb-6 bg-[#0a0a0a]/90 backdrop-blur-md p-4 rounded-3xl border border-white/5 shadow-2xl sticky top-20 z-40 transition-all duration-300">
                
                <div className="flex flex-col md:flex-row gap-3 justify-between">
                    <div className="relative w-full md:w-1/3 group">
                        <input 
                            type="text" 
                            placeholder="Search (e.g. 'smile', 'red shirt')..." 
                            value={searchText}
                            onChange={e => setSearchText(e.target.value)}
                            className="bg-[#111] border border-white/10 rounded-2xl px-4 py-3 pl-10 w-full focus:border-brand outline-none transition text-white group-hover:border-white/20"
                        />
                        <span className="absolute left-3 top-3.5 text-gray-500 group-focus-within:text-brand transition">🔍</span>
                    </div>
                    
                    <div className="flex gap-2 w-full md:w-auto">
                        <button onClick={() => handleShare()} className="flex-1 bg-[#25D366] text-black px-6 py-2 rounded-xl font-bold hover:brightness-110 transition flex items-center justify-center gap-2 shadow-[0_4px_15px_rgba(37,211,102,0.2)]">
                            <span className="text-xl">💬</span> Share
                        </button>
                        <button 
                            onClick={handleDownloadSelected}
                            disabled={selectedPhotos.size === 0}
                            className={`flex-1 px-6 py-2 rounded-xl font-bold transition flex items-center justify-center gap-2 ${selectedPhotos.size > 0 ? 'bg-brand text-black shadow-[0_4px_15px_rgba(0,230,118,0.3)]' : 'bg-white/5 text-gray-500 border border-white/5'}`}
                        >
                             Download ({selectedPhotos.size})
                        </button>
                    </div>
                </div>

                {/* Filters */}
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                    {allTags.map(tag => (
                        <button 
                            key={tag}
                            onClick={() => setActiveFilter(tag)}
                            className={`px-5 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all duration-300 border ${activeFilter === tag ? 'bg-white text-black border-white shadow-[0_0_15px_rgba(255,255,255,0.3)] scale-105' : 'bg-transparent text-gray-400 border-white/10 hover:border-white/40 hover:text-white'}`}
                        >
                            {tag}
                        </button>
                    ))}
                </div>
            </div>
            
            {/* Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-1 md:gap-4">
              {filteredPhotos.map((photo, i) => (
                <div 
                    key={photo.photo_id} 
                    className={`relative group aspect-square bg-[#111] rounded-xl overflow-hidden cursor-pointer transition-all duration-300 ${selectedPhotos.has(photo.photo_id) ? 'ring-4 ring-brand z-10 scale-95' : 'hover:scale-[1.02] hover:z-10 hover:shadow-2xl'}`}
                    onClick={() => toggleSelection(photo.photo_id)}
                >
                  <img src={photo.thumbnail_url || photo.url} loading="lazy" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" alt="Result" />
                  
                  {/* Selection Indicator */}
                  <div className={`absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300 ${selectedPhotos.has(photo.photo_id) ? 'bg-brand text-black scale-100 shadow-lg' : 'bg-black/40 backdrop-blur scale-0 group-hover:scale-100 border border-white/30'}`}>
                    {selectedPhotos.has(photo.photo_id) && <span className="text-xs font-bold">✓</span>}
                  </div>
                  
                  {/* Hover Overlay */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition duration-300 bg-black/40 backdrop-blur-[2px]">
                       <button onClick={(e) => { e.stopPropagation(); setLightboxIndex(i); }} className="bg-white/10 hover:bg-white/30 backdrop-blur-md p-3 rounded-full text-white border border-white/20 transition-all hover:scale-110">
                           👁️
                       </button>
                  </div>
                </div>
              ))}
            </div>
            
            {filteredPhotos.length === 0 && (
                <div className="text-center py-20 text-gray-500 flex flex-col items-center">
                    <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-4">
                        <span className="text-4xl">🤔</span>
                    </div>
                    <span className="font-light">No photos found matching your search.</span>
                </div>
            )}

            {/* Lightbox */}
            {lightboxIndex !== null && (
                <div className="fixed inset-0 z-50 bg-black/98 flex items-center justify-center backdrop-blur-2xl animate-fade-in">
                    <button onClick={() => setLightboxIndex(null)} className="absolute top-6 right-6 w-12 h-12 flex items-center justify-center bg-white/10 rounded-full text-white hover:bg-white/20 transition z-50">&times;</button>
                    
                    <button 
                        onClick={() => setLightboxIndex((prev) => (prev! > 0 ? prev! - 1 : filteredPhotos.length - 1))}
                        className="absolute left-6 text-white text-4xl p-4 hover:scale-110 transition hidden md:block"
                    >
                        &#8249;
                    </button>

                    <div className="w-full h-full p-4 md:p-10 flex flex-col items-center justify-center">
                        <img 
                            src={filteredPhotos[lightboxIndex].url} 
                            className="max-h-[85vh] max-w-full object-contain shadow-[0_0_50px_rgba(0,0,0,0.5)] rounded-lg" 
                            alt="Full View" 
                        />
                        <div className="flex gap-4 mt-6">
                            <a href={filteredPhotos[lightboxIndex].url} download className="bg-white text-black px-8 py-3 rounded-full font-bold hover:bg-gray-200 transition shadow-lg hover:scale-105">
                                Download HD
                            </a>
                            <button onClick={() => handleShare(filteredPhotos[lightboxIndex!])} className="bg-[#25D366] text-black px-8 py-3 rounded-full font-bold hover:brightness-110 transition shadow-lg hover:scale-105">
                                Share
                            </button>
                        </div>
                    </div>

                    <button 
                        onClick={() => setLightboxIndex((prev) => (prev! < filteredPhotos.length - 1 ? prev! + 1 : 0))}
                        className="absolute right-6 text-white text-4xl p-4 hover:scale-110 transition hidden md:block"
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