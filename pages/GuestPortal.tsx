import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import Webcam from 'react-webcam';
import { Api } from '../services/api';
import { useLocation } from 'react-router-dom';
import { Photo, Collection } from '../types';
import confetti from 'canvas-confetti';
import { Howl } from 'howler';

const GuestPortal = () => {
  const location = useLocation();
  
  // ROBUST LINK ID EXTRACTION
  // Handles both /?linkId=123 and /#/guest?linkId=123 formats
  const getLinkId = () => {
      const params = new URLSearchParams(location.search);
      if (params.get('linkId')) return params.get('linkId');
      
      // Fallback: Check full URL string for regex match
      const match = window.location.href.match(/[?&]linkId=([^&]+)/);
      return match ? match[1] : null;
  };

  const linkId = getLinkId();
  
  // App Flow State
  const [step, setStep] = useState<'capture' | 'form' | 'results'>('capture');
  const [loading, setLoading] = useState(false);
  const [scanText, setScanText] = useState("Scanning with AI");
  
  // Data State
  const [collectionMeta, setCollectionMeta] = useState<Partial<Collection> | null>(null);
  const [selfie, setSelfie] = useState<string | null>(null);
  const [matches, setMatches] = useState<Photo[]>([]);
  const [formData, setFormData] = useState({ name: '', mobile: '' });
  
  // UI State
  const [activeFilter, setActiveFilter] = useState<string>('All');
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [showWebcam, setShowWebcam] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [flash, setFlash] = useState(false);

  const webcamRef = useRef<Webcam>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Dynamic Branding Color (Default to Green if not set)
  const primaryColor = collectionMeta?.custom_theme?.primary_color || '#00e676';

  // --- SOUNDS ---
  const sounds = useMemo(() => ({
      click: new Howl({ src: ['https://assets.mixkit.co/sfx/preview/mixkit-select-click-1109.mp3'], volume: 0.4 }),
      camera: new Howl({ src: ['https://assets.mixkit.co/sfx/preview/mixkit-camera-shutter-click-1133.mp3'], volume: 0.6 }),
      success: new Howl({ src: ['https://assets.mixkit.co/sfx/preview/mixkit-winning-chimes-2015.mp3'], volume: 0.5 }),
      magic: new Howl({ src: ['https://assets.mixkit.co/sfx/preview/mixkit-magic-sparkles-300.mp3'], volume: 0.5 }),
      celebration: new Howl({ src: ['https://assets.mixkit.co/sfx/preview/mixkit-party-horn-sound-2927.mp3'], volume: 0.4 }),
      alert: new Howl({ src: ['https://assets.mixkit.co/sfx/preview/mixkit-correct-answer-tone-2870.mp3'], volume: 0.5 })
  }), []);

  const playSound = (name: keyof typeof sounds) => {
      if (soundEnabled) sounds[name].play();
  };

  // --- INITIALIZATION ---
  useEffect(() => {
      if (linkId) {
          Api.getPublicCollectionInfo(linkId).then(data => {
             const info = data.collection || data;
             setCollectionMeta(info);
          }).catch(err => console.error("Failed to load branding", err));
      }
      // Play initial magic sound
      setTimeout(() => playSound('magic'), 800);
  }, [linkId]);

  // --- HANDLERS ---

  const capture = useCallback(() => {
    if (webcamRef.current) {
      playSound('camera');
      setFlash(true);
      const imageSrc = webcamRef.current.getScreenshot();
      
      setTimeout(() => {
          setFlash(false);
          if(imageSrc) {
              setSelfie(imageSrc);
              setShowWebcam(false);
          }
      }, 150);
    }
  }, [webcamRef, soundEnabled]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          playSound('camera');
          const reader = new FileReader();
          reader.onloadend = () => setSelfie(reader.result as string);
          reader.readAsDataURL(file);
      }
  };

  const handleSearch = async () => {
    console.log("Handle search clicked. LinkID:", linkId, "Has Selfie:", !!selfie);
    
    if (!linkId) {
        playSound('alert');
        return alert("Error: Link ID is missing. Please check your URL.");
    }
    if (!selfie) {
        playSound('alert');
        return alert("Please take a selfie or upload a photo first.");
    }

    playSound('magic');
    setLoading(true);
    setScanText("AI Processing...");
    
    try {
      const res = await Api.findMatches(linkId, selfie);
      console.log("Search response:", res);
      
      // FIX: Robustly determine matches. 
      // API might return an array directly OR an object { matches: [...] } OR { photos: [...] }
      let foundMatches: Photo[] = [];
      
      if (Array.isArray(res)) {
          foundMatches = res;
      } else if (res.matches && Array.isArray(res.matches)) {
          foundMatches = res.matches;
      } else if (res.photos && Array.isArray(res.photos)) {
          foundMatches = res.photos;
      } else if (res.items && Array.isArray(res.items)) {
          foundMatches = res.items;
      }
      
      if (foundMatches.length > 0) {
        setMatches(foundMatches);
        playSound('success');
        confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, colors: [primaryColor, '#ffffff'] });
        
        // Wait a bit for effect before transition
        setTimeout(() => {
            setStep('form');
        }, 800); // Reduced delay for snappier feel
      } else {
        playSound('alert');
        alert("No photos found matching your face. Try again with better lighting.");
        setSelfie(null);
      }
    } catch (e: any) {
      console.error("Search error", e);
      playSound('alert');
      alert("Search failed. Link might be expired.");
    } finally {
      setLoading(false);
    }
  };

  const handleUnlock = async () => {
    if (!formData.name || !formData.mobile || formData.mobile.length < 10) {
        playSound('alert');
        return alert("Please enter valid name and 10-digit mobile.");
    }
    playSound('click');
    setLoading(true);
    setScanText("Unlocking Gallery...");
    
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
      playSound('click');
      const newSet = new Set(selectedPhotos);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      setSelectedPhotos(newSet);
  };

  const selectAll = () => {
      playSound('click');
      if (selectedPhotos.size === matches.length) setSelectedPhotos(new Set());
      else setSelectedPhotos(new Set(matches.map(p => p.photo_id)));
  };

  const handleDownload = () => {
    if(selectedPhotos.size === 0) {
        playSound('alert');
        return alert("Select photos first!");
    }
    playSound('success');
    const photosToDownload = matches.filter(p => selectedPhotos.has(p.photo_id));
    
    // Simulate download delay
    setLoading(true);
    setScanText("Preparing Download...");
    
    setTimeout(() => {
        photosToDownload.forEach(p => {
            const link = document.createElement('a');
            link.href = p.url;
            link.download = `Photo_${p.photo_id}.jpg`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
        setLoading(false);
        alert(`✅ Downloaded ${photosToDownload.length} photos!`);
    }, 1500);
  };

  const handleShare = () => {
      playSound('click');
      const text = `🎉 I found ${matches.length} amazing photos at ${collectionMeta?.name || 'the event'}! Check them out:`;
      const url = `https://wa.me/?text=${encodeURIComponent(text + " " + window.location.href)}`;
      window.open(url, '_blank');
  };

  // --- RENDERING ---
  const allTags = ['All', ...Array.from(new Set(matches.flatMap(p => p.ai_tags || [])))];
  
  const filteredPhotos = matches.filter(p => {
      const matchesFilter = activeFilter === 'All' || p.ai_tags?.includes(activeFilter);
      const matchesSearch = searchQuery === '' || p.ai_tags?.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesFilter && matchesSearch;
  });

  return (
    <div className="min-h-screen relative pb-20 bg-[#0a0a0f] text-white font-sans selection:bg-brand selection:text-black">
        {/* Dynamic Background */}
        <div 
          className="fixed inset-0 opacity-20 pointer-events-none" 
          style={{ background: `radial-gradient(circle at 50% 10%, ${primaryColor} 0%, transparent 40%)` }} 
        />
        
        {/* Flash Effect */}
        {flash && <div className="fixed inset-0 bg-white z-[100] animate-fade-out pointer-events-none" />}

        {/* Sound Toggle */}
        <div className="fixed bottom-5 right-5 z-50">
            <button 
                className="w-10 h-10 rounded-full bg-white/10 backdrop-blur border border-white/20 flex items-center justify-center hover:bg-white/20 transition" 
                onClick={() => { setSoundEnabled(!soundEnabled); if(!soundEnabled) playSound('click'); }}
            >
                <i className={`fas ${soundEnabled ? 'fa-volume-up' : 'fa-volume-mute'}`}></i>
            </button>
        </div>

        {/* HEADER */}
        <div className="relative pt-10 pb-6 text-center z-10">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-white/10 to-transparent border border-white/10 mb-4 shadow-2xl backdrop-blur-md">
                <i className="fas fa-camera text-2xl" style={{color: primaryColor}}></i>
            </div>
            <h1 className="text-3xl md:text-5xl font-black mb-2 tracking-tight drop-shadow-lg">
                {collectionMeta?.name || 'EventLens Pro'}
            </h1>
            <p className="text-gray-400 max-w-lg mx-auto font-medium text-sm md:text-base px-4">
                AI-Powered Face Recognition Gallery
            </p>
            
            {step === 'capture' && (
                <div className="flex justify-center gap-8 mt-6 flex-wrap animate-fade-in">
                    <div className="text-center">
                        <span className="text-xl font-bold text-white block">{collectionMeta?.total_photo_count || '1K+'}</span>
                        <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Photos</span>
                    </div>
                    <div className="text-center">
                        <span className="text-xl font-bold text-white block">AI</span>
                        <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Powered</span>
                    </div>
                </div>
            )}
        </div>

        {/* CONTAINER */}
        <div className="max-w-xl mx-auto px-5 relative z-10">
            
            {/* STEP 1: CAPTURE */}
            {step === 'capture' && (
                <div className="animate-slide-up bg-[#111] border border-white/10 p-6 rounded-3xl shadow-2xl relative overflow-hidden group">
                    {/* Decorative glow */}
                    <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/5 rounded-full blur-2xl group-hover:bg-white/10 transition"></div>
                    
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-xs border border-white/10">1</span>
                            Find Your Photos
                        </h2>
                    </div>
                    
                    {!selfie ? (
                        <>
                            {showWebcam ? (
                                <div className="rounded-2xl overflow-hidden border-2 shadow-2xl relative bg-black aspect-[3/4] mb-6" style={{ borderColor: primaryColor }}>
                                    <Webcam 
                                        audio={false} 
                                        ref={webcamRef} 
                                        screenshotFormat="image/jpeg" 
                                        className="w-full h-full object-cover transform scale-x-[-1]" // Mirror effect
                                        videoConstraints={{ facingMode: "user" }}
                                    />
                                    {/* Face Guide Overlay */}
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                        <div className="w-48 h-64 border-2 border-dashed border-white/50 rounded-[40%]"></div>
                                        <div className="absolute bottom-4 bg-black/60 px-3 py-1 rounded-full text-xs text-white backdrop-blur-md">
                                            Position face in oval
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div 
                                    className="border-2 border-dashed border-white/20 rounded-2xl p-10 text-center cursor-pointer hover:bg-white/5 hover:border-white/40 transition mb-6 group-hover:scale-[1.01] duration-300"
                                    onClick={() => setShowWebcam(true)}
                                >
                                    <div className="w-16 h-16 rounded-full bg-white/5 mx-auto flex items-center justify-center mb-4 group-hover:bg-white/10 transition">
                                        <i className="fas fa-camera text-2xl text-gray-400 group-hover:text-white transition"></i>
                                    </div>
                                    <div className="text-xl font-bold text-white mb-2">Take a Selfie</div>
                                    <div className="text-sm text-gray-400">Tap to identify yourself via AI</div>
                                </div>
                            )}

                            {showWebcam ? (
                                <div className="grid grid-cols-2 gap-3">
                                    <button 
                                        onClick={() => setShowWebcam(false)} 
                                        className="py-3 rounded-xl font-bold bg-white/10 hover:bg-white/20 transition text-white"
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        onClick={capture} 
                                        className="py-3 rounded-xl font-bold text-black shadow-lg hover:brightness-110 transition active:scale-95"
                                        style={{ backgroundColor: primaryColor }}
                                    >
                                        <i className="fas fa-camera mr-2"></i> Capture
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <div className="relative text-center my-4">
                                        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10"></div></div>
                                        <span className="relative bg-[#111] px-4 text-xs text-gray-500 font-bold uppercase">Or upload</span>
                                    </div>
                                    <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleFileUpload} />
                                    <button 
                                        onClick={() => fileInputRef.current?.click()} 
                                        className="w-full py-3 rounded-xl font-bold bg-white/5 border border-white/10 hover:bg-white/10 transition text-gray-300 flex items-center justify-center gap-2"
                                    >
                                        <i className="fas fa-image"></i> Upload from Gallery
                                    </button>
                                </>
                            )}
                        </>
                    ) : (
                        <div className="text-center animate-fade-in">
                            <div className="relative w-48 h-64 mx-auto mb-6">
                                <img src={selfie} alt="Preview" className="w-full h-full object-cover rounded-2xl border-2 shadow-lg transform scale-x-[-1]" style={{ borderColor: primaryColor }} />
                                {loading && (
                                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center">
                                        <div className="w-10 h-10 border-4 border-t-transparent rounded-full animate-spin mb-3" style={{ borderColor: `${primaryColor} transparent transparent transparent` }}></div>
                                        <p className="text-white text-xs font-bold animate-pulse">{scanText}</p>
                                    </div>
                                )}
                            </div>
                            
                            {!loading && (
                                <div className="space-y-3">
                                    <button 
                                        onClick={handleSearch} 
                                        className="w-full py-4 rounded-xl font-bold text-black shadow-lg hover:brightness-110 transition flex items-center justify-center gap-2 text-lg active:scale-95"
                                        style={{ backgroundColor: primaryColor }}
                                    >
                                        <i className="fas fa-search"></i> Find My Photos
                                    </button>
                                    <button 
                                        onClick={() => { setSelfie(null); playSound('click'); }} 
                                        className="w-full py-3 rounded-xl font-bold bg-white/5 hover:bg-white/10 transition text-gray-400 text-sm"
                                    >
                                        Retake Photo
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* STEP 2: DETAILS */}
            {step === 'form' && (
                <div className="animate-slide-up bg-[#111] border border-white/10 p-6 rounded-3xl shadow-2xl relative">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gray-800">
                        <div className="h-full w-1/2 transition-all duration-500" style={{ backgroundColor: primaryColor }}></div>
                    </div>
                    
                    <div className="text-center mb-8 pt-4">
                         <div className="inline-block px-4 py-2 rounded-full bg-white/10 border border-white/10 mb-4 animate-bounce">
                            <span style={{ color: primaryColor }}><i className="fas fa-sparkles"></i> {matches.length} Photos Found!</span>
                         </div>
                         <h2 className="text-2xl font-bold text-white">Unlock Gallery</h2>
                         <p className="text-gray-400 text-sm">Enter your details to view your photos</p>
                    </div>

                    <div className="space-y-5">
                        <div className="group">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1 ml-1 group-focus-within:text-white transition-colors">Full Name</label>
                            <input 
                                type="text" 
                                className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-white outline-none focus:border-opacity-100 transition-all placeholder:text-gray-700"
                                placeholder="e.g. Rahul Kumar"
                                value={formData.name}
                                onChange={e => setFormData({...formData, name: e.target.value})}
                                style={{ borderColor: formData.name ? primaryColor : 'rgba(255,255,255,0.1)' }}
                            />
                        </div>

                        <div className="group">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1 ml-1 group-focus-within:text-white transition-colors">Mobile Number</label>
                            <input 
                                type="tel" 
                                className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-white outline-none focus:border-opacity-100 transition-all placeholder:text-gray-700"
                                placeholder="10 digit number"
                                maxLength={10}
                                value={formData.mobile}
                                onChange={e => setFormData({...formData, mobile: e.target.value})}
                                style={{ borderColor: formData.mobile.length === 10 ? primaryColor : 'rgba(255,255,255,0.1)' }}
                            />
                        </div>
                    </div>

                    <button 
                        onClick={handleUnlock} 
                        disabled={loading} 
                        className="w-full mt-8 py-4 rounded-xl font-bold text-black shadow-lg hover:brightness-110 transition flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{ backgroundColor: primaryColor }}
                    >
                        {loading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-lock-open"></i>}
                        {loading ? scanText : 'View My Gallery'}
                    </button>
                    
                    <button onClick={() => setStep('capture')} className="w-full mt-4 text-gray-500 text-sm hover:text-white transition">
                        Cancel
                    </button>
                </div>
            )}

            {/* STEP 3: GALLERY */}
            {step === 'results' && (
                <div className="animate-slide-up w-full max-w-4xl mx-auto -mt-4">
                    {/* Toolbar */}
                    <div className="bg-[#16161a] border border-white/10 p-4 rounded-2xl mb-6 sticky top-4 z-30 shadow-2xl backdrop-blur-md bg-opacity-90">
                        <div className="flex gap-2 mb-4">
                            <div className="relative flex-1">
                                <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-500"></i>
                                <input 
                                    type="text" 
                                    className="w-full bg-black border border-white/10 rounded-lg py-2 pl-10 pr-4 text-sm text-white focus:border-white/30 outline-none transition" 
                                    placeholder="Search tags..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                            <button 
                                onClick={selectAll}
                                className="px-4 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-bold text-gray-300 transition whitespace-nowrap"
                            >
                                {selectedPhotos.size === matches.length ? 'Unselect' : 'Select All'}
                            </button>
                        </div>

                        {/* Filters */}
                        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                            {allTags.map(tag => (
                                <button 
                                    key={tag} 
                                    onClick={() => { setActiveFilter(tag); playSound('click'); }}
                                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition whitespace-nowrap ${activeFilter === tag ? 'text-black' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}
                                    style={activeFilter === tag ? { backgroundColor: primaryColor } : {}}
                                >
                                    {tag}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-24">
                        {filteredPhotos.map((photo, idx) => {
                             const isSelected = selectedPhotos.has(photo.photo_id);
                             return (
                                 <div 
                                    key={photo.photo_id} 
                                    className="relative aspect-square rounded-xl overflow-hidden cursor-pointer group bg-gray-900 animate-fade-in"
                                    style={{ animationDelay: `${idx * 50}ms` }}
                                    onClick={() => toggleSelection(photo.photo_id)}
                                 >
                                    <img 
                                        src={photo.thumbnail_url || photo.url} 
                                        alt="Gallery" 
                                        loading="lazy" 
                                        className={`w-full h-full object-cover transition duration-300 ${isSelected ? 'scale-90 opacity-60' : 'group-hover:scale-105'}`}
                                    />
                                    
                                    {/* Selection Overlay */}
                                    <div className={`absolute inset-0 border-4 transition-all duration-200 pointer-events-none ${isSelected ? 'opacity-100' : 'opacity-0'}`} style={{ borderColor: primaryColor }}></div>
                                    
                                    <div className={`absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center transition-all shadow-md ${isSelected ? 'scale-100' : 'scale-0 group-hover:scale-100 bg-black/50 border border-white/30'}`} style={isSelected ? { backgroundColor: primaryColor } : {}}>
                                        {isSelected && <i className="fas fa-check text-black text-xs"></i>}
                                    </div>
                                 </div>
                             );
                        })}
                    </div>

                    {/* Floating Action Bar */}
                    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-md bg-[#16161a]/90 backdrop-blur-xl border border-white/10 p-4 rounded-2xl shadow-2xl z-40 flex items-center justify-between gap-3 animate-slide-up">
                        <div className="flex flex-col">
                            <span className="text-xs text-gray-400 font-bold uppercase">Selected</span>
                            <span className="text-xl font-bold text-white leading-none">{selectedPhotos.size}</span>
                        </div>
                        
                        <div className="flex gap-2">
                            <button 
                                onClick={handleShare}
                                className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-white hover:bg-white/10 transition"
                            >
                                <i className="fab fa-whatsapp"></i>
                            </button>
                            <button 
                                onClick={handleDownload}
                                disabled={loading}
                                className="px-6 h-10 rounded-xl font-bold text-black flex items-center gap-2 hover:brightness-110 transition disabled:opacity-50"
                                style={{ backgroundColor: primaryColor }}
                            >
                                {loading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-download"></i>}
                                <span>Download</span>
                            </button>
                        </div>
                    </div>
                    
                    <div className="text-center pb-8 pt-6">
                        <button className="text-gray-500 text-sm hover:text-white transition flex items-center justify-center gap-2 mx-auto" onClick={() => { 
                            setStep('capture'); 
                            setSelfie(null); 
                            setMatches([]);
                            setFormData({name:'', mobile:''});
                            playSound('celebration');
                            confetti({ particleCount: 150, spread: 100 });
                        }}>
                            <i className="fas fa-undo"></i> Start New Search
                        </button>
                    </div>

                </div>
            )}
            
            <div className="text-center mt-12 pb-8 pt-6 opacity-30">
                <p className="text-gray-400 text-[10px] uppercase tracking-widest">Powered by EventLens AI</p>
            </div>

        </div>
    </div>
  );
};

export default GuestPortal;