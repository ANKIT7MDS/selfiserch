import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Api } from '../services/api';
import { EventData, Photo, FaceGroup, Lead, Collection } from '../types';

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
        const L = clamp01(bbox.Left); const T = clamp01(bbox.Top);
        const W = clamp01(bbox.Width); const H = clamp01(bbox.Height);
        const zoom = 1 / Math.max(W, H, 0.0001);
        const cx = (L + W/2) * 100; const cy = (T + H/2) * 100;
        style.backgroundSize = `${zoom * 100}% ${zoom * 100}%`;
        style.backgroundPosition = `${cx}% ${cy}%`;
    }
    return style;
};

const SafeImage = ({ src, alt, className }: { src: string, alt: string, className?: string }) => {
    const [error, setError] = useState(false);
    
    // Safely handle empty or string "null"/"undefined"
    if (error || !src || src === 'undefined' || src === 'null' || src === "") {
        return (
            <div className={`${className} bg-gray-800 flex items-center justify-center border border-white/10`}>
                <span className="text-[10px] text-gray-500">No Img</span>
            </div>
        );
    }
    return <img src={src} alt={alt} className={className} onError={() => setError(true)} />;
};

const CollectionManager = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'gallery' | 'events' | 'upload' | 'links' | 'guests' | 'selection' | 'settings'>('gallery');
  
  // Data State
  const [collectionInfo, setCollectionInfo] = useState<Collection | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [events, setEvents] = useState<EventData[]>([]);
  const [faces, setFaces] = useState<FaceGroup[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Settings State
  const [theme, setTheme] = useState({
      primary_color: '#00e676',
      logo_url: '',
      background_image: '',
      header_text_color: '#ffffff'
  });
  
  const [clientSelections, setClientSelections] = useState<Set<string>>(new Set());
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [filterFaceId, setFilterFaceId] = useState<string | null>(null);
  const [filterEventId, setFilterEventId] = useState<string>('All');
  const [isDeleting, setIsDeleting] = useState(false);

  // Upload State
  const [files, setFiles] = useState<File[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState("");
  const [quickUploadLink, setQuickUploadLink] = useState("");

  // Links State
  const [expiryHours, setExpiryHours] = useState(24);
  const [linkPassword, setLinkPassword] = useState("");
  const [generatedLink, setGeneratedLink] = useState("");
  const [selectedLinkEvents, setSelectedLinkEvents] = useState<string[]>([]);
  const [clientLink, setClientLink] = useState("");

  useEffect(() => {
    if (id) {
      loadData();
    }
  }, [id]);

  const loadData = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [evtData, photoData, colData] = await Promise.all([
        Api.getEvents(id),
        Api.getPhotos(id),
        Api.getCollections()
      ]);
      
      setEvents(evtData.events || []);
      const loadedPhotos = photoData.photos || [];
      setPhotos(loadedPhotos);
      
      const currentCol = colData.Items.find(c => c.collection_id === id);
      if(currentCol) {
          setCollectionInfo(currentCol);
          if(currentCol.custom_theme) {
              setTheme({
                  primary_color: currentCol.custom_theme.primary_color || '#00e676',
                  logo_url: currentCol.custom_theme.logo_url || '',
                  background_image: currentCol.custom_theme.background_image || '',
                  header_text_color: currentCol.custom_theme.header_text_color || '#ffffff'
              });
          }
      }
      
      // Face Logic
      const calculatedFaces = buildFacesFromPhotos(loadedPhotos);
      try {
        const savedData = await Api.listPeople(id);
        const savedPeople = savedData.people || [];
        const nameMap = new Map();
        savedPeople.forEach((p: any) => {
             if (p.FaceId) nameMap.set(p.FaceId, p.FaceName);
             if (p.face_id) nameMap.set(p.face_id, p.FaceName || p.name);
        });
        const mergedFaces = calculatedFaces.map(cF => {
            const savedName = nameMap.get(cF.FaceId);
            return { ...cF, FaceName: savedName || cF.FaceName || "Unknown" };
        });
        setFaces(mergedFaces);
      } catch(e) {
          setFaces(calculatedFaces);
      }

      // Lead Logic
      try {
        const leadData = await Api.getLeads(id);
        // Robust filtering for Client Selections vs Regular Guests
        // Using normalized 'name' key thanks to Api.getLeads
        const regularLeads = leadData.filter(l => l.name !== "CLIENT_SELECTION");
        setLeads(regularLeads);
        
        const selectionLead = leadData.find(l => l.name === "CLIENT_SELECTION");
        if(selectionLead && selectionLead.selfie_image) {
            try {
                const ids = JSON.parse(selectionLead.selfie_image);
                setClientSelections(new Set(ids));
            } catch(e) {}
        }
      } catch(e) { console.warn("Lead fetch error", e); }
      
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const buildFacesFromPhotos = (allPhotos: Photo[]): FaceGroup[] => {
      const map = new Map<string, FaceGroup>();
      allPhotos.forEach(photo => {
          const sampleUrl = photo.thumbnail_url || photo.url;
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
      });
      return Array.from(map.values()).sort((a,b) => b.photoCount - a.photoCount);
  };

  const handleNameFace = async (e: React.MouseEvent, faceId: string, currentName: string | undefined) => {
    e.stopPropagation();
    const newName = prompt("Enter Name for this person:", currentName === "Unknown" ? "" : currentName);
    if (newName && id) {
        setFaces(prev => prev.map(f => f.FaceId === faceId ? { ...f, FaceName: newName } : f));
        try {
            await Api.saveFaceName(id, faceId, newName);
        } catch (error) { 
            alert("Failed to save name on server");
            loadData();
        }
    }
  };

  const handleEditEventName = async (eventId: string, oldName: string) => {
      const newName = prompt("Edit Event Name:", oldName);
      if (newName && newName !== oldName && id) {
          try {
              const evt = events.find(e => e.event_id === eventId);
              await Api.upsertEvent(id, newName, evt?.event_date || new Date().toISOString().split('T')[0], eventId);
              loadData();
          } catch(e) { alert("Failed to update name"); }
      }
  };

  const saveSettings = async () => {
      if(!id || !collectionInfo) return;
      try {
          await Api.upsertCollection(collectionInfo.name, id, theme);
          alert("Theme Saved! Your changes are now live.");
      } catch(e) {
          alert("Failed to save settings");
      }
  };

  const handleThemeFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: 'logo_url' | 'background_image') => {
      const file = e.target.files?.[0];
      if (!file || !id) return;
      if (events.length === 0) {
          alert("Please create at least one Event in the Events tab to store theme files.");
          return;
      }
      const storageEventId = events[0].event_id;
      setUploading(true);
      try {
          const { urls } = await Api.generateUploadUrls(id, storageEventId, [{
              name: `theme_${field}_${Date.now()}.jpg`,
              type: file.type
          }]);
          const uploadInfo = urls[0];
          await fetch(uploadInfo.uploadURL, {
              method: 'PUT',
              body: file,
              headers: { 'Content-Type': file.type }
          });
          const cleanUrl = uploadInfo.uploadURL.split('?')[0];
          setTheme(prev => ({ ...prev, [field]: cleanUrl }));
          alert("Image uploaded successfully! Don't forget to click 'Save Customization'.");
      } catch (error) {
          alert("Failed to upload image. Please try again.");
      } finally {
          setUploading(false);
      }
  };

  const getFilteredPhotos = () => {
    let res = photos;
    if (filterFaceId) {
        res = res.filter(p => {
             if(p.faces && p.faces.some((f: any) => (f.FaceId === filterFaceId || f.face_id === filterFaceId))) return true;
             return false;
        });
    }
    if (filterEventId !== 'All') res = res.filter(p => p.event_id === filterEventId);
    return res;
  };
  const displayedPhotos = getFilteredPhotos();

  const togglePhotoSelection = (pid: string) => {
    if (activeTab === 'selection') return;
    const newSet = new Set(selectedPhotos);
    if (newSet.has(pid)) newSet.delete(pid); else newSet.add(pid);
    setSelectedPhotos(newSet);
  };

  const selectAllPhotos = () => {
    if (selectedPhotos.size === displayedPhotos.length) setSelectedPhotos(new Set());
    else setSelectedPhotos(new Set(displayedPhotos.map(p => p.photo_id)));
  };

  const handleDeleteSelectedPhotos = async () => {
      if(!id) return;
      if(selectedPhotos.size === 0) return alert("Select photos to delete");
      if(!confirm(`Are you sure you want to delete ${selectedPhotos.size} photos? This cannot be undone.`)) return;
      setIsDeleting(true);
      try {
          const ids = Array.from(selectedPhotos);
          for (let i = 0; i < ids.length; i++) {
              await Api.deletePhoto(id, ids[i]);
          }
          alert("Photos deleted successfully");
          setSelectedPhotos(new Set());
          loadData();
      } catch(e) {
          alert("Failed to delete some photos.");
      } finally {
          setIsDeleting(false);
      }
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
      await new Promise(r => setTimeout(r, 2000));
      alert("Upload Complete");
      setFiles([]);
      loadData(); 
    } catch (e) {
      setUploadStatus("Error occurred.");
    } finally {
      setUploading(false);
    }
  };
  
  const generateQuickUploadLink = () => {
      if (!selectedEventId) return alert("Please select an event first!");
      const url = `${window.location.origin}/#/quick-upload/${id}?eventId=${selectedEventId}`;
      setQuickUploadLink(url);
  };

  const handleGenerateLink = async () => {
    if (!id || selectedLinkEvents.length === 0) return alert("Select at least one event");
    try {
        const res = await Api.generateLink({ collection_id: id, event_ids: selectedLinkEvents, expiry_hours: expiryHours, password: linkPassword });
        
        // Robust ID Extraction Logic (Handles Query params or Path params)
        let finalId = "";
        if (res && res.searchUrl) {
            const urlStr = res.searchUrl;
            if (urlStr.includes("linkId=")) {
                finalId = urlStr.split("linkId=")[1].split("&")[0];
            } else {
                finalId = urlStr.split("/").pop() || "";
            }
        }
        
        if (!finalId) throw new Error("Could not parse Link ID from response");

        const guestUrl = `${window.location.origin}/#/?linkId=${finalId}`;
        setGeneratedLink(guestUrl);
    } catch (e) { 
        console.error(e);
        alert("Failed to generate link"); 
    }
  };
  
  const generateClientLink = async () => {
       if(!id) return;
       try {
            const allEventIds = events.map(e => e.event_id);
            if(allEventIds.length === 0) return alert("No events to link");
            const res = await Api.generateLink({ collection_id: id, event_ids: allEventIds, expiry_hours: 24 * 30, password: linkPassword }); 
            
            // Robust ID Extraction Logic
            let lid = "";
            if (res && res.searchUrl) {
                const urlStr = res.searchUrl;
                if (urlStr.includes("linkId=")) {
                    lid = urlStr.split("linkId=")[1].split("&")[0];
                } else {
                    lid = urlStr.split("/").pop() || "";
                }
            }

            if (!lid) throw new Error("Could not parse Link ID from response");

            const url = `${window.location.origin}/#/client-select?linkId=${lid}`;
            setClientLink(url);
       } catch(e) { alert("Error generating client link"); }
  };

  // Helper to safely get the image string for rendering
  const getSelfieSrc = (item: Lead) => {
      // API might return 'selfie_image' or 'selfie_b64' or capitalized versions
      // The normalizeItem in Api.ts should handle this, but being extra safe here
      let b64 = item.selfie_b64 || item.selfie_image || (item as any).SelfieImage || "";
      
      if (!b64) return "";
      if (b64.startsWith('http')) return b64;
      if (!b64.startsWith('data:')) b64 = `data:image/jpeg;base64,${b64}`;
      return b64;
  };

  const openSelfieWindow = (src: string) => {
      if(!src) return;
      const w = window.open("");
      if(w) w.document.write(`<html><body style='margin:0;background:black;display:flex;align-items:center;justify-content:center;height:100vh;'><img src="${src}" style="max-width:100%;max-height:100%;object-fit:contain"/></body></html>`);
  }

  const formatBytes = (bytes: number) => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getEventSize = (eventId: string) => {
      const eventPhotos = photos.filter(p => p.event_id === eventId);
      const size = eventPhotos.reduce((acc, curr) => acc + (curr.file_size || 0), 0);
      return formatBytes(size);
  }

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-brand selection:text-black">
      
      {/* HEADER */}
      <div className="sticky top-0 z-50 bg-black/80 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-4">
                <button onClick={() => navigate('/dashboard')} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition">←</button>
                <h1 className="text-xl font-bold tracking-tight">{collectionInfo?.name || 'Collection Manager'}</h1>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-400">
                <span className="hidden md:inline">Total Photos:</span>
                <span className="text-white font-mono">{photos.length}</span>
            </div>
        </div>

        {/* TABS */}
        <div className="max-w-7xl mx-auto px-4">
            <div className="flex gap-1 overflow-x-auto scrollbar-hide pb-2 md:pb-0">
                {[
                  { id: 'gallery', label: 'Gallery', icon: 'fas fa-images' },
                  { id: 'selection', label: 'Client Select', icon: 'fas fa-heart' },
                  { id: 'events', label: 'Events', icon: 'fas fa-calendar' },
                  { id: 'upload', label: 'Upload', icon: 'fas fa-cloud-upload-alt' },
                  { id: 'links', label: 'Links', icon: 'fas fa-link' },
                  { id: 'settings', label: 'Settings', icon: 'fas fa-cog' },
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
                    <span>{tab.id === 'gallery' ? '🖼️' : tab.id === 'selection' ? '❤️' : tab.id === 'events' ? '📅' : tab.id === 'upload' ? '☁️' : tab.id === 'links' ? '🔗' : tab.id === 'settings' ? '⚙️' : '👥'}</span>
                    {tab.label}
                  </button>
                ))}
            </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 md:p-8 animate-fade-in min-h-[80vh]">
        
        {/* GALLERY & SELECTION */}
        {(activeTab === 'gallery' || activeTab === 'selection') && (
            <div className="space-y-6">
                
                {activeTab === 'gallery' && (
                <div className="glass-panel p-4 rounded-2xl overflow-x-auto">
                    <div className="flex gap-4 min-w-max pb-2">
                        <div onClick={() => setFilterFaceId(null)} className={`flex flex-col items-center cursor-pointer transition ${!filterFaceId ? 'opacity-100' : 'opacity-50'}`}>
                            <div className="w-16 h-16 rounded-full border-2 border-dashed border-gray-500 flex items-center justify-center bg-gray-900 mb-1"><span>ALL</span></div>
                            <span className="text-[10px] font-bold">All</span>
                        </div>
                        {faces.map(face => (
                            <div key={face.FaceId} onClick={() => setFilterFaceId(face.FaceId)} className={`flex flex-col items-center group relative cursor-pointer ${filterFaceId === face.FaceId ? 'scale-105' : 'opacity-80 hover:opacity-100'}`}>
                                <div className={`w-16 h-16 rounded-full border-2 shadow-lg mb-1 transition-all ${filterFaceId === face.FaceId ? 'border-brand shadow-brand/20' : 'border-gray-700'}`} style={getFaceStyle(face.thumbnail || face.sampleUrl || "", face.BoundingBox)}></div>
                                <span className="text-[10px] font-bold truncate w-16 text-center">{face.FaceName || 'Unknown'}</span>
                                <button onClick={(e) => handleNameFace(e, face.FaceId, face.FaceName)} className="absolute top-0 right-0 bg-black text-white w-5 h-5 rounded-full text-[10px] border border-gray-700 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">✎</button>
                            </div>
                        ))}
                    </div>
                </div>
                )}

                {activeTab === 'selection' && (
                     <div className="glass-panel p-4 rounded-xl space-y-4 bg-brand/5 border-brand/20">
                         <div className="flex justify-between items-center">
                             <div>
                                 <h2 className="text-xl font-bold text-brand">Client Selection Mode</h2>
                                 <p className="text-sm text-gray-400">Photos selected by client: {clientSelections.size}</p>
                             </div>
                             <div className="flex gap-2">
                                 <input type="text" placeholder="Set Link Password" value={linkPassword} onChange={e => setLinkPassword(e.target.value)} className="bg-black/50 border border-white/20 px-3 py-2 rounded text-sm outline-none" />
                                 <button onClick={generateClientLink} className="bg-white text-black font-bold px-4 py-2 rounded-lg text-sm">Create Link</button>
                             </div>
                         </div>
                         {clientLink && (
                             <div className="bg-black/40 p-3 rounded flex justify-between items-center border border-white/10">
                                 <code className="text-brand text-xs break-all">{clientLink}</code>
                                 <button onClick={() => navigator.clipboard.writeText(clientLink)} className="ml-2 text-xs bg-brand/20 text-brand px-2 py-1 rounded">Copy</button>
                             </div>
                         )}
                     </div>
                )}

                {activeTab === 'gallery' && (
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
                        {selectedPhotos.size > 0 && (
                            <button 
                                onClick={handleDeleteSelectedPhotos} 
                                disabled={isDeleting}
                                className="text-xs bg-red-500/10 text-red-500 px-3 py-1.5 rounded hover:bg-red-500/20 transition disabled:opacity-50"
                            >
                                {isDeleting ? 'Deleting...' : `Delete (${selectedPhotos.size})`}
                            </button>
                        )}
                    </div>
                </div>
                )}

                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2">
                    {displayedPhotos.map(photo => {
                        const isSelected = activeTab === 'selection' ? clientSelections.has(photo.photo_id) : selectedPhotos.has(photo.photo_id);
                        return (
                        <div key={photo.photo_id} onClick={() => togglePhotoSelection(photo.photo_id)} className={`aspect-square relative group bg-gray-900 rounded-lg overflow-hidden cursor-pointer ${isSelected ? (activeTab === 'selection' ? 'ring-2 ring-red-500' : 'ring-2 ring-brand') : ''}`}>
                            <img src={photo.thumbnail_url} loading="lazy" className="w-full h-full object-cover transition duration-500 group-hover:scale-110" alt="img" />
                            {isSelected && (
                                <div className={`absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${activeTab === 'selection' ? 'bg-red-500 text-white' : 'bg-brand text-black'}`}>
                                    {activeTab === 'selection' ? '❤' : '✓'}
                                </div>
                            )}
                        </div>
                    )})}
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
                            <div className="flex items-center gap-2">
                                <h3 className="font-bold">{evt.name}</h3>
                                <button onClick={() => handleEditEventName(evt.event_id, evt.name)} className="text-xs text-gray-500 hover:text-white">✎</button>
                            </div>
                            <p className="text-sm text-gray-500">{evt.event_date} • {evt.photo_count} photos • {getEventSize(evt.event_id)}</p>
                        </div>
                        <button onClick={() => { if(confirm("Delete Event? This will remove all photos in it.")) Api.deleteEvent(id!, evt.event_id).then(loadData); }} className="text-red-500 text-sm hover:underline">Delete</button>
                    </div>
                ))}
            </div>
        )}
        
        {/* GUESTS TAB - IMPROVED DISPLAY */}
        {activeTab === 'guests' && (
             <div className="space-y-4 max-w-5xl mx-auto">
                 <div className="glass-panel p-6 rounded-2xl">
                     <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <span>👥</span> Guest Activity Log
                        </h2>
                        <div className="text-sm text-gray-400">Total Leads: {leads.length}</div>
                     </div>
                     
                     {leads.length === 0 ? (
                         <div className="text-center py-12 text-gray-500 bg-white/5 rounded-xl border border-dashed border-gray-700">
                             <p className="mb-2 text-2xl">📭</p>
                             <p>No guest searches recorded yet.</p>
                             <p className="text-xs mt-2 text-gray-600">Share your Search Link to start getting leads.</p>
                         </div>
                     ) : (
                         <div className="grid gap-3">
                             {leads.map((lead, idx) => {
                                 // Safely Parse Date
                                 let timeString = 'Unknown Time';
                                 try {
                                    if(lead.timestamp) timeString = new Date(lead.timestamp).toLocaleString();
                                 } catch(e) {}

                                 const selfieSrc = getSelfieSrc(lead);
                                 
                                 return (
                                 <div key={idx} className="bg-black/40 border border-white/10 p-4 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:border-brand/30 transition">
                                     <div className="flex items-center gap-4 w-full md:w-auto">
                                         {/* Selfie Avatar */}
                                         <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-900 border border-white/10 shrink-0 relative group cursor-pointer" onClick={() => openSelfieWindow(selfieSrc)}>
                                             <SafeImage src={selfieSrc} alt="Selfie" className="w-full h-full object-cover" />
                                             <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                                                 <span className="text-xs">🔍</span>
                                             </div>
                                         </div>
                                         
                                         {/* Details */}
                                         <div>
                                             <div className="font-bold text-lg text-white flex items-center gap-2">
                                                 {lead.name || 'Anonymous Guest'}
                                                 {!lead.name && <span className="text-xs bg-gray-800 px-2 py-0.5 rounded text-gray-400">Unknown</span>}
                                             </div>
                                             <div className="text-brand font-mono text-sm">{lead.mobile || 'No Mobile'}</div>
                                             <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                                                 <span>🕒</span> {timeString}
                                             </div>
                                         </div>
                                     </div>
                                     
                                     {/* Metrics */}
                                     <div className="flex items-center justify-between w-full md:w-auto gap-6 bg-white/5 p-3 rounded-lg md:bg-transparent md:p-0">
                                         <div className="text-center min-w-[60px]">
                                             <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Found</div>
                                             <div className="font-bold text-xl text-green-400">{lead.match_count || 0}</div>
                                         </div>
                                         <button 
                                            onClick={() => openSelfieWindow(selfieSrc)}
                                            className="px-4 py-2 text-sm border border-white/20 rounded-lg hover:bg-white/10 transition whitespace-nowrap"
                                         >
                                            View Selfie
                                         </button>
                                     </div>
                                 </div>
                             )})}
                         </div>
                     )}
                 </div>
         </div>
        )}

        {/* UPLOAD TAB */}
        {activeTab === 'upload' && (
            <div className="glass-panel p-8 rounded-2xl max-w-2xl mx-auto text-center space-y-8">
                <div>
                     <h2 className="text-2xl font-bold mb-2">Photographer Upload</h2>
                     <p className="text-gray-400 text-sm mb-6">Upload photos directly to your events</p>
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
                <div className="border-t border-white/10 pt-8">
                    <h3 className="text-lg font-bold mb-4">🔗 Shareable Assistant Link</h3>
                    <p className="text-sm text-gray-400 mb-4">Select an event above, then generate a link for your team.</p>
                    
                    {!quickUploadLink ? (
                        <button onClick={generateQuickUploadLink} className={`border border-white/20 text-white font-bold py-2 px-6 rounded-lg hover:bg-white/20 ${!selectedEventId ? 'opacity-50 cursor-not-allowed bg-transparent' : 'bg-white/10'}`} disabled={!selectedEventId}>
                            {selectedEventId ? 'Generate Link' : 'Select Event First'}
                        </button>
                    ) : (
                        <div className="bg-black/50 p-4 rounded-lg flex items-center justify-between border border-brand/30">
                            <code className="text-brand text-xs break-all text-left">{quickUploadLink}</code>
                            <div className="flex gap-2">
                                <button onClick={() => setQuickUploadLink("")} className="ml-2 bg-white/10 text-white px-3 py-1 rounded text-xs">Reset</button>
                                <button onClick={() => navigator.clipboard.writeText(quickUploadLink)} className="ml-2 bg-brand text-black px-3 py-1 rounded text-xs font-bold">Copy</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        )}
        
        {/* LINKS TAB */}
        {activeTab === 'links' && (
            <div className="grid md:grid-cols-2 gap-8 glass-panel p-8 rounded-2xl">
                <div>
                    <h3 className="font-bold mb-4 text-lg">Generate Search Link</h3>
                    {/* Fixed Height Issue Here */}
                    <div className="bg-black/50 border border-white/10 rounded-lg p-3 min-h-[12rem] max-h-96 overflow-y-auto mb-4">
                        {events.length > 0 ? events.map(e => (
                            <label key={e.event_id} className="flex items-center gap-2 p-2 hover:bg-white/5 rounded cursor-pointer border-b border-white/5 last:border-0">
                                <input type="checkbox" checked={selectedLinkEvents.includes(e.event_id)} onChange={ev => {
                                    if(ev.target.checked) setSelectedLinkEvents([...selectedLinkEvents, e.event_id]);
                                    else setSelectedLinkEvents(selectedLinkEvents.filter(x => x !== e.event_id));
                                }} className="accent-brand w-4 h-4" />
                                <span className="text-sm font-medium">{e.name}</span>
                            </label>
                        )) : (
                            <div className="text-sm text-gray-500 p-4 text-center">No events created yet. Go to 'Events' tab to create one.</div>
                        )}
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                        <input type="number" placeholder="Hours" value={expiryHours} onChange={e => setExpiryHours(Number(e.target.value))} className="bg-black border border-white/10 p-2 rounded-lg text-white" />
                        <input type="text" placeholder="PIN" value={linkPassword} onChange={e => setLinkPassword(e.target.value)} className="bg-black border border-white/10 p-2 rounded-lg text-white" />
                    </div>
                    <button onClick={handleGenerateLink} className="w-full bg-white text-black font-bold py-3 rounded-lg hover:bg-gray-200">Generate</button>
                </div>
                <div className="flex flex-col items-center justify-center border-l border-white/10 min-h-[200px] p-4">
                    {generatedLink ? (
                        <div className="text-center w-full animate-fade-in">
                            <div className="text-brand text-5xl mb-4">✓</div>
                            <div className="text-lg font-bold mb-2">Link Ready</div>
                            <div className="bg-black p-4 rounded border border-brand/50 text-brand text-xs break-all font-mono mb-4">{generatedLink}</div>
                            <button onClick={() => navigator.clipboard.writeText(generatedLink)} className="bg-brand text-black font-bold px-6 py-2 rounded-lg shadow-lg">Copy Link</button>
                        </div>
                    ) : (
                        <div className="text-center text-gray-500">
                            <div className="text-4xl mb-2">🔗</div>
                            <div>Select events & click Generate</div>
                        </div>
                    )}
                </div>
            </div>
        )}
        
        {/* SETTINGS TAB */}
        {activeTab === 'settings' && (
            <div className="glass-panel p-8 rounded-2xl max-w-2xl mx-auto">
                <h2 className="text-2xl font-bold mb-6">Customize Branding</h2>
                <div className="space-y-8">
                    {/* Brand Color */}
                    <div>
                        <label className="block text-sm text-gray-400 mb-2">Brand Accent Color</label>
                        <div className="flex gap-4 items-center">
                            <input type="color" value={theme.primary_color} onChange={e => setTheme({...theme, primary_color: e.target.value})} className="h-10 w-20 bg-transparent border-none cursor-pointer" />
                            <input type="text" value={theme.primary_color} onChange={e => setTheme({...theme, primary_color: e.target.value})} className="bg-black border border-white/10 p-2 rounded text-white flex-1" />
                        </div>
                    </div>

                    {/* Logo Section */}
                    <div>
                        <label className="block text-sm text-gray-400 mb-2">Logo</label>
                        <div className="flex flex-col gap-4">
                            {theme.logo_url && (
                                <div className="p-4 bg-white/5 rounded-lg border border-dashed border-gray-600 flex items-center justify-center">
                                    <img src={theme.logo_url} alt="Logo Preview" className="h-16 object-contain" />
                                </div>
                            )}
                            <div className="flex gap-2">
                                <input 
                                    type="text" 
                                    placeholder="https://..." 
                                    value={theme.logo_url} 
                                    onChange={e => setTheme({...theme, logo_url: e.target.value})} 
                                    className="w-full bg-black border border-white/10 p-3 rounded-lg text-white" 
                                />
                                <div className="relative">
                                    <input 
                                        type="file" 
                                        accept="image/*" 
                                        onChange={(e) => handleThemeFileUpload(e, 'logo_url')} 
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                                        disabled={uploading}
                                    />
                                    <button className="bg-white/10 border border-white/20 text-white font-bold h-full px-4 rounded-lg hover:bg-white/20 whitespace-nowrap">
                                        {uploading ? '...' : 'Upload ⬆'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Background Image Section */}
                    <div>
                        <label className="block text-sm text-gray-400 mb-2">Background Image</label>
                        <div className="flex flex-col gap-4">
                            {theme.background_image && (
                                <div className="h-32 w-full bg-cover bg-center rounded-lg border border-dashed border-gray-600 relative" style={{backgroundImage: `url(${theme.background_image})`}}>
                                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-xs text-white">Preview</div>
                                </div>
                            )}
                            <div className="flex gap-2">
                                <input 
                                    type="text" 
                                    placeholder="https://..." 
                                    value={theme.background_image} 
                                    onChange={e => setTheme({...theme, background_image: e.target.value})} 
                                    className="w-full bg-black border border-white/10 p-3 rounded-lg text-white" 
                                />
                                <div className="relative">
                                    <input 
                                        type="file" 
                                        accept="image/*" 
                                        onChange={(e) => handleThemeFileUpload(e, 'background_image')} 
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                                        disabled={uploading}
                                    />
                                    <button className="bg-white/10 border border-white/20 text-white font-bold h-full px-4 rounded-lg hover:bg-white/20 whitespace-nowrap">
                                        {uploading ? '...' : 'Upload ⬆'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <button onClick={saveSettings} className="w-full bg-brand text-black font-bold py-3 rounded-lg hover:brightness-110 mt-4 shadow-[0_0_15px_rgba(0,230,118,0.4)]">
                        Save Customization
                    </button>
                </div>
            </div>
        )}

      </div>
    </div>
  );
};

export default CollectionManager;