import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Api } from '../services/api';
import { EventData, Photo, FaceGroup, Lead } from '../types';

// Helper to calculate CSS for face crop
const getFaceStyle = (url: string, bbox: any) => {
    if (!url) return {};
    
    const style: React.CSSProperties = {
        backgroundImage: `url("${url}")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center',
        backgroundSize: 'cover'
    };

    if (bbox && bbox.Left !== undefined) {
        const clamp01 = (x: any) => Math.max(0, Math.min(1, Number(x) || 0));
        
        const L = clamp01(bbox.Left);
        const T = clamp01(bbox.Top);
        const W = clamp01(bbox.Width);
        const H = clamp01(bbox.Height);

        // Zoom logic
        const zoom = 1 / Math.max(W, H, 0.0001);
        const cx = (L + W/2) * 100;
        const cy = (T + H/2) * 100;

        style.backgroundSize = `${zoom * 100}% ${zoom * 100}%`;
        style.backgroundPosition = `${cx}% ${cy}%`;
    }
    return style;
};

// Safe Image Component to prevent infinite loops
const SafeImage = ({ src, alt, className }: { src: string, alt: string, className?: string }) => {
    const [error, setError] = useState(false);

    if (error || !src || src.includes('undefined')) {
        return (
            <div className={`${className} bg-gray-800 flex items-center justify-center`}>
                <span className="text-xs text-gray-500">No Image</span>
            </div>
        );
    }

    return (
        <img 
            src={src} 
            alt={alt} 
            className={className}
            onError={() => setError(true)}
        />
    );
};

const CollectionManager = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'gallery' | 'events' | 'upload' | 'links' | 'guests'>('gallery');
  
  // Data State
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [events, setEvents] = useState<EventData[]>([]);
  const [faces, setFaces] = useState<FaceGroup[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filtering
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [filterFaceId, setFilterFaceId] = useState<string | null>(null);
  const [filterEventId, setFilterEventId] = useState<string>('All');
  
  // Lead Accordion State
  const [openLeadGroup, setOpenLeadGroup] = useState<string | null>(null);

  // Upload State
  const [files, setFiles] = useState<File[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState("");

  // Links State
  const [expiryHours, setExpiryHours] = useState(24);
  const [linkPassword, setLinkPassword] = useState("");
  const [generatedLink, setGeneratedLink] = useState("");
  const [selectedLinkEvents, setSelectedLinkEvents] = useState<string[]>([]);

  useEffect(() => {
    if (id) {
      loadData();
    }
  }, [id]);

  const loadData = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [evtData, photoData] = await Promise.all([
        Api.getEvents(id),
        Api.getPhotos(id)
      ]);
      setEvents(evtData.events || []);
      const loadedPhotos = photoData.photos || [];
      setPhotos(loadedPhotos);
      
      // Face Handling: Try API -> Fallback to Client Build
      try {
        const faceData = await Api.listPeople(id);
        const apiFaces = faceData.people || [];
        if (apiFaces.length > 0) {
            setFaces(apiFaces);
        } else {
            setFaces(buildFacesFromPhotos(loadedPhotos));
        }
      } catch(e) { 
          setFaces(buildFacesFromPhotos(loadedPhotos));
      }

      // Leads
      try {
        const leadData = await Api.getLeads(id);
        setLeads(leadData || []);
      } catch(e) { console.warn("Lead fetch error", e); }
      
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Ported Client-Side Face Builder
  const buildFacesFromPhotos = (allPhotos: Photo[]): FaceGroup[] => {
      const map = new Map<string, FaceGroup>();
      allPhotos.forEach(photo => {
          const sampleUrl = photo.thumbnail_url || photo.url;
          // Check photo.faces (objects)
          const faceObjs = photo.faces || [];
          faceObjs.forEach((f: any) => {
              const fid = f.FaceId || f.face_id;
              if(!fid) return;
              if(!map.has(fid)) {
                  map.set(fid, { FaceId: fid, FaceName: "Unknown", photoCount: 1, sampleUrl, BoundingBox: f.BoundingBox });
              } else {
                  const existing = map.get(fid)!;
                  existing.photoCount++;
                  if(!existing.BoundingBox && f.BoundingBox) existing.BoundingBox = f.BoundingBox;
              }
          });
          // Check photo.face_ids (strings)
          const faceIds = photo.face_ids || [];
          faceIds.forEach(fid => {
              if(!fid) return;
              if(!map.has(fid)) {
                  map.set(fid, { FaceId: fid, FaceName: "Unknown", photoCount: 1, sampleUrl, BoundingBox: null }); // Box might be missing here
              } else {
                  map.get(fid)!.photoCount++;
              }
          });
      });
      return Array.from(map.values()).sort((a,b) => b.photoCount - a.photoCount);
  };

  const handleNameFace = async (e: React.MouseEvent, faceId: string, currentName: string | undefined) => {
    e.stopPropagation();
    const newName = prompt("Enter Name for this person:", currentName || "");
    if (newName && id) {
        try {
            await Api.saveFaceName(id, faceId, newName);
            setFaces(prev => prev.map(f => f.FaceId === faceId ? { ...f, FaceName: newName } : f));
        } catch (error) { alert("Failed to update name"); }
    }
  };

  const getFilteredPhotos = () => {
    let res = photos;
    if (filterFaceId) {
        res = res.filter(p => {
             if(p.faces && p.faces.some((f: any) => (f.FaceId === filterFaceId || f.face_id === filterFaceId))) return true;
             if(p.face_ids && p.face_ids.includes(filterFaceId)) return true;
             return false;
        });
    }
    if (filterEventId !== 'All') res = res.filter(p => p.event_id === filterEventId);
    return res;
  };
  const displayedPhotos = getFilteredPhotos();

  const togglePhotoSelection = (pid: string) => {
    const newSet = new Set(selectedPhotos);
    if (newSet.has(pid)) newSet.delete(pid); else newSet.add(pid);
    setSelectedPhotos(newSet);
  };

  const selectAllPhotos = () => {
    if (selectedPhotos.size === displayedPhotos.length) setSelectedPhotos(new Set());
    else setSelectedPhotos(new Set(displayedPhotos.map(p => p.photo_id)));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setFiles(Array.from(e.target.files));
  };

  const handleUpload = async () => {
    if (!id || !selectedEventId || files.length === 0) return;
    setUploading(true);
    setProgress(0);
    setUploadStatus("Starting Upload...");
    const BATCH_SIZE = 5;
    const totalFiles = files.length;
    let completedCount = 0;
    try {
      for (let i = 0; i < totalFiles; i += BATCH_SIZE) {
          const batch = files.slice(i, i + BATCH_SIZE);
          setUploadStatus(`Uploading batch ${Math.floor(i / BATCH_SIZE) + 1}...`);
          const filePayload = batch.map(f => ({ name: f.name, type: f.type, size: f.size }));
          const { urls } = await Api.generateUploadUrls(id, selectedEventId, filePayload);
          await Promise.all(batch.map(async (file, idx) => {
            const urlObj = urls[idx];
            if (urlObj && urlObj.uploadURL) {
              await fetch(urlObj.uploadURL, {
                method: 'PUT',
                body: file,
                headers: { 'Content-Type': file.type || 'image/jpeg' }
              });
            }
          }));
          completedCount += batch.length;
          setProgress(Math.round((completedCount / totalFiles) * 100));
      }
      setUploadStatus("Indexing...");
      await new Promise(r => setTimeout(r, 2000)); // Wait for backend trigger
      alert("Upload Complete");
      setFiles([]);
      loadData(); 
    } catch (e) {
      console.error(e);
      setUploadStatus("Error occurred.");
    } finally {
      setUploading(false);
    }
  };

  const handleGenerateLink = async () => {
    if (!id || selectedLinkEvents.length === 0) return alert("Select at least one event");
    try {
        const res = await Api.generateLink({ collection_id: id, event_ids: selectedLinkEvents, expiry_hours: expiryHours, password: linkPassword });
        const guestUrl = `${window.location.origin}/#/?linkId=${res.searchUrl.split('linkId=')[1]}`;
        setGeneratedLink(guestUrl);
    } catch (e) { alert("Failed to generate link"); }
  };

  // Group Leads by Mobile
  const groupedLeads = leads.reduce((acc, lead) => {
      const phone = lead.mobile || "Unknown";
      if (!acc[phone]) acc[phone] = { name: lead.name || "Guest", items: [] };
      acc[phone].items.push(lead);
      return acc;
  }, {} as Record<string, { name: string, items: Lead[] }>);

  // Helper to fix selfie string - Robust against truncated data
  const getSelfieSrc = (item: Lead) => {
      let b64 = item.selfie_b64 || item.selfie_image;
      if (!b64 || b64.length < 100) return ""; // Ignore small/corrupted data
      
      if (!b64.startsWith('data:')) {
          b64 = `data:image/jpeg;base64,${b64}`;
      }
      return b64;
  };

  const openSelfieWindow = (src: string) => {
      const w = window.open("");
      if(w) w.document.write(`<img src="${src}" style="max-width:100%"/>`);
  }

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-brand selection:text-black">
      
      {/* 1. TOP HEADER */}
      <div className="sticky top-0 z-50 bg-black/80 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-4">
                <button onClick={() => navigate('/dashboard')} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition">←</button>
                <h1 className="text-xl font-bold tracking-tight">Collection Manager</h1>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-400">
                <span className="hidden md:inline">Total Photos:</span>
                <span className="text-white font-mono">{photos.length}</span>
            </div>
        </div>

        {/* 2. PREMIUM TABS */}
        <div className="max-w-7xl mx-auto px-4">
            <div className="flex gap-1 overflow-x-auto scrollbar-hide pb-2 md:pb-0">
                {[
                  { id: 'gallery', label: 'Gallery', icon: 'fas fa-images' },
                  { id: 'events', label: 'Events', icon: 'fas fa-calendar' },
                  { id: 'upload', label: 'Upload', icon: 'fas fa-cloud-upload-alt' },
                  { id: 'links', label: 'Links', icon: 'fas fa-link' },
                  { id: 'guests', label: 'Guests', icon: 'fas fa-users' }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex items-center gap-2 px-6 py-3 border-b-2 transition-all duration-300 text-sm font-bold whitespace-nowrap ${
                      activeTab === tab.id 
                      ? 'border-brand text-brand bg-brand/5' 
                      : 'border-transparent text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <span>{tab.id === 'gallery' ? '🖼️' : tab.id === 'events' ? '📅' : tab.id === 'upload' ? '☁️' : tab.id === 'links' ? '🔗' : '👥'}</span>
                    {tab.label}
                    {tab.id === 'guests' && leads.length > 0 && <span className="ml-1 bg-white/10 text-xs px-1.5 rounded">{leads.length}</span>}
                  </button>
                ))}
            </div>
        </div>
      </div>

      {/* 3. MAIN CONTENT */}
      <div className="max-w-7xl mx-auto p-4 md:p-8 animate-fade-in min-h-[80vh]">
        
        {/* GALLERY TAB */}
        {activeTab === 'gallery' && (
            <div className="space-y-6">
                {/* Face Icons Bar */}
                <div className="glass-panel p-4 rounded-2xl overflow-x-auto">
                    <div className="flex gap-4 min-w-max pb-2">
                        <div onClick={() => setFilterFaceId(null)} className={`flex flex-col items-center cursor-pointer transition ${!filterFaceId ? 'opacity-100' : 'opacity-50'}`}>
                            <div className="w-16 h-16 rounded-full border-2 border-dashed border-gray-500 flex items-center justify-center bg-gray-900 mb-1">
                                <span>ALL</span>
                            </div>
                            <span className="text-[10px] font-bold">All Photos</span>
                        </div>
                        
                        {faces.map(face => (
                            <div key={face.FaceId} onClick={() => setFilterFaceId(face.FaceId)} className={`flex flex-col items-center group relative cursor-pointer ${filterFaceId === face.FaceId ? 'scale-105' : 'opacity-80 hover:opacity-100'}`}>
                                <div 
                                    className={`w-16 h-16 rounded-full border-2 shadow-lg mb-1 transition-all ${filterFaceId === face.FaceId ? 'border-brand shadow-brand/20' : 'border-gray-700'}`}
                                    style={getFaceStyle(face.thumbnail || face.sampleUrl || "", face.BoundingBox)}
                                ></div>
                                <span className="text-[10px] font-bold truncate w-16 text-center">{face.FaceName || 'Unknown'}</span>
                                <div className="text-[9px] text-gray-500">{face.photoCount}</div>
                                <button 
                                    onClick={(e) => handleNameFace(e, face.FaceId, face.FaceName)}
                                    className="absolute top-0 right-0 bg-black text-white w-5 h-5 rounded-full text-[10px] border border-gray-700 flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                                >
                                    ✎
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Filters */}
                <div className="flex justify-between items-center glass-panel p-3 rounded-xl">
                    <div className="flex items-center gap-3">
                        <select value={filterEventId} onChange={e => setFilterEventId(e.target.value)} className="bg-black border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:border-brand outline-none">
                            <option value="All">All Events</option>
                            {events.map(e => <option key={e.event_id} value={e.event_id}>{e.name}</option>)}
                        </select>
                        <span className="text-sm text-gray-500">{displayedPhotos.length} photos</span>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={selectAllPhotos} className="text-xs bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded transition">
                            {selectedPhotos.size === displayedPhotos.length ? 'Deselect All' : 'Select All'}
                        </button>
                        {selectedPhotos.size > 0 && <button className="text-xs bg-red-500/10 text-red-500 px-3 py-1.5 rounded">Delete ({selectedPhotos.size})</button>}
                    </div>
                </div>

                {/* Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2">
                    {displayedPhotos.map(photo => (
                        <div key={photo.photo_id} onClick={() => togglePhotoSelection(photo.photo_id)} className={`aspect-square relative group bg-gray-900 rounded-lg overflow-hidden cursor-pointer ${selectedPhotos.has(photo.photo_id) ? 'ring-2 ring-brand' : ''}`}>
                            <img src={photo.thumbnail_url} loading="lazy" className="w-full h-full object-cover transition duration-500 group-hover:scale-110" alt="img" />
                            {selectedPhotos.has(photo.photo_id) && <div className="absolute top-1 right-1 bg-brand text-black w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold">✓</div>}
                        </div>
                    ))}
                </div>
            </div>
        )}

        {/* EVENTS TAB */}
        {activeTab === 'events' && (
            <div className="space-y-4">
                <div className="flex justify-between items-center glass-panel p-4 rounded-xl">
                    <h2 className="text-lg font-bold">Event List</h2>
                    <button onClick={() => {
                        const name = prompt("Name:"); const date = prompt("Date:");
                        if(name && date && id) Api.upsertEvent(id, name, date).then(loadData);
                    }} className="bg-brand text-black text-sm font-bold px-4 py-2 rounded-lg hover:brightness-110">+ Create</button>
                </div>
                {events.map(evt => (
                    <div key={evt.event_id} className="glass-panel p-4 rounded-xl flex justify-between items-center">
                        <div>
                            <h3 className="font-bold">{evt.name}</h3>
                            <p className="text-sm text-gray-500">{evt.event_date} • {evt.photo_count} photos</p>
                        </div>
                        <button onClick={() => { if(confirm("Delete?")) Api.deleteEvent(id!, evt.event_id).then(loadData); }} className="text-red-500 text-sm hover:underline">Delete</button>
                    </div>
                ))}
            </div>
        )}

        {/* UPLOAD TAB */}
        {activeTab === 'upload' && (
            <div className="glass-panel p-8 rounded-2xl max-w-2xl mx-auto text-center">
                <h2 className="text-2xl font-bold mb-6">Batch Upload</h2>
                <select value={selectedEventId} onChange={e => setSelectedEventId(e.target.value)} className="w-full bg-black border border-white/10 p-3 rounded-lg mb-4 focus:border-brand outline-none">
                    <option value="">Select Event...</option>
                    {events.map(e => <option key={e.event_id} value={e.event_id}>{e.name}</option>)}
                </select>
                <div className={`border-2 border-dashed rounded-xl p-10 transition ${files.length > 0 ? 'border-brand bg-brand/5' : 'border-gray-700 hover:border-gray-500'}`}>
                    <input type="file" multiple accept="image/*" onChange={handleFileSelect} className="hidden" id="fup" />
                    <label htmlFor="fup" className="cursor-pointer block">
                        <div className="text-4xl mb-2">☁️</div>
                        <div className="font-bold">Click to Select Photos</div>
                        <div className="text-sm text-gray-500 mt-2">{files.length} selected</div>
                    </label>
                </div>
                {files.length > 0 && !uploading && (
                    <button onClick={handleUpload} className="w-full bg-brand text-black font-bold py-3 rounded-lg mt-6 hover:brightness-110">Start Upload</button>
                )}
                {uploading && (
                    <div className="mt-6">
                        <div className="text-brand font-mono text-sm mb-2">{uploadStatus}</div>
                        <div className="h-2 bg-gray-800 rounded-full overflow-hidden"><div className="h-full bg-brand transition-all duration-300" style={{width: `${progress}%`}}></div></div>
                    </div>
                )}
            </div>
        )}

        {/* LINKS TAB */}
        {activeTab === 'links' && (
            <div className="grid md:grid-cols-2 gap-8 glass-panel p-8 rounded-2xl">
                <div>
                    <h3 className="font-bold mb-4 text-lg">Generate Search Link</h3>
                    <div className="bg-black/50 border border-white/10 rounded-lg p-3 h-48 overflow-y-auto mb-4">
                        {events.map(e => (
                            <label key={e.event_id} className="flex items-center gap-2 p-2 hover:bg-white/5 rounded cursor-pointer">
                                <input type="checkbox" checked={selectedLinkEvents.includes(e.event_id)} onChange={ev => {
                                    if(ev.target.checked) setSelectedLinkEvents([...selectedLinkEvents, e.event_id]);
                                    else setSelectedLinkEvents(selectedLinkEvents.filter(x => x !== e.event_id));
                                }} className="accent-brand" />
                                <span className="text-sm">{e.name}</span>
                            </label>
                        ))}
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                        <input type="number" placeholder="Hours" value={expiryHours} onChange={e => setExpiryHours(Number(e.target.value))} className="bg-black border border-white/10 p-2 rounded-lg" />
                        <input type="text" placeholder="PIN" value={linkPassword} onChange={e => setLinkPassword(e.target.value)} className="bg-black border border-white/10 p-2 rounded-lg" />
                    </div>
                    <button onClick={handleGenerateLink} className="w-full bg-white text-black font-bold py-3 rounded-lg hover:bg-gray-200">Generate</button>
                </div>
                <div className="flex flex-col items-center justify-center border-l border-white/10">
                    {generatedLink ? (
                        <div className="text-center w-full">
                            <div className="text-brand text-5xl mb-4">✓</div>
                            <div className="bg-black p-3 rounded border border-brand/50 text-brand text-xs break-all font-mono mb-4">{generatedLink}</div>
                            <button onClick={() => navigator.clipboard.writeText(generatedLink)} className="bg-brand text-black font-bold px-6 py-2 rounded-lg">Copy Link</button>
                        </div>
                    ) : <div className="text-gray-500">Select events to start</div>}
                </div>
            </div>
        )}

        {/* GUESTS TAB (LEADS) */}
        {activeTab === 'guests' && (
            <div className="space-y-4 max-w-4xl mx-auto">
                {Object.entries(groupedLeads).map(([mobile, group], idx) => (
                    <div key={mobile} className="glass-panel rounded-xl overflow-hidden border border-white/5">
                        {/* Header */}
                        <div 
                            onClick={() => setOpenLeadGroup(openLeadGroup === mobile ? null : mobile)}
                            className="p-4 flex items-center justify-between cursor-pointer hover:bg-white/5 transition"
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-brand/50 bg-black">
                                    {/* USE SAFE IMAGE HERE */}
                                    <SafeImage 
                                        src={getSelfieSrc(group.items[0])} 
                                        alt="Selfie"
                                        className="w-full h-full object-cover"
                                    />
                                </div>
                                <div>
                                    <h3 className="font-bold text-lg">{group.name}</h3>
                                    <div className="text-brand font-mono text-sm">{mobile}</div>
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <span className="bg-white/10 px-3 py-1 rounded-full text-xs font-bold">{group.items.length} Sessions</span>
                                <span className={`transform transition ${openLeadGroup === mobile ? 'rotate-180' : ''}`}>▼</span>
                            </div>
                        </div>

                        {/* Expandable Body */}
                        {openLeadGroup === mobile && (
                            <div className="bg-black/40 border-t border-white/10 p-4 space-y-3">
                                {group.items.map((item, i) => (
                                    <div key={i} className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/5">
                                        <div className="flex items-center gap-4">
                                            {/* USE SAFE IMAGE HERE */}
                                            <div className="w-10 h-10 rounded overflow-hidden bg-black border border-white/10">
                                                <SafeImage 
                                                    src={getSelfieSrc(item)} 
                                                    alt="Selfie"
                                                    className="w-full h-full object-cover"
                                                />
                                            </div>
                                            <div className="text-sm">
                                                <div className="text-gray-400">Time: <span className="text-white">{new Date(item.timestamp).toLocaleString()}</span></div>
                                                <div className="text-green-400 font-bold">{item.match_count} Photos Found</div>
                                            </div>
                                        </div>
                                        <button className="text-xs border border-white/20 px-3 py-1 rounded hover:bg-white/10" onClick={() => openSelfieWindow(getSelfieSrc(item))}>View Selfie</button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
                {Object.keys(groupedLeads).length === 0 && <div className="text-center py-20 text-gray-500">No guest leads yet.</div>}
            </div>
        )}

      </div>
    </div>
  );
};

export default CollectionManager;