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

  if (!linkId) return <div className="h-screen flex items-center justify-center bg-black text-white font-bold text-xl">Invalid or Expired Link 🚫</div>;

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col font-sans">
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/10 flex justify-between items-center sticky top-0 bg-[#050505]/90 z-20 backdrop-blur-md">
        <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-brand to-green-400">EventLens</h1>
        {step === 'results' && (
           <div className="text-xs bg-brand/10 text-brand px-3 py-1 rounded-full border border-brand/20">
             <span className="font-bold">{matches.length}</span> Found
           </div>
        )}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-4">
        
        {/* STEP 1: CAPTURE / UPLOAD */}
        {step === 'capture' && (
          <div className="w-full max-w-md flex flex-col items-center gap-6 animate-fade-in">
            <div className="text-center">
                <h2 className="text-3xl font-bold text-white mb-2">Find Your Photos 📸</h2>
                <p className="text-gray-400 text-sm">Upload a selfie or take one to search the gallery.</p>
            </div>
            
            <div className="bg-[#111] p-1 rounded-full flex w-full max-w-xs border border-white/10 mb-2">
                <button 
                    onClick={() => { setSearchMode('camera'); setSelfie(null); }}
                    className={`flex-1 py-2 rounded-full text-sm font-medium transition ${searchMode === 'camera' ? 'bg-brand text-black shadow-lg' : 'text-gray-400 hover:text-white'}`}
                >
                    Camera
                </button>
                <button 
                    onClick={() => { setSearchMode('upload'); setSelfie(null); }}
                    className={`flex-1 py-2 rounded-full text-sm font-medium transition ${searchMode === 'upload' ? 'bg-brand text-black shadow-lg' : 'text-gray-400 hover:text-white'}`}
                >
                    Upload
                </button>
            </div>

            {!selfie ? (
              <div className="relative w-full aspect-[3/4] bg-[#1a1a1a] rounded-3xl overflow-hidden border-2 border-brand/30 shadow-[0_0_40px_rgba(0,230,118,0.1)] flex flex-col items-center justify-center">
                {searchMode === 'camera' ? (
                     <Webcam
                     audio={false}
                     ref={webcamRef}
                     screenshotFormat="image/jpeg"
                     className="w-full h-full object-cover"
                     videoConstraints={{ facingMode: "user" }}
                   />
                ) : (
                    <label className="cursor-pointer w-full h-full flex flex-col items-center justify-center hover:bg-white/5 transition">
                        <span className="text-6xl mb-4">📂</span>
                        <span className="text-gray-300 font-medium">Tap to Select Photo</span>
                        <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                    </label>
                )}
              </div>
            ) : (
              <div className="relative w-full aspect-[3/4] group">
                <img src={selfie} className="w-full h-full object-cover rounded-3xl border-2 border-white/50 shadow-2xl" alt="Captured" />
                <button 
                    onClick={() => setSelfie(null)} 
                    className="absolute top-4 right-4 bg-black/60 text-white w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-md hover:bg-red-500 transition"
                >
                    ✕
                </button>
              </div>
            )}

            <div className="w-full">
              {!selfie ? (
                searchMode === 'camera' && (
                    <button onClick={capture} className="w-full bg-white text-black py-4 rounded-2xl font-bold text-lg hover:bg-gray-200 transition shadow-[0_5px_20px_rgba(255,255,255,0.2)]">
                    Take Selfie 📸
                    </button>
                )
              ) : (
                <button onClick={handleSearch} disabled={loading} className="w-full bg-brand text-black py-4 rounded-2xl font-bold text-lg hover:scale-[1.02] transition shadow-[0_5px_20px_rgba(0,230,118,0.3)]">
                  {loading ? 'Scanning Faces...' : 'Find My Photos 🔍'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* STEP 2: FORM */}
        {step === 'form' && (
          <div className="w-full max-w-sm bg-[#111] p-8 rounded-3xl border border-white/10 text-center shadow-2xl animate-fade-in-up">
            <div className="w-24 h-24 bg-gradient-to-tr from-brand to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-brand/30">
              <span className="text-4xl">🎉</span>
            </div>
            <h2 className="text-2xl font-bold mb-2">Success!</h2>
            <p className="text-gray-400 mb-8">We found <span className="text-brand font-bold">{matches.length} photos</span> of you.</p>
            
            <div className="space-y-4 mb-6">
                <div className="bg-black/50 border border-white/10 rounded-xl px-4 py-3 flex items-center gap-3 focus-within:border-brand transition">
                    <span className="text-gray-500">👤</span>
                    <input 
                        type="text" placeholder="Your Name" 
                        className="bg-transparent w-full outline-none text-white placeholder-gray-600"
                        value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
                    />
                </div>
                <div className="bg-black/50 border border-white/10 rounded-xl px-4 py-3 flex items-center gap-3 focus-within:border-brand transition">
                    <span className="text-gray-500">📱</span>
                    <input 
                        type="tel" placeholder="Mobile Number" 
                        className="bg-transparent w-full outline-none text-white placeholder-gray-600"
                        value={formData.mobile} onChange={e => setFormData({...formData, mobile: e.target.value})}
                    />
                </div>
            </div>
            
            <button onClick={handleUnlock} disabled={loading} className="w-full bg-brand text-black font-bold py-4 rounded-xl hover:brightness-110 transition shadow-lg shadow-brand/20">
              {loading ? 'Unlocking Gallery...' : 'View Photos 🔓'}
            </button>
          </div>
        )}

        {/* STEP 3: RESULTS (Gallery) */}
        {step === 'results' && (
          <div className="w-full max-w-6xl pb-20 animate-fade-in">
            {/* Toolbar */}
            <div className="flex flex-col gap-4 mb-6 bg-[#111] p-4 rounded-2xl border border-white/5 shadow-xl sticky top-20 z-10">
                
                <div className="flex flex-col md:flex-row gap-3 justify-between">
                    <div className="relative w-full md:w-1/3">
                        <input 
                            type="text" 
                            placeholder="Search (e.g. 'smile', 'red shirt')..." 
                            value={searchText}
                            onChange={e => setSearchText(e.target.value)}
                            className="bg-black border border-white/10 rounded-xl px-4 py-3 pl-10 w-full focus:border-brand outline-none transition"
                        />
                        <span className="absolute left-3 top-3.5 text-gray-500">🔍</span>
                    </div>
                    
                    <div className="flex gap-2 w-full md:w-auto">
                        <button onClick={() => handleShare()} className="flex-1 bg-[#25D366] text-black px-4 py-2 rounded-xl font-bold hover:brightness-110 transition flex items-center justify-center gap-2">
                            <span>💬</span> Share
                        </button>
                        <button 
                            onClick={handleDownloadSelected}
                            disabled={selectedPhotos.size === 0}
                            className={`flex-1 px-6 py-2 rounded-xl font-bold transition flex items-center justify-center gap-2 ${selectedPhotos.size > 0 ? 'bg-brand text-black' : 'bg-white/10 text-gray-500'}`}
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
                            className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition border ${activeFilter === tag ? 'bg-white text-black border-white' : 'bg-transparent text-gray-400 border-white/10 hover:border-white/40'}`}
                        >
                            {tag}
                        </button>
                    ))}
                </div>
                
                 <div className="flex justify-between items-center text-[10px] text-gray-400 uppercase tracking-widest">
                    <span>{filteredPhotos.length} RESULTS</span>
                    <button onClick={selectAll} className="hover:text-white transition">
                        {selectedPhotos.size === filteredPhotos.length ? 'DESELECT ALL' : 'SELECT ALL'}
                    </button>
                 </div>
            </div>
            
            {/* Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {filteredPhotos.map((photo, i) => (
                <div 
                    key={photo.photo_id} 
                    className={`relative group aspect-square bg-[#111] rounded-xl overflow-hidden cursor-pointer transition-all duration-300 ${selectedPhotos.has(photo.photo_id) ? 'ring-2 ring-brand ring-offset-2 ring-offset-black' : ''}`}
                    onClick={() => toggleSelection(photo.photo_id)}
                >
                  <img src={photo.thumbnail_url || photo.url} loading="lazy" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" alt="Result" />
                  
                  <div className={`absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center transition-all ${selectedPhotos.has(photo.photo_id) ? 'bg-brand text-black scale-100' : 'bg-black/40 backdrop-blur scale-0 group-hover:scale-100 border border-white/30'}`}>
                    {selectedPhotos.has(photo.photo_id) && <span className="text-xs font-bold">✓</span>}
                  </div>
                  
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition duration-300 bg-black/30">
                       <button onClick={(e) => { e.stopPropagation(); setLightboxIndex(i); }} className="bg-white/20 hover:bg-white/40 backdrop-blur-md p-3 rounded-full text-white">
                           👁️
                       </button>
                  </div>
                </div>
              ))}
            </div>
            
            {filteredPhotos.length === 0 && (
                <div className="text-center py-20 text-gray-500 flex flex-col items-center">
                    <span className="text-4xl mb-2">🤔</span>
                    <span>No photos found matching your search.</span>
                </div>
            )}

            {/* Lightbox */}
            {lightboxIndex !== null && (
                <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center backdrop-blur-xl animate-fade-in">
                    <button onClick={() => setLightboxIndex(null)} className="absolute top-6 right-6 text-white/50 hover:text-white text-4xl z-50 transition">&times;</button>
                    
                    <button 
                        onClick={() => setLightboxIndex((prev) => (prev! > 0 ? prev! - 1 : filteredPhotos.length - 1))}
                        className="absolute left-4 text-white/50 hover:text-white text-5xl p-4 hidden md:block transition"
                    >
                        &#8249;
                    </button>

                    <div className="w-full max-w-5xl h-full p-4 flex flex-col items-center justify-center">
                        <img 
                            src={filteredPhotos[lightboxIndex].url} 
                            className="max-h-[80vh] max-w-full object-contain shadow-2xl rounded-lg" 
                            alt="Full View" 
                        />
                        <div className="flex gap-4 mt-8">
                            <a href={filteredPhotos[lightboxIndex].url} download className="bg-white text-black px-8 py-3 rounded-full font-bold hover:bg-gray-200 transition">
                                Download HD
                            </a>
                            <button onClick={() => handleShare(filteredPhotos[lightboxIndex!])} className="bg-[#25D366] text-black px-8 py-3 rounded-full font-bold hover:brightness-110 transition">
                                Share
                            </button>
                        </div>
                    </div>

                    <button 
                        onClick={() => setLightboxIndex((prev) => (prev! < filteredPhotos.length - 1 ? prev! + 1 : 0))}
                        className="absolute right-4 text-white/50 hover:text-white text-5xl p-4 hidden md:block transition"
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