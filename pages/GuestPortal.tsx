import React, { useState, useRef, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import { Api } from '../services/api';
import { useLocation } from 'react-router-dom';
import { Photo, Collection } from '../types';
import confetti from 'canvas-confetti';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

// UI Constants matching the reference design
const ACCENT_COLOR = '#00e676';

const GuestPortal = () => {
  const location = useLocation();
  
  // Link Extraction
  const getLinkId = () => {
      const params = new URLSearchParams(location.search);
      if (params.get('linkId')) return params.get('linkId');
      const match = window.location.href.match(/[?&]linkId=([^&]+)/);
      return match ? match[1] : null;
  };
  const linkId = getLinkId();
  
  // App State
  const [step, setStep] = useState<'capture' | 'form' | 'results'>('capture');
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("");
  
  // Data State
  const [collectionMeta, setCollectionMeta] = useState<Partial<Collection> | null>(null);
  const [selfie, setSelfie] = useState<string | null>(null); // Base64
  const [matches, setMatches] = useState<Photo[]>([]);
  const [formData, setFormData] = useState({ name: '', mobile: '' });
  
  // Gallery State
  const [activeFilter, setActiveFilter] = useState<string>('ALL');
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Refs
  const webcamRef = useRef<Webcam>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
      if (linkId) {
          Api.getPublicCollectionInfo(linkId).then(data => {
             setCollectionMeta(data.collection || data);
          }).catch(console.error);
      }
  }, [linkId]);

  // --- IMAGE COMPRESSION LOGIC (From Reference) ---
  const compressImage = (base64Str: string, maxWidth = 800): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxWidth) {
            width *= maxWidth / height;
            height = maxWidth;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7)); // 70% Quality
      };
    });
  };

  const handleCapture = useCallback(async () => {
    if (webcamRef.current) {
      const imageSrc = webcamRef.current.getScreenshot();
      if (imageSrc) {
        const compressed = await compressImage(imageSrc);
        setSelfie(compressed);
      }
    }
  }, [webcamRef]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onloadend = async () => {
              const rawBase64 = reader.result as string;
              const compressed = await compressImage(rawBase64);
              setSelfie(compressed);
          };
          reader.readAsDataURL(file);
      }
  };

  // --- SEARCH LOGIC ---
  const handleSearch = async () => {
    if (!linkId || !selfie) return alert("Link ID or Selfie missing");
    
    setLoading(true);
    setLoadingText("Scanning faces with AI...");
    
    try {
      const res = await Api.findMatches(linkId, selfie);
      
      let found: Photo[] = [];
      if (Array.isArray(res)) found = res;
      else if (res.matches) found = res.matches;
      else if (res.photos) found = res.photos;
      else if (res.items) found = res.items;

      setMatches(found);
      
      if (found.length > 0) {
        confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, colors: [ACCENT_COLOR, '#ffffff'] });
        setTimeout(() => setStep('form'), 1000);
      } else {
        alert("No photos found. Try a clearer selfie.");
        setSelfie(null);
      }
    } catch (e) {
      alert("Search failed. Link might be expired.");
    } finally {
      setLoading(false);
    }
  };

  // --- UNLOCK / SAVE DETAILS ---
  const handleUnlock = async () => {
    if (!formData.name || formData.mobile.length < 10) return alert("Please enter valid details");
    
    setLoading(true);
    setLoadingText("Unlocking Gallery...");
    
    try {
        await Api.saveGuestDetails({
            linkId,
            name: formData.name,
            mobile: formData.mobile,
            selfie_image: selfie,
            photo_count: matches.length
        });
        setStep('results');
    } catch(e) {
        console.error(e);
        // Proceed anyway if tracking fails
        setStep('results'); 
    } finally {
        setLoading(false);
    }
  };

  // --- FILTERS & DISPLAY LOGIC (From Reference) ---
  const getFilteredPhotos = () => {
    let result = matches;

    // 1. Tag Search
    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        result = result.filter(p => 
            (p.ai_tags || []).some(t => t.toLowerCase().includes(q)) ||
            (p.faces || []).some((f:any) => (f.FaceName || '').toLowerCase().includes(q))
        );
    }

    // 2. Smart Filters
    switch (activeFilter) {
        case 'BEST':
            // High quality or high happy confidence
            return result.filter(p => {
                // @ts-ignore - Assuming emotions/quality_score exist in Photo type based on reference
                const isHappy = (p.emotions || []).some((e:any) => e.Type === 'HAPPY' && e.Confidence > 80);
                // @ts-ignore
                return (p.quality_score > 0.85) || isHappy;
            });
        case 'HAPPY':
            return result.filter(p => 
                // @ts-ignore
                (p.emotions || []).some((e:any) => e.Type === 'HAPPY' && e.Confidence > 60)
            );
        case 'GROUP':
            // @ts-ignore
            return result.filter(p => (p.face_count || (p.faces || []).length) >= 3);
        case 'TEXT':
            // @ts-ignore
            return result.filter(p => (p.detected_text || []).length > 0);
        default:
            return result;
    }
  };

  const filteredMatches = getFilteredPhotos();

  // --- SELECTION & DOWNLOAD ---
  const toggleSelect = (url: string) => {
    const newSet = new Set(selectedPhotos);
    if (newSet.has(url)) newSet.delete(url); else newSet.add(url);
    setSelectedPhotos(newSet);
  };

  const selectAll = () => {
      if (selectedPhotos.size === filteredMatches.length) setSelectedPhotos(new Set());
      else {
          const newSet = new Set<string>();
          filteredMatches.forEach(p => newSet.add(p.url));
          setSelectedPhotos(newSet);
      }
  };

  const handleZipDownload = async () => {
      if (selectedPhotos.size === 0) return alert("Select photos first!");
      
      setLoading(true);
      setLoadingText("Zipping Photos...");
      
      try {
          const zip = new JSZip();
          const folder = zip.folder("EventLens_Photos");
          const urls = Array.from(selectedPhotos);
          
          let count = 0;
          for(const url of urls) {
              const blob = await fetch(url).then(r => r.blob());
              folder?.file(`photo_${count+1}.jpg`, blob);
              count++;
          }
          
          const content = await zip.generateAsync({type:"blob"});
          saveAs(content, "My_Photos.zip");
          alert("Download Started!");
      } catch(e) {
          alert("Download failed.");
      } finally {
          setLoading(false);
      }
  };

  const handleWhatsappShare = () => {
      const text = `🎉 I just found ${matches.length} amazing photos of me from the event using EventLens!`;
      const url = `https://wa.me/?text=${encodeURIComponent(text + " " + window.location.href)}`;
      window.open(url, '_blank');
  };

  // --- RENDER ---
  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans flex flex-col items-center p-4 pb-24">
        
        {/* HEADER */}
        <div className="text-center mb-6 mt-4">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                {collectionMeta?.name || 'EventLens'}
            </h1>
            <p className="text-gray-500 text-sm">AI Powered Photo Finder</p>
        </div>

        {/* --- STEP 1: CAPTURE --- */}
        {step === 'capture' && (
            <div className="w-full max-w-md bg-[#101010] border border-[#262626] rounded-3xl p-6 text-center shadow-2xl animate-slide-up">
                <div className="text-left text-[#a0a0a0] text-sm font-bold uppercase mb-4 tracking-wider">
                    1. Upload Your Selfie
                </div>
                
                {!selfie ? (
                    <div className="space-y-4">
                        {/* Camera UI */}
                        {!loading && (
                            <>
                                <label className="flex flex-col items-center justify-center w-full p-8 bg-[#1a1a1a] border-2 border-dashed border-[#00e676] rounded-2xl cursor-pointer hover:bg-[#252525] transition active:scale-95">
                                    <i className="fas fa-camera text-3xl mb-2 text-white"></i>
                                    <span className="font-bold">Take Selfie</span>
                                    <input type="file" accept="image/*" capture="user" className="hidden" onChange={handleFileUpload} />
                                </label>
                                
                                <div className="text-gray-500 text-xs">- OR -</div>

                                <label className="block text-[#00e676] underline cursor-pointer text-sm">
                                    Upload from Gallery
                                    <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                                </label>
                            </>
                        )}
                    </div>
                ) : (
                    <div className="animate-fade-in">
                        <div className="relative w-36 h-36 mx-auto mb-6">
                            <img 
                                src={selfie} 
                                className="w-full h-full object-cover rounded-full border-4 shadow-[0_0_20px_rgba(0,230,118,0.3)] transition transform hover:scale-105" 
                                style={{ borderColor: ACCENT_COLOR }} 
                            />
                        </div>
                        
                        {loading ? (
                            <div className="text-[#00e676] font-medium animate-pulse">{loadingText}</div>
                        ) : (
                            <div className="space-y-3">
                                <button 
                                    onClick={handleSearch}
                                    className="w-full py-3.5 rounded-full font-bold text-black text-lg transition transform hover:scale-105 hover:shadow-[0_8px_25px_rgba(0,230,118,0.3)]"
                                    style={{ backgroundColor: ACCENT_COLOR }}
                                >
                                    Find My Photos 🔍
                                </button>
                                <button 
                                    onClick={() => setSelfie(null)}
                                    className="w-full py-2 text-gray-400 hover:text-white text-sm"
                                >
                                    Retake Photo
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        )}

        {/* --- STEP 2: FORM --- */}
        {step === 'form' && (
            <div className="w-full max-w-md bg-[#101010] border border-[#262626] rounded-3xl p-6 shadow-2xl animate-slide-up">
                <div className="text-[#a0a0a0] text-sm font-bold uppercase mb-4 tracking-wider">
                    2. Enter Details
                </div>
                
                <p className="mb-6 text-lg">
                    We found <b style={{ color: ACCENT_COLOR }}>{matches.length}</b> photos of you!
                </p>

                <div className="space-y-4">
                    <input 
                        type="text" 
                        placeholder="Your Name (e.g. Rahul)" 
                        value={formData.name}
                        onChange={e => setFormData({...formData, name: e.target.value})}
                        className="w-full p-4 bg-black border border-[#262626] rounded-xl text-white outline-none focus:border-[#00e676] focus:shadow-[0_0_0_2px_rgba(0,230,118,0.15)] transition"
                    />
                    <input 
                        type="tel" 
                        placeholder="Mobile Number" 
                        maxLength={10}
                        value={formData.mobile}
                        onChange={e => setFormData({...formData, mobile: e.target.value})}
                        className="w-full p-4 bg-black border border-[#262626] rounded-xl text-white outline-none focus:border-[#00e676] focus:shadow-[0_0_0_2px_rgba(0,230,118,0.15)] transition"
                    />
                    
                    <button 
                        onClick={handleUnlock}
                        disabled={loading}
                        className="w-full py-4 rounded-full font-bold text-black text-lg mt-4 transition transform hover:scale-102 hover:shadow-[0_8px_25px_rgba(0,230,118,0.3)]"
                        style={{ backgroundColor: ACCENT_COLOR }}
                    >
                        {loading ? 'Saving...' : 'View Gallery 👉'}
                    </button>
                </div>
            </div>
        )}

        {/* --- STEP 3: GALLERY --- */}
        {step === 'results' && (
            <div className="w-full max-w-4xl animate-slide-up">
                
                {/* Search & Filters */}
                <div className="mb-6 space-y-4">
                    <div className="relative">
                        <i className="fas fa-search absolute left-4 top-3.5 text-gray-500"></i>
                        <input 
                            type="text" 
                            placeholder="Search (e.g. 'Red Shirt', 'Stage')..." 
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full py-3 pl-10 pr-4 bg-[#1a1a1a] border-none rounded-full text-white outline-none"
                        />
                    </div>
                    
                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                        {['ALL', 'BEST', 'HAPPY', 'GROUP', 'TEXT'].map(f => (
                            <button
                                key={f}
                                onClick={() => { setActiveFilter(f); setSearchQuery(''); }}
                                className={`px-4 py-2 rounded-full text-xs font-bold border transition whitespace-nowrap ${
                                    activeFilter === f 
                                    ? `bg-[rgba(0,230,118,0.15)] text-[${ACCENT_COLOR}] border-[${ACCENT_COLOR}]` 
                                    : 'bg-[#1a1a1a] border-[#333] text-[#ccc]'
                                }`}
                                style={activeFilter === f ? { borderColor: ACCENT_COLOR, color: ACCENT_COLOR } : {}}
                            >
                                {f === 'ALL' ? 'All Photos' : f === 'BEST' ? '⭐ Best' : f === 'HAPPY' ? '😊 Happy' : f === 'GROUP' ? '👥 Group' : '🅰️ Text'}
                            </button>
                        ))}
                    </div>

                    <div className="flex justify-between items-center px-1">
                        <span className="text-xs text-gray-400">Selected: <b className="text-white">{selectedPhotos.size}</b></span>
                        <div className="flex gap-2">
                            <button onClick={selectAll} className="px-3 py-1.5 border border-[#262626] rounded-lg text-xs text-white hover:bg-white/5">
                                Select All
                            </button>
                            <button 
                                onClick={handleZipDownload}
                                disabled={loading}
                                className="px-3 py-1.5 border-none rounded-lg text-xs text-black font-bold hover:opacity-90 transition"
                                style={{ backgroundColor: ACCENT_COLOR }}
                            >
                                {loading ? 'Zipping...' : 'Download ZIP'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Grid */}
                <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                    {filteredMatches.map((photo, idx) => {
                        const isSelected = selectedPhotos.has(photo.url);
                        return (
                            <div 
                                key={idx} 
                                className={`relative aspect-square bg-[#111] overflow-hidden rounded-lg cursor-pointer group transition transform hover:scale-102 ${isSelected ? 'opacity-80' : ''}`}
                                onClick={() => setLightboxIndex(idx)}
                            >
                                <img src={photo.thumbnail_url || photo.url} className="w-full h-full object-cover" loading="lazy" />
                                
                                {/* Selection Checkbox */}
                                <div 
                                    onClick={(e) => { e.stopPropagation(); toggleSelect(photo.url); }}
                                    className={`absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center border transition ${
                                        isSelected 
                                        ? `bg-[${ACCENT_COLOR}] border-[${ACCENT_COLOR}] text-black` 
                                        : 'bg-black/40 border-white/50 hover:bg-black/60'
                                    }`}
                                    style={isSelected ? { backgroundColor: ACCENT_COLOR, borderColor: ACCENT_COLOR } : {}}
                                >
                                    {isSelected && <i className="fas fa-check text-[10px]"></i>}
                                </div>
                            </div>
                        );
                    })}
                </div>
                
                {filteredMatches.length === 0 && (
                    <div className="text-center py-10 text-gray-500 text-sm">No matching photos found.</div>
                )}

                <button 
                    onClick={handleWhatsappShare} 
                    className="w-full mt-8 py-3 bg-[#25D366] text-white font-bold rounded-full shadow-lg hover:brightness-110 transition"
                >
                    Share on WhatsApp 🎉
                </button>
                
                <button onClick={() => { setStep('capture'); setSelfie(null); }} className="w-full mt-4 text-gray-500 text-sm py-2">
                    Start New Search
                </button>
            </div>
        )}

        {/* Lightbox */}
        {lightboxIndex !== null && (
             <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4 backdrop-blur-sm">
                 <button onClick={() => setLightboxIndex(null)} className="absolute top-4 right-4 text-white text-3xl hover:text-red-500 transition">&times;</button>
                 <img src={filteredMatches[lightboxIndex].url} className="max-w-full max-h-[85vh] rounded object-contain" />
                 
                 <div className="absolute bottom-8 flex gap-4">
                     <button 
                        onClick={() => toggleSelect(filteredMatches[lightboxIndex].url)}
                        className={`px-6 py-2 rounded-full font-bold shadow-xl transition ${
                            selectedPhotos.has(filteredMatches[lightboxIndex].url)
                            ? `bg-[${ACCENT_COLOR}] text-black`
                            : 'bg-white text-black'
                        }`}
                        style={selectedPhotos.has(filteredMatches[lightboxIndex].url) ? { backgroundColor: ACCENT_COLOR } : {}}
                     >
                         {selectedPhotos.has(filteredMatches[lightboxIndex].url) ? 'Selected ✓' : 'Select Photo'}
                     </button>
                 </div>
                 
                 {/* Nav */}
                 <button onClick={() => setLightboxIndex(prev => (prev! > 0 ? prev! - 1 : filteredMatches.length - 1))} className="absolute left-2 text-white text-4xl p-4 opacity-50 hover:opacity-100">&#8249;</button>
                 <button onClick={() => setLightboxIndex(prev => (prev! < filteredMatches.length - 1 ? prev! + 1 : 0))} className="absolute right-2 text-white text-4xl p-4 opacity-50 hover:opacity-100">&#8250;</button>
             </div>
        )}

    </div>
  );
};

export default GuestPortal;