import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Api } from '../services/api';
import { EventData, Photo, FaceGroup, Lead, Collection } from '../types';

const CollectionManager = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'gallery' | 'events' | 'upload' | 'guests' | 'links' | 'settings'>('gallery');
  
  // Data State
  const [collectionInfo, setCollectionInfo] = useState<Collection | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [events, setEvents] = useState<EventData[]>([]);
  const [faces, setFaces] = useState<FaceGroup[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Settings State
  const [theme, setTheme] = useState({
      primary_color: '#6366f1',
      logo_url: '',
      background_image: '',
      header_text_color: '#ffffff'
  });
  
  // Interaction State
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

  // Links State
  const [expiryHours, setExpiryHours] = useState(24);
  const [linkPassword, setLinkPassword] = useState("");
  const [generatedLink, setGeneratedLink] = useState("");
  const [generatingLink, setGeneratingLink] = useState(false);
  const [clientLink, setClientLink] = useState("");
  const [selectedLinkEvents, setSelectedLinkEvents] = useState<string[]>([]);

  useEffect(() => {
    if (id) loadData();
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
              setTheme(t => ({...t, ...currentCol.custom_theme}));
          }
      }
      
      // Face Logic: Aggregate faces from photos and merge with saved names
      const calculatedFaces = buildFacesFromPhotos(loadedPhotos);
      try {
        const savedData = await Api.listPeople(id);
        const nameMap = new Map();
        (savedData.people || []).forEach((p: any) => {
             const fid = p.FaceId || p.face_id;
             if (fid) nameMap.set(fid, p.FaceName || p.name);
        });
        const mergedFaces = calculatedFaces.map(cF => ({
            ...cF, 
            FaceName: nameMap.get(cF.FaceId) || cF.FaceName || "Unknown"
        }));
        setFaces(mergedFaces);
      } catch(e) { 
        console.warn("Failed to load face names", e);
        setFaces(calculatedFaces); 
      }

      // Lead Logic
      try {
        const leadData = await Api.getLeads(id);
        setLeads(leadData.filter(l => l.name !== "CLIENT_SELECTION"));
      } catch(e) {}
      
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
          (photo.faces || []).forEach((f: any) => {
              const fid = f.FaceId || f.face_id;
              if(!fid) return;
              if(!map.has(fid)) {
                  map.set(fid, { FaceId: fid, FaceName: "Unknown", photoCount: 1, sampleUrl, BoundingBox: f.BoundingBox });
              } else {
                  map.get(fid)!.photoCount++;
              }
          });
      });
      return Array.from(map.values()).sort((a,b) => b.photoCount - a.photoCount);
  };

  const getFilteredPhotos = () => {
    let res = photos;
    // Filter by Face
    if (filterFaceId) {
        res = res.filter(p => p.faces && p.faces.some((f: any) => (f.FaceId === filterFaceId || f.face_id === filterFaceId)));
    }
    // Filter by Event
    if (filterEventId !== 'All') res = res.filter(p => p.event_id === filterEventId);
    return res;
  };
  const displayedPhotos = getFilteredPhotos();

  const togglePhotoSelection = (pid: string) => {
    const newSet = new Set(selectedPhotos);
    if (newSet.has(pid)) newSet.delete(pid); else newSet.add(pid);
    setSelectedPhotos(newSet);
  };

  const handleDeleteSelected = async () => {
      if(!id || selectedPhotos.size === 0) return;
      if(!confirm(`Delete ${selectedPhotos.size} photos?`)) return;
      setIsDeleting(true);
      try {
          for(const pid of selectedPhotos) await Api.deletePhoto(id, pid);
          setSelectedPhotos(new Set());
          loadData();
      } catch(e) { alert("Delete failed"); }
      finally { setIsDeleting(false); }
  };

  const handleUpload = async () => {
    if (!id || !selectedEventId || files.length === 0) return alert("Select event and files");
    setUploading(true);
    setProgress(0);
    setUploadStatus("Starting...");
    try {
      const BATCH_SIZE = 5;
      for (let i = 0; i < files.length; i += BATCH_SIZE) {
          const batch = files.slice(i, i + BATCH_SIZE);
          setUploadStatus(`Uploading ${i + 1} - ${Math.min(i + BATCH_SIZE, files.length)} of ${files.length}`);
          const { urls } = await Api.generateUploadUrls(id, selectedEventId, batch.map(f => ({ name: f.name, type: f.type })));
          await Promise.all(batch.map((f, idx) => fetch(urls[idx].uploadURL, { method: 'PUT', body: f, headers: {'Content-Type': f.type} })));
          setProgress(Math.round(((i + batch.length) / files.length) * 100));
      }
      setUploadStatus("Complete!");
      setTimeout(() => { setFiles([]); setUploadStatus(""); loadData(); }, 1000);
    } catch(e) { setUploadStatus("Error"); }
    finally { setUploading(false); }
  };

  const formatBytes = (bytes: number) => {
      if (!bytes) return '0 B';
      const k = 1024;
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + ['B', 'KB', 'MB', 'GB'][i];
  };

  // Helper to get face image style (Focus crop)
  const getFaceStyle = (url: string, bbox: any) => {
      if (!url) return {};
      // Calculate crop based on bounding box if available
      let position = 'center';
      let size = 'cover';
      if (bbox && bbox.Left !== undefined) {
         const cx = (bbox.Left + bbox.Width/2) * 100;
         const cy = (bbox.Top + bbox.Height/2) * 100;
         const zoom = 1 / Math.max(bbox.Width, bbox.Height);
         position = `${cx}% ${cy}%`;
         size = `${zoom * 100}%`;
      }
      return { backgroundImage: `url("${url}")`, backgroundPosition: position, backgroundSize: size };
  };

  const saveSettings = async () => {
    if (!id || !collectionInfo) return;
    try {
      await Api.upsertCollection(collectionInfo.name, id, theme);
      alert("Settings saved successfully");
    } catch (e) {
      console.error(e);
      alert("Failed to save settings");
    }
  };

  const handleGenerateLink = async () => {
    if (!id) return;
    if (selectedLinkEvents.length === 0) {
      alert("Please select at least one event to generate a link.");
      return;
    }

    setGeneratingLink(true);
    setGeneratedLink("");
    
    try {
      const cleanPassword = linkPassword.trim() === "" ? undefined : linkPassword;

      const res = await Api.generateLink({
        collection_id: id,
        event_ids: selectedLinkEvents,
        expiry_hours: expiryHours,
        password: cleanPassword
      });
      
      console.log("Link Generation Response:", res); 

      // 1. Try to get direct URL from response
      const directUrl = res.searchUrl || res.search_url || res.url;
      if (directUrl) {
          setGeneratedLink(directUrl);
          return;
      }

      // 2. Fallback: Construct URL from ID
      const finalLinkId = res.linkId || res.link_id || res.id;

      if (finalLinkId) {
        // Use explicit /guest route to avoid conflict with root handler
        const url = `${window.location.protocol}//${window.location.host}/#/guest?linkId=${finalLinkId}`;
        setGeneratedLink(url);
      } else {
        console.warn("API Response missing ID or searchUrl:", res);
        alert("Failed to retrieve Link. Check console for details.");
      }
    } catch (e) {
      console.error("Link Generation Error:", e);
      alert("Error generating link. Please try again.");
    } finally {
        setGeneratingLink(false);
    }
  };

  const handleRenameFace = async (faceId: string, currentName?: string) => {
    if (!id) return;
    const newName = prompt("Name this person:", currentName === "Unknown" ? "" : currentName);
    if (newName !== null && newName.trim() !== "" && newName !== currentName) {
        try {
            // Optimistic update for UI responsiveness
            setFaces(prev => prev.map(f => f.FaceId === faceId ? { ...f, FaceName: newName } : f));
            await Api.saveFaceName(id, faceId, newName);
        } catch (e) {
            console.error(e);
            alert("Failed to save name");
            loadData(); // Revert on error
        }
    }
  };

  return (
    <div className="dashboard-container">
      
      {/* SIDEBAR */}
      <div className="sidebar">
        <div className="logo">
          <div className="logo-icon"><i className="fas fa-camera"></i></div>
          <div className="logo-text">EventLens</div>
        </div>
        
        <div className="nav-section">
          <div className="nav-title">Manage Collection</div>
          <div className={`nav-item ${activeTab === 'gallery' ? 'active' : ''}`} onClick={() => setActiveTab('gallery')}>
            <i className="fas fa-images"></i> <span>Gallery</span>
          </div>
          <div className={`nav-item ${activeTab === 'events' ? 'active' : ''}`} onClick={() => setActiveTab('events')}>
            <i className="fas fa-calendar"></i> <span>Events</span>
          </div>
          <div className={`nav-item ${activeTab === 'upload' ? 'active' : ''}`} onClick={() => setActiveTab('upload')}>
            <i className="fas fa-cloud-upload-alt"></i> <span>Upload</span>
          </div>
          <div className={`nav-item ${activeTab === 'guests' ? 'active' : ''}`} onClick={() => setActiveTab('guests')}>
            <i className="fas fa-users"></i> <span>Guest Leads</span>
          </div>
          <div className={`nav-item ${activeTab === 'links' ? 'active' : ''}`} onClick={() => setActiveTab('links')}>
            <i className="fas fa-link"></i> <span>Share Links</span>
          </div>
        </div>
        
        <div className="nav-section">
          <div className="nav-title">Configuration</div>
          <div className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
            <i className="fas fa-cog"></i> <span>Settings</span>
          </div>
        </div>
        
        <div className="mt-auto">
          <div className="nav-item" onClick={() => navigate('/dashboard')}>
            <i className="fas fa-arrow-left"></i> <span>Back to Dashboard</span>
          </div>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="main-content">
        
        {/* TOP BAR */}
        <div className="top-bar">
          <div className="page-info">
            <h1>{collectionInfo?.name || 'Loading...'}</h1>
            <p className="text-gray-400 text-sm">Created {new Date(collectionInfo?.created_at || Date.now()).toLocaleDateString()}</p>
          </div>
          <div className="stats-row">
            <div className="stat-box">
              <div className="stat-value">{photos.length}</div>
              <div className="stat-label">Photos</div>
            </div>
            <div className="stat-box">
              <div className="stat-value">{events.length}</div>
              <div className="stat-label">Events</div>
            </div>
            <div className="stat-box">
              <div className="stat-value">{leads.length}</div>
              <div className="stat-label">Guests</div>
            </div>
            <div className="stat-box">
              <div className="stat-value">{formatBytes(collectionInfo?.storage_bytes || 0)}</div>
              <div className="stat-label">Storage</div>
            </div>
          </div>
        </div>

        {/* TABS CONTENT */}
        
        {/* === GALLERY === */}
        {activeTab === 'gallery' && (
          <div className="card animate-fade-in">
            <div className="card-header">
              <div className="card-title">
                <i className="fas fa-images"></i> All Photos 
                <span className="text-gray-500 text-sm ml-2 font-normal">• {displayedPhotos.length} items</span>
              </div>
              <div className="flex gap-3">
                <select 
                   value={filterEventId} 
                   onChange={e => setFilterEventId(e.target.value)} 
                   className="bg-black/30 border border-white/10 text-white text-sm rounded-lg px-3 py-2 outline-none"
                >
                    <option value="All">All Events</option>
                    {events.map(e => <option key={e.event_id} value={e.event_id}>{e.name}</option>)}
                </select>
                {selectedPhotos.size > 0 && (
                  <button onClick={handleDeleteSelected} className="btn-premium btn-danger">
                    <i className="fas fa-trash"></i> Delete ({selectedPhotos.size})
                  </button>
                )}
              </div>
            </div>

            {/* Face Grouping Section */}
            <div className="faces-scroll">
              <div 
                className={`face-avatar-wrapper ${!filterFaceId ? 'active' : ''}`} 
                onClick={() => setFilterFaceId(null)}
              >
                <div className="face-avatar bg-gray-800 flex items-center justify-center border-dashed">
                   <span className="text-xs font-bold">ALL</span>
                </div>
                <div className="text-xs font-bold text-white">Everyone</div>
              </div>
              
              {faces.map(face => (
                <div 
                  key={face.FaceId}
                  className={`face-avatar-wrapper ${filterFaceId === face.FaceId ? 'active' : ''}`}
                  onClick={() => setFilterFaceId(face.FaceId)}
                >
                  <div className="face-avatar" style={getFaceStyle(face.sampleUrl || '', face.BoundingBox)}></div>
                  <div 
                      className="text-xs font-bold text-white truncate px-1 hover:text-brand hover:underline cursor-pointer flex items-center justify-center gap-1"
                      onClick={(e) => {
                          e.stopPropagation();
                          handleRenameFace(face.FaceId, face.FaceName);
                      }}
                      title="Click name to rename"
                  >
                      {face.FaceName} <i className="fas fa-pencil-alt text-[8px] text-gray-500"></i>
                  </div>
                  <div className="text-[10px] text-gray-500">{face.photoCount}</div>
                </div>
              ))}
            </div>

            {/* Photo Grid */}
            <div className="gallery-grid">
              {displayedPhotos.map(photo => {
                const isSelected = selectedPhotos.has(photo.photo_id);
                return (
                  <div 
                    key={photo.photo_id} 
                    className={`photo-card ${isSelected ? 'ring-2 ring-brand' : ''}`}
                    onClick={() => togglePhotoSelection(photo.photo_id)}
                  >
                    <img src={photo.thumbnail_url || photo.url} loading="lazy" />
                    {isSelected && (
                        <div className="selection-ring"><div className="selection-check">✓</div></div>
                    )}
                    <div className="photo-overlay">
                        <span className="text-[10px] text-white bg-black/50 px-2 py-1 rounded">
                            {formatBytes(photo.file_size)}
                        </span>
                    </div>
                  </div>
                );
              })}
            </div>
            {displayedPhotos.length === 0 && <div className="text-center py-10 text-gray-500">No photos found in this view.</div>}
          </div>
        )}

        {/* === EVENTS === */}
        {activeTab === 'events' && (
          <div className="card animate-fade-in">
             <div className="card-header">
                <div className="card-title"><i className="fas fa-calendar"></i> Events</div>
                <button 
                  onClick={() => {
                      const n = prompt("Event Name"); const d = prompt("Date (YYYY-MM-DD)");
                      if(n && d && id) Api.upsertEvent(id, n, d).then(loadData);
                  }}
                  className="btn-premium btn-primary"
                >
                    + New Event
                </button>
             </div>
             <div className="grid gap-4">
                {events.map(evt => (
                    <div key={evt.event_id} className="bg-white/5 border border-white/10 p-4 rounded-xl flex justify-between items-center hover:border-brand/50 transition">
                        <div>
                            <div className="font-bold text-lg mb-1">{evt.name}</div>
                            <div className="text-sm text-gray-400 flex gap-4">
                                <span><i className="fas fa-calendar-alt mr-1"></i> {evt.event_date}</span>
                                <span><i className="fas fa-image mr-1"></i> {evt.photo_count} photos</span>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button className="btn-premium btn-secondary" onClick={() => {
                                const nn = prompt("Rename", evt.name);
                                if(nn && id) Api.upsertEvent(id, nn, evt.event_date, evt.event_id).then(loadData);
                            }}>Edit</button>
                            <button className="btn-premium btn-danger" onClick={() => {
                                if(confirm("Delete event and all its photos?")) Api.deleteEvent(id!, evt.event_id).then(loadData);
                            }}>Delete</button>
                        </div>
                    </div>
                ))}
                {events.length === 0 && <div className="text-center py-10 text-gray-500">No events yet. Create one to upload photos.</div>}
             </div>
          </div>
        )}

        {/* === UPLOAD === */}
        {activeTab === 'upload' && (
            <div className="card animate-fade-in">
                <div className="card-header">
                    <div className="card-title"><i className="fas fa-cloud-upload-alt"></i> Upload Photos</div>
                </div>
                
                <div className="mb-6">
                    <label className="block text-sm text-gray-400 mb-2">Select Target Event</label>
                    <select 
                        value={selectedEventId} 
                        onChange={e => setSelectedEventId(e.target.value)}
                        className="input-premium"
                    >
                        <option value="">-- Choose Event --</option>
                        {events.map(e => <option key={e.event_id} value={e.event_id}>{e.name}</option>)}
                    </select>
                </div>

                {!uploading ? (
                    <div className="upload-zone-premium relative">
                        <input type="file" multiple accept="image/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={(e) => setFiles(Array.from(e.target.files || []))} />
                        <i className="fas fa-cloud-upload text-5xl text-gray-600 mb-4 block"></i>
                        <h3 className="text-xl font-bold mb-2">Drop photos here or click to browse</h3>
                        <p className="text-gray-500 text-sm">Supports JPG, PNG, HEIC</p>
                        {files.length > 0 && <div className="mt-4 text-brand font-bold">{files.length} files selected</div>}
                    </div>
                ) : (
                    <div className="py-10 text-center">
                        <div className="text-2xl font-bold mb-2">{progress}%</div>
                        <div className="w-full bg-gray-700 h-2 rounded-full overflow-hidden mb-2">
                            <div className="h-full bg-brand transition-all duration-300" style={{width: `${progress}%`}}></div>
                        </div>
                        <div className="text-gray-400">{uploadStatus}</div>
                    </div>
                )}

                {files.length > 0 && !uploading && (
                    <div className="mt-6 text-center">
                        <button onClick={handleUpload} className="btn-premium btn-primary px-8 py-3">Start Upload</button>
                    </div>
                )}
            </div>
        )}

        {/* === GUESTS === */}
        {activeTab === 'guests' && (
            <div className="card animate-fade-in">
                <div className="card-header">
                    <div className="card-title"><i className="fas fa-users"></i> Guest Leads</div>
                    <div className="text-sm text-gray-400">{leads.length} leads found</div>
                </div>
                
                <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-left bg-black/20">
                        <thead className="bg-white/5 text-gray-400 text-xs uppercase">
                            <tr>
                                <th className="p-4">Guest</th>
                                <th className="p-4">Contact</th>
                                <th className="p-4">Time</th>
                                <th className="p-4">Photos Found</th>
                                <th className="p-4">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {leads.map((lead, idx) => (
                                <tr key={idx} className="hover:bg-white/5">
                                    <td className="p-4 font-bold text-white">{lead.name || 'Unknown'}</td>
                                    <td className="p-4 text-gray-300">{lead.mobile}</td>
                                    <td className="p-4 text-gray-500 text-sm">{lead.timestamp ? new Date(lead.timestamp).toLocaleString() : '-'}</td>
                                    <td className="p-4 font-bold text-brand">{lead.match_count}</td>
                                    <td className="p-4">
                                        <button 
                                            onClick={() => window.open(lead.selfie_image || lead.selfie_b64, '_blank')}
                                            className="text-xs bg-white/10 px-3 py-1 rounded hover:bg-white/20"
                                        >
                                            View Selfie
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {leads.length === 0 && <div className="p-8 text-center text-gray-500">No guest activity yet.</div>}
                </div>
            </div>
        )}

        {/* === SETTINGS === */}
        {activeTab === 'settings' && (
             <div className="card animate-fade-in">
                 <div className="card-header">
                     <div className="card-title"><i className="fas fa-cog"></i> Branding Settings</div>
                 </div>
                 <div className="grid md:grid-cols-2 gap-8">
                     <div>
                         <label className="block text-sm text-gray-400 mb-2">Primary Color</label>
                         <div className="flex gap-2">
                             <input type="color" value={theme.primary_color} onChange={e => setTheme({...theme, primary_color: e.target.value})} className="h-10 w-10 bg-transparent border-none cursor-pointer" />
                             <input type="text" value={theme.primary_color} onChange={e => setTheme({...theme, primary_color: e.target.value})} className="input-premium" />
                         </div>
                     </div>
                     <div>
                         <label className="block text-sm text-gray-400 mb-2">Logo URL</label>
                         <input type="text" value={theme.logo_url} onChange={e => setTheme({...theme, logo_url: e.target.value})} className="input-premium" placeholder="https://..." />
                     </div>
                 </div>
                 <div className="mt-8">
                     <button onClick={saveSettings} className="btn-premium btn-primary">Save Changes</button>
                 </div>
             </div>
        )}

        {/* === LINKS === */}
        {activeTab === 'links' && (
             <div className="card animate-fade-in">
                 <div className="card-header">
                     <div className="card-title"><i className="fas fa-link"></i> Share Links</div>
                 </div>
                 <div className="grid md:grid-cols-2 gap-8">
                     <div>
                         <h3 className="font-bold mb-4">Generate Guest Link</h3>
                         <div className="bg-black/20 p-4 rounded-lg border border-border mb-4 max-h-48 overflow-y-auto">
                            {events.map(e => (
                                <label key={e.event_id} className="flex items-center gap-2 mb-2 cursor-pointer">
                                    <input type="checkbox" checked={selectedLinkEvents.includes(e.event_id)} onChange={ev => {
                                        if(ev.target.checked) setSelectedLinkEvents([...selectedLinkEvents, e.event_id]);
                                        else setSelectedLinkEvents(selectedLinkEvents.filter(x => x !== e.event_id));
                                    }} />
                                    <span className="text-sm">{e.name}</span>
                                </label>
                            ))}
                         </div>
                         <div className="flex gap-2 mb-4">
                            <input type="number" placeholder="Hours" value={expiryHours} onChange={e => setExpiryHours(Number(e.target.value))} className="input-premium w-24" />
                            <input type="text" placeholder="PIN (Optional)" value={linkPassword} onChange={e => setLinkPassword(e.target.value)} className="input-premium" />
                         </div>
                         <button onClick={handleGenerateLink} disabled={generatingLink} className="btn-premium btn-primary w-full flex justify-center items-center gap-2">
                             {generatingLink ? <i className="fas fa-spinner fa-spin"></i> : null}
                             {generatingLink ? "Generating..." : "Generate Link"}
                         </button>
                     </div>
                     
                     <div className="border-l border-border pl-8 flex flex-col justify-center items-center text-center">
                         {generatedLink ? (
                             <div className="animate-fade-in w-full">
                                 <div className="text-brand text-4xl mb-2"><i className="fas fa-check-circle"></i></div>
                                 <div className="font-bold text-lg mb-2">Link Ready!</div>
                                 <div className="bg-black/30 p-3 rounded border border-brand/30 text-xs break-all font-mono mb-4 text-brand">{generatedLink}</div>
                                 <button onClick={() => navigator.clipboard.writeText(generatedLink)} className="btn-premium btn-secondary w-full">Copy to Clipboard</button>
                             </div>
                         ) : (
                             <div className="text-gray-500">
                                 <i className="fas fa-link text-4xl mb-2 opacity-50"></i>
                                 <p>Select events and generate a secure link for your guests.</p>
                             </div>
                         )}
                     </div>
                 </div>
             </div>
        )}

      </div>
    </div>
  );
};

export default CollectionManager;