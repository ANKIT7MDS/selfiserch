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

  // Share Logic
  const handleShare = (photo?: Photo) => {
      let text = "Check out my photos from the event!";
      let url = window.location.href;
      
      if(photo) {
          text = "Look at this photo of me!";
          url = photo.url;
      } else {
         // Share all (simulated as link share)
         text = `I found ${matches.length} photos of me! Check them out here:`;
      }

      const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text + " " + url)}`;
      window.open(whatsappUrl, '_blank');
  };

  const filteredPhotos = matches.filter(p => {
    // Tag Filter
    const tagMatch = activeFilter === 'All' || p.ai_tags?.includes(activeFilter);
    // Text Search Filter (OCR or Tags)
    const textMatch = searchText === "" || 
                      (p.ai_tags && p.ai_tags.some(t => t.toLowerCase().includes(searchText.toLowerCase())));
    return tagMatch && textMatch;
  });

  if (!linkId) return <div className="h-screen flex items-center justify-center bg-black text-white">Invalid Link</div>;

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-800 flex justify-between items-center sticky top-0 bg-black/90 z-20 backdrop-blur-md">
        <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-brand to-blue-500">EventLens Search</h1>
        {step === 'results' && (
           <div className="text-sm">
             <span className="text-brand font-bold">{matches.length}</span> Photos
           </div>
        )}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-4">
        
        {/* STEP 1: CAPTURE */}
        {step === 'capture' && (
          <div className="w-full max-w-md flex flex-col items-center gap-6">
            <h2 className="text-2xl font-bold text-center">Find Your Photos 📸</h2>
            <p className="text-gray-400 text-center -mt-4 mb-2">Take a selfie to search the entire gallery instantly.</p>
            
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
                  Take Selfie
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
          <div className="w-full max-w-sm bg-dark-card p-8 rounded-3xl border border-dark-border text-center shadow-2xl">
            <div className="w-20 h-20 bg-brand/20 rounded-full flex items-center justify-center mx-auto mb-6 animate-bounce">
              <span className="text-3xl">🎉</span>
            </div>
            <h2 className="text-2xl font-bold mb-2">Found {matches.length} Matches!</h2>
            <p className="text-gray-400 mb-6">Enter your details to view and download them.</p>
            
            <div className="space-y-4">
                <input 
                type="text" placeholder="Your Name" 
                className="w-full bg-black border border-gray-700 p-4 rounded-xl text-white focus:border-brand outline-none transition"
                value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
                />
                <input 
                type="tel" placeholder="Mobile Number" 
                className="w-full bg-black border border-gray-700 p-4 rounded-xl text-white focus:border-brand outline-none transition"
                value={formData.mobile} onChange={e => setFormData({...formData, mobile: e.target.value})}
                />
            </div>
            
            <button onClick={handleUnlock} disabled={loading} className="w-full bg-brand text-black font-bold py-4 rounded-xl mt-6 hover:scale-105 transition shadow-lg shadow-brand/20">
              {loading ? 'Unlocking...' : 'Unlock Photos 🔓'}
            </button>
          </div>
        )}

        {/* STEP 3: RESULTS (Gallery) */}
        {step === 'results' && (
          <div className="w-full max-w-6xl pb-20">
            {/* Toolbar */}
            <div className="flex flex-col gap-4 mb-6 bg-dark-card p-4 rounded-xl border border-dark-border sticky top-16 z-10 shadow-xl">
                
                {/* Search & Actions */}
                <div className="flex flex-col md:flex-row gap-3 justify-between">
                    <input 
                        type="text" 
                        placeholder="Search text in photos..." 
                        value={searchText}
                        onChange={e => setSearchText(e.target.value)}
                        className="bg-black border border-gray-700 rounded-lg px-4 py-2 w-full md:w-1/3 focus:border-brand outline-none"
                    />
                    
                    <div className="flex gap-2 w-full md:w-auto">
                        <button onClick={() => handleShare()} className="flex-1 bg-[#25D366] text-black px-4 py-2 rounded-lg font-bold hover:brightness-110">
                            Share All
                        </button>
                        <button 
                            onClick={handleDownloadSelected}
                            disabled={selectedPhotos.size === 0}
                            className={`flex-1 px-6 py-2 rounded-lg font-bold transition ${selectedPhotos.size > 0 ? 'bg-brand text-black' : 'bg-gray-800 text-gray-500'}`}
                        >
                            Download ({selectedPhotos.size})
                        </button>
                    </div>
                </div>

                {/* Filters */}
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                    {allTags.map(tag => (
                        <button 
                            key={tag}
                            onClick={() => setActiveFilter(tag)}
                            className={`px-4 py-1 rounded-full text-sm whitespace-nowrap transition ${activeFilter === tag ? 'bg-white text-black font-bold' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
                        >
                            {tag}
                        </button>
                    ))}
                </div>
                
                 <div className="flex justify-between items-center text-xs text-gray-400">
                    <span>{filteredPhotos.length} photos displayed</span>
                    <button onClick={selectAll} className="underline hover:text-white">
                        {selectedPhotos.size === filteredPhotos.length ? 'Deselect All' : 'Select All'}
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
                  <div className={`absolute top-2 right-2 w-6 h-6 rounded-full border-2 flex items-center justify-center transition ${selectedPhotos.has(photo.photo_id) ? 'bg-brand border-brand' : 'bg-black/50 border-white'}`}>
                    {selectedPhotos.has(photo.photo_id) && <span className="text-black text-xs">✓</span>}
                  </div>

                  {/* Hover Actions */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2">
                    <button 
                        onClick={(e) => { e.stopPropagation(); setLightboxIndex(i); }} 
                        className="bg-white/20 backdrop-blur-sm p-3 rounded-full hover:bg-white/40"
                    >
                        👁️
                    </button>
                  </div>
                </div>
              ))}
            </div>
            
            {filteredPhotos.length === 0 && (
                <div className="text-center py-20 text-gray-500">
                    No photos found matching your search.
                </div>
            )}

            {/* Lightbox / Slide View */}
            {lightboxIndex !== null && (
                <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center backdrop-blur-sm">
                    <button onClick={() => setLightboxIndex(null)} className="absolute top-4 right-4 text-white text-4xl z-50 hover:text-gray-300">&times;</button>
                    
                    <button 
                        onClick={() => setLightboxIndex((prev) => (prev! > 0 ? prev! - 1 : filteredPhotos.length - 1))}
                        className="absolute left-4 text-white text-5xl p-4 hover:bg-white/10 rounded-full hidden md:block"
                    >
                        &#8249;
                    </button>

                    <div className="w-full max-w-4xl max-h-[90vh] flex flex-col items-center">
                        <img 
                            src={filteredPhotos[lightboxIndex].url} 
                            className="max-h-[75vh] max-w-full object-contain shadow-2xl" 
                            alt="Full View" 
                        />
                        <div className="flex gap-4 mt-6">
                            <a href={filteredPhotos[lightboxIndex].url} download className="bg-brand text-black px-6 py-2 rounded-full font-bold hover:scale-105 transition">
                                Download HD
                            </a>
                            <button onClick={() => handleShare(filteredPhotos[lightboxIndex!])} className="bg-[#25D366] text-black px-6 py-2 rounded-full font-bold hover:scale-105 transition">
                                Share WhatsApp
                            </button>
                        </div>
                    </div>

                    <button 
                        onClick={() => setLightboxIndex((prev) => (prev! < filteredPhotos.length - 1 ? prev! + 1 : 0))}
                        className="absolute right-4 text-white text-5xl p-4 hover:bg-white/10 rounded-full hidden md:block"
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