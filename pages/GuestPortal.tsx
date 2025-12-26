import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import Webcam from 'react-webcam';
import { Api } from '../services/api';
import { useLocation } from 'react-router-dom';
import { Photo, Collection } from '../types';
import confetti from 'canvas-confetti';
import { Howl } from 'howler';

const GuestPortal = () => {
  const location = useLocation();
  const linkId = new URLSearchParams(location.search).get('linkId');
  
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

  const webcamRef = useRef<Webcam>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
             if(info.custom_theme?.primary_color) {
                 document.documentElement.style.setProperty('--primary', info.custom_theme.primary_color);
             }
          }).catch(err => console.error("Failed to load branding", err));
      }
      // Play initial magic sound
      setTimeout(() => playSound('magic'), 800);
  }, [linkId]);

  // --- HANDLERS ---

  const capture = useCallback(() => {
    if (webcamRef.current) {
      playSound('camera');
      const imageSrc = webcamRef.current.getScreenshot();
      if(imageSrc) {
          setSelfie(imageSrc);
          setShowWebcam(false);
      }
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
    if (!selfie || !linkId) return;
    playSound('magic');
    setLoading(true);
    setScanText("Scanning with AI...");
    
    try {
      const res = await Api.findMatches(linkId, selfie);
      if (res.matches && res.matches.length > 0) {
        setMatches(res.matches);
        playSound('success');
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        
        // Wait a bit for effect before transition
        setTimeout(() => {
            setStep('form');
        }, 1500);
      } else {
        playSound('alert');
        alert("No photos found matching your face. Try again with better lighting.");
        setSelfie(null);
      }
    } catch (e: any) {
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
    <div className="min-h-screen relative pb-20">
        {/* Sound Toggle */}
        <div className="fixed bottom-5 right-5 z-50">
            <button className="sound-btn" onClick={() => { setSoundEnabled(!soundEnabled); if(!soundEnabled) playSound('click'); }}>
                <i className={`fas ${soundEnabled ? 'fa-volume-up' : 'fa-volume-mute'}`}></i>
            </button>
        </div>

        {/* HEADER */}
        <div className="guest-header">
            <div className="logo-float">📸</div>
            <h1 className="text-4xl font-extrabold text-white mb-2 drop-shadow-md">
                {collectionMeta?.name || 'EventLens Pro'}
            </h1>
            <p className="text-white/80 max-w-lg mx-auto font-medium">
                Find all your event photos in seconds with AI-powered face recognition
            </p>
            
            <div className="flex justify-center gap-8 mt-6 flex-wrap">
                <div className="text-center">
                    <span className="text-2xl font-extrabold text-white block">{collectionMeta?.total_photo_count || '1K+'}</span>
                    <span className="text-xs uppercase tracking-wider text-white/70">Photos</span>
                </div>
                <div className="text-center">
                    <span className="text-2xl font-extrabold text-white block">99%</span>
                    <span className="text-xs uppercase tracking-wider text-white/70">Accuracy</span>
                </div>
                <div className="text-center">
                    <span className="text-2xl font-extrabold text-white block">Fast</span>
                    <span className="text-xs uppercase tracking-wider text-white/70">Search</span>
                </div>
            </div>
        </div>

        {/* CONTAINER */}
        <div className="max-w-xl mx-auto px-5 relative z-10">
            
            {/* STEP 1: CAPTURE */}
            {step === 'capture' && (
                <div className="step-card animate-slide-up">
                    <div className="step-badge">1</div>
                    <div className="step-title"><i className="fas fa-camera"></i> Upload Your Selfie</div>
                    
                    {!selfie ? (
                        <>
                            {showWebcam ? (
                                <div className="rounded-xl overflow-hidden border-2 border-primary mb-6 relative bg-black aspect-square">
                                    <Webcam 
                                        audio={false} 
                                        ref={webcamRef} 
                                        screenshotFormat="image/jpeg" 
                                        className="w-full h-full object-cover" 
                                        videoConstraints={{ facingMode: "user" }}
                                    />
                                </div>
                            ) : (
                                <div className="upload-zone" onClick={() => setShowWebcam(true)}>
                                    <div className="camera-pulse">📸</div>
                                    <div className="text-xl font-bold text-white mb-2">Take a Selfie</div>
                                    <div className="text-sm text-gray-400">Tap to open camera</div>
                                </div>
                            )}

                            {showWebcam ? (
                                <div className="flex gap-3">
                                    <button onClick={() => setShowWebcam(false)} className="btn-custom btn-secondary-custom">Cancel</button>
                                    <button onClick={capture} className="btn-custom btn-primary-custom">Take Photo</button>
                                </div>
                            ) : (
                                <>
                                    <div className="text-center text-gray-500 mb-4 text-sm">- OR -</div>
                                    <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleFileUpload} />
                                    <button onClick={() => fileInputRef.current?.click()} className="btn-custom btn-secondary-custom">
                                        <i className="fas fa-image"></i> Choose from Gallery
                                    </button>
                                </>
                            )}
                        </>
                    ) : (
                        <div className="text-center animate-slide-up">
                            <img src={selfie} alt="Preview" className="preview-img mx-auto" />
                            
                            {loading ? (
                                <div className="py-8">
                                    <div className="loader-spinner"></div>
                                    <p className="text-primary font-bold">{scanText}</p>
                                </div>
                            ) : (
                                <>
                                    <button onClick={handleSearch} className="btn-custom btn-primary-custom mb-3">
                                        <i className="fas fa-search"></i> Find My Photos
                                    </button>
                                    <button onClick={() => { setSelfie(null); playSound('click'); }} className="btn-custom btn-secondary-custom">
                                        <i className="fas fa-redo"></i> Retake Photo
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* STEP 2: DETAILS */}
            {step === 'form' && (
                <div className="step-card animate-slide-up">
                    <div className="step-badge">2</div>
                    <div className="step-title"><i className="fas fa-user-circle"></i> Enter Details</div>
                    
                    <div className="text-center mb-6">
                         <div className="ribbon">
                            <i className="fas fa-sparkles"></i> {matches.length} Photos Found!
                         </div>
                    </div>

                    <div className="mb-4">
                        <label className="block text-sm font-bold text-white mb-2">Full Name</label>
                        <input 
                            type="text" 
                            className="input-field-custom" 
                            placeholder="Enter your name"
                            value={formData.name}
                            onChange={e => setFormData({...formData, name: e.target.value})}
                        />
                    </div>

                    <div className="mb-6">
                        <label className="block text-sm font-bold text-white mb-2">Mobile Number</label>
                        <input 
                            type="tel" 
                            className="input-field-custom" 
                            placeholder="10 digit mobile number"
                            maxLength={10}
                            value={formData.mobile}
                            onChange={e => setFormData({...formData, mobile: e.target.value})}
                        />
                    </div>

                    <button onClick={handleUnlock} disabled={loading} className="btn-custom btn-primary-custom">
                        {loading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-images"></i>}
                        {loading ? scanText : 'View My Gallery'}
                    </button>
                </div>
            )}

            {/* STEP 3: GALLERY */}
            {step === 'results' && (
                <div className="step-card animate-slide-up w-full max-w-4xl mx-auto">
                    <div className="step-badge">3</div>
                    <div className="step-title"><i className="fas fa-images"></i> Your Gallery</div>

                    {/* Search */}
                    <div className="relative mb-6">
                        <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
                        <input 
                            type="text" 
                            className="input-field-custom pl-12" 
                            placeholder="Search photos by tags..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    {/* Filters */}
                    <div className="flex gap-3 overflow-x-auto pb-2 mb-6 scrollbar-hide">
                        {allTags.map(tag => (
                            <button 
                                key={tag} 
                                onClick={() => { setActiveFilter(tag); playSound('click'); }}
                                className={`filter-chip ${activeFilter === tag ? 'active' : ''}`}
                            >
                                {tag}
                            </button>
                        ))}
                    </div>

                    {/* Selection Info */}
                    <div className="flex justify-between items-center mb-6 p-4 bg-white/5 rounded-xl border border-border">
                        <div>
                            <span className="text-gray-400">Selected:</span>
                            <span className="font-bold text-accent ml-2 text-xl">{selectedPhotos.size}</span>
                        </div>
                        <button className="btn-custom btn-secondary-custom" style={{width: 'auto', padding: '8px 16px', fontSize: '14px'}} onClick={selectAll}>
                            <i className="fas fa-check-double"></i> Select All
                        </button>
                    </div>

                    {/* Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">
                        {filteredPhotos.map(photo => {
                             const isSelected = selectedPhotos.has(photo.photo_id);
                             return (
                                 <div 
                                    key={photo.photo_id} 
                                    className={`grid-item-custom ${isSelected ? 'selected' : ''}`}
                                    onClick={() => toggleSelection(photo.photo_id)}
                                 >
                                    <img src={photo.thumbnail_url || photo.url} alt="Gallery" loading="lazy" />
                                    <div className="checkmark-custom">✓</div>
                                 </div>
                             );
                        })}
                    </div>

                    {/* Actions */}
                    <button onClick={handleDownload} disabled={loading} className="btn-custom btn-primary-custom mb-4">
                        {loading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-download"></i>}
                        {loading ? scanText : `Download Selected (${selectedPhotos.size})`}
                    </button>

                    <div className="grid grid-cols-2 gap-4">
                        <button className="btn-custom" style={{background: '#25D366', color: 'white'}} onClick={handleShare}>
                            <i className="fab fa-whatsapp"></i> Share
                        </button>
                        <button className="btn-custom" style={{background: 'linear-gradient(45deg, #405DE6, #833AB4, #C13584, #E1306C)', color: 'white'}} onClick={() => alert("Coming soon!")}>
                            <i className="fab fa-instagram"></i> Share
                        </button>
                    </div>
                    
                    <button className="btn-custom btn-secondary-custom mt-4" onClick={() => { 
                        setStep('capture'); 
                        setSelfie(null); 
                        setMatches([]);
                        setFormData({name:'', mobile:''});
                        playSound('celebration');
                        confetti({ particleCount: 150, spread: 100 });
                    }}>
                        <i className="fas fa-party-horn"></i> Celebrate Again
                    </button>

                </div>
            )}
            
            <div className="text-center mt-12 pb-8 border-t border-border pt-6">
                <p className="text-gray-400 text-sm">Powered by <strong className="text-primary">EventLens AI</strong></p>
                <p className="text-gray-500 text-xs mt-2">✨ Find yourself in every moment ✨</p>
            </div>

        </div>
    </div>
  );
};

export default GuestPortal;