import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Api } from '../services/api';
import { EventData, Photo, FaceGroup, Lead } from '../types';

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
  
  // Filtering & Selection State
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [filterFaceId, setFilterFaceId] = useState<string | null>(null);
  const [filterEventId, setFilterEventId] = useState<string>('All');
  
  // Lead Privacy State
  const [showFullMobile, setShowFullMobile] = useState<Set<number>>(new Set());

  // Upload State
  const [files, setFiles] = useState<File[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState("");

  // Link Gen State
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
      setPhotos(photoData.photos || []);
      
      // Robust Face & Lead Fetching
      try {
        const faceData = await Api.listPeople(id);
        setFaces(faceData.people || []);
      } catch(e) { console.warn("Face fetch error", e); }

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

  // ... (Keep existing helpers: handleNameFace, getFilteredPhotos, togglePhotoSelection, selectAllPhotos, handleDeleteSelected, handleFileSelect, handleUpload, toggleMobileReveal, maskMobile, handleGenerateLink)
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
    if (filterFaceId) res = res.filter(p => p.face_ids && p.face_ids.includes(filterFaceId));
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

  const handleDeleteSelected = async () => {
      if(selectedPhotos.size === 0) return;
      if(!confirm(`Delete ${selectedPhotos.size} photos?`)) return;
      alert("Backend delete integration required.");
      setSelectedPhotos(new Set());
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setFiles(Array.from(e.target.files));
  };

  const handleUpload = async () => {
    if (!id || !selectedEventId || files.length === 0) return;
    setUploading(true);
    setProgress(0);
    setUploadStatus("Starting Smart Upload...");
    const BATCH_SIZE = 5;
    const totalFiles = files.length;
    let completedCount = 0;
    try {
      for (let i = 0; i < totalFiles; i += BATCH_SIZE) {
          const batch = files.slice(i, i + BATCH_SIZE);
          setUploadStatus(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}...`);
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
      setUploadStatus("Finalizing... AI Indexing in background.");
      await new Promise(r => setTimeout(r, 1000));
      alert(`Successfully uploaded ${totalFiles} photos!`);
      setFiles([]);
      loadData(); 
    } catch (e) {
      console.error(e);
      setUploadStatus("Error occurred.");
    } finally {
      setUploading(false);
    }
  };

  const toggleMobileReveal = (index: number) => {
      const newSet = new Set(showFullMobile);
      if(newSet.has(index)) newSet.delete(index); else newSet.add(index);
      setShowFullMobile(newSet);
  };
  const maskMobile = (mobile: string) => (!mobile || mobile.length < 4) ? mobile : mobile.slice(0, 2) + "******" + mobile.slice(-4);

  const handleGenerateLink = async () => {
    if (!id || selectedLinkEvents.length === 0) return alert("Select at least one event");
    try {
        const res = await Api.generateLink({ collection_id: id, event_ids: selectedLinkEvents, expiry_hours: expiryHours, password: linkPassword });
        const guestUrl = `${window.location.origin}/#/?linkId=${res.searchUrl.split('linkId=')[1]}`;
        setGeneratedLink(guestUrl);
    } catch (e) { alert("Failed to generate link"); }
  };

  return (
    <div className="flex h-screen bg-black text-white font-sans overflow-hidden">
      {/* SIDEBAR NAVIGATION - Makes the update visually obvious */}
      <div className="w-20 md:w-64 bg-[#0a0a0a] border-r border-white/5 flex flex-col p-4 z-20 shadow-2xl">
        <div className="flex items-center gap-3 mb-8 cursor-pointer" onClick={() => navigate('/dashboard')}>
           <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20">←</div>
           <span className="hidden md:block font-bold text-lg tracking-tight">Back</span>
        </div>
        
        <div className="space-y-2 flex-1">
            {[
              { id: 'gallery', label: 'Gallery', icon: '🖼️' },
              { id: 'events', label: 'Events', icon: '📅' },
              { id: 'upload', label: 'Upload', icon: '☁️' },
              { id: 'links', label: 'Share', icon: '🔗' },
              { id: 'guests', label: 'Guest Leads', icon: '👥' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-300 group ${
                  activeTab === tab.id 
                  ? 'bg-brand text-black shadow-[0_0_15px_rgba(0,230,118,0.3)] font-bold' 
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <span className="text-xl">{tab.icon}</span>
                <span className="hidden md:block">{tab.label}</span>
                {tab.id === 'guests' && leads.length > 0 && <span className="ml-auto bg-red-500 text-white text-[10px] px-2 rounded-full hidden md:block">{leads.length}</span>}
              </button>
            ))}
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 overflow-y-auto bg-black relative">
        {/* Ambient Background */}
        <div className="fixed top-0 left-0 w-full h-full pointer-events-none">
            <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] bg-brand/5 rounded-full blur-[100px]"></div>
        </div>

        <div className="p-6 md:p-10 max-w-7xl mx-auto relative z-10">
          <header className="mb-8 flex justify-between items-end animate-fade-in">
              <div>
                  <h1 className="text-3xl font-black text-white mb-1">Collection Manager</h1>
                  <p className="text-gray-500 text-sm">AI Powered Organization</p>
              </div>
              <div className="text-right hidden md:block">
                  <div className="text-2xl font-mono text-brand">{photos.length}</div>
                  <div className="text-xs text-gray-500 uppercase tracking-widest">Total Photos</div>
              </div>
          </header>

          {/* Gallery View */}
          {activeTab === 'gallery' && (
            <div className="animate-slide-up space-y-8">
              {/* FACE STORY BAR */}
              <div className="glass-panel p-6 rounded-3xl overflow-x-auto pb-6">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4 sticky left-0">Detected Faces ({faces.length})</h3>
                <div className="flex gap-6 min-w-max">
                    <div 
                        onClick={() => setFilterFaceId(null)}
                        className={`group flex flex-col items-center cursor-pointer transition-transform hover:scale-105 ${!filterFaceId ? 'opacity-100' : 'opacity-60'}`}
                    >
                        <div className="w-20 h-20 rounded-full border-2 border-dashed border-gray-600 flex items-center justify-center mb-2 hover:border-brand transition">
                            <span className="text-2xl">♾️</span>
                        </div>
                        <span className="text-xs font-bold text-gray-300">All</span>
                    </div>

                    {faces.length === 0 && !loading && (
                        <div className="flex items-center text-gray-500 text-sm italic pl-4">
                            No faces detected yet. Try uploading photos with people.
                        </div>
                    )}

                    {faces.map(face => (
                    <div 
                        key={face.FaceId} 
                        onClick={() => setFilterFaceId(face.FaceId)}
                        className={`relative group flex flex-col items-center cursor-pointer transition-transform hover:scale-105`}
                    >
                        <div className={`relative w-20 h-20 rounded-full p-[3px] mb-2 transition-all ${filterFaceId === face.FaceId ? 'bg-gradient-to-tr from-brand to-cyan-400 shadow-[0_0_20px_rgba(0,230,118,0.4)]' : 'bg-gray-800'}`}>
                            <img 
                                src={face.thumbnail || face.sampleUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${face.FaceId}`} 
                                className="w-full h-full rounded-full object-cover border-2 border-black" 
                                alt="Face" 
                            />
                        </div>
                        <span className="text-xs font-medium text-gray-300 truncate w-20 text-center">{face.FaceName || 'Unknown'}</span>
                        <button 
                            onClick={(e) => handleNameFace(e, face.FaceId, face.FaceName)}
                            className="absolute top-0 right-0 bg-gray-800 text-white w-6 h-6 rounded-full text-[10px] border border-gray-600 hover:bg-brand hover:text-black hover:border-brand transition flex items-center justify-center shadow-lg z-10"
                        >
                            ✏️
                        </button>
                    </div>
                    ))}
                </div>
              </div>

              {/* TOOLBAR */}
              <div className="glass-panel p-4 rounded-2xl flex flex-wrap justify-between items-center gap-4 sticky top-4 z-30">
                 <div className="flex items-center gap-4">
                    <select 
                        className="bg-black border border-white/10 rounded-lg px-4 py-2 text-sm focus:border-brand outline-none transition"
                        value={filterEventId}
                        onChange={(e) => setFilterEventId(e.target.value)}
                    >
                        <option value="All">All Events</option>
                        {events.map(e => <option key={e.event_id} value={e.event_id}>{e.name}</option>)}
                    </select>
                    <span className="text-sm text-gray-400">{displayedPhotos.length} photos found</span>
                 </div>
                 <div className="flex gap-2">
                    <button onClick={selectAllPhotos} className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm transition">
                        {selectedPhotos.size === displayedPhotos.length ? 'Deselect All' : 'Select All'}
                    </button>
                    {selectedPhotos.size > 0 && (
                        <button onClick={handleDeleteSelected} className="px-4 py-2 bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white rounded-lg text-sm transition">
                            Delete ({selectedPhotos.size})
                        </button>
                    )}
                 </div>
              </div>

              {/* PHOTO GRID */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 gap-4">
                {displayedPhotos.map(photo => (
                  <div 
                    key={photo.photo_id} 
                    onClick={() => togglePhotoSelection(photo.photo_id)}
                    className={`aspect-square relative group bg-[#111] rounded-xl overflow-hidden cursor-pointer transition-all duration-300 ${selectedPhotos.has(photo.photo_id) ? 'ring-2 ring-brand ring-offset-2 ring-offset-black scale-95' : 'hover:scale-105 hover:z-10 hover:shadow-2xl'}`}
                  >
                    <img src={photo.thumbnail_url} loading="lazy" className="w-full h-full object-cover" alt="img" />
                    <div className={`absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center transition-all ${selectedPhotos.has(photo.photo_id) ? 'bg-brand text-black scale-100' : 'bg-black/50 border border-white/30 scale-0 group-hover:scale-100'}`}>
                        {selectedPhotos.has(photo.photo_id) && <span>✓</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Events View */}
          {activeTab === 'events' && (
            <div className="animate-slide-up space-y-6">
                 <div className="flex justify-between items-center glass-panel p-6 rounded-2xl">
                    <h2 className="text-xl font-bold">Timeline</h2>
                    <button onClick={() => {
                        const name = prompt("Event Name:");
                        const date = prompt("Date (YYYY-MM-DD):", new Date().toISOString().split('T')[0]);
                        if(name && date && id) Api.upsertEvent(id, name, date).then(loadData);
                    }} className="bg-brand text-black px-6 py-2 rounded-lg font-bold shadow-[0_0_20px_rgba(0,230,118,0.3)] hover:scale-105 transition">+ Add Event</button>
                 </div>
                 <div className="grid gap-4">
                    {events.map(evt => (
                        <div key={evt.event_id} className="glass-panel p-6 rounded-2xl flex items-center justify-between hover:border-brand/30 transition group">
                            <div className="flex items-center gap-6">
                                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-gray-800 to-black flex items-center justify-center text-2xl border border-white/5">
                                    {evt.name.charAt(0)}
                                </div>
                                <div>
                                    <h3 className="font-bold text-xl">{evt.name}</h3>
                                    <p className="text-gray-400 text-sm mt-1">📅 {evt.event_date} • {evt.photo_count} photos</p>
                                </div>
                            </div>
                            <button onClick={() => { if(id && confirm("Delete?")) Api.deleteEvent(id, evt.event_id).then(loadData); }} className="text-red-500 opacity-0 group-hover:opacity-100 transition px-4 py-2 hover:bg-red-500/10 rounded-lg">Delete</button>
                        </div>
                    ))}
                 </div>
            </div>
          )}

           {/* Upload View */}
           {activeTab === 'upload' && (
             <div className="animate-slide-up h-[70vh] flex items-center justify-center">
                 <div className="glass-panel p-10 rounded-3xl w-full max-w-2xl text-center">
                    <h2 className="text-3xl font-bold mb-2">Upload Center</h2>
                    <p className="text-gray-400 mb-8">Smart Batching & AI Processing Active</p>
                    
                    <select 
                        className="w-full bg-black border border-white/10 p-4 rounded-xl mb-6 focus:border-brand outline-none"
                        value={selectedEventId}
                        onChange={(e) => setSelectedEventId(e.target.value)}
                    >
                        <option value="">Select Event Destination</option>
                        {events.map(e => <option key={e.event_id} value={e.event_id}>{e.name}</option>)}
                    </select>

                    <div className={`border-2 border-dashed rounded-2xl p-16 transition-all ${files.length > 0 ? 'border-brand bg-brand/5' : 'border-white/10 hover:border-white/30'}`}>
                        <input type="file" multiple accept="image/*" onChange={handleFileSelect} className="hidden" id="file-upload" />
                        <label htmlFor="file-upload" className="cursor-pointer">
                            <div className="text-6xl mb-4">☁️</div>
                            <div className="text-xl font-bold">Drag & Drop or Click</div>
                            <div className="text-sm text-gray-500 mt-2">{files.length > 0 ? `${files.length} files selected` : 'Supports High-Res JPG, PNG'}</div>
                        </label>
                    </div>

                    {files.length > 0 && (
                        <div className="mt-8">
                             {uploading ? (
                                 <div className="w-full bg-gray-800 rounded-full h-4 overflow-hidden relative">
                                     <div className="absolute top-0 left-0 h-full bg-brand transition-all duration-300" style={{width: `${progress}%`}}></div>
                                     <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-black">{uploadStatus} {progress}%</div>
                                 </div>
                             ) : (
                                 <button onClick={handleUpload} className="w-full bg-brand text-black font-bold py-4 rounded-xl hover:scale-105 transition shadow-[0_0_30px_rgba(0,230,118,0.4)]">Start Upload</button>
                             )}
                        </div>
                    )}
                 </div>
             </div>
           )}

           {/* Guests View */}
           {activeTab === 'guests' && (
             <div className="animate-slide-up">
                <h2 className="text-2xl font-bold mb-6">Guest Leads & Activity</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {leads.length === 0 && (
                        <div className="col-span-full py-20 text-center text-gray-500">No guest activity recorded yet.</div>
                    )}
                    {leads.map((lead, i) => {
                         let imgSrc = lead.selfie_b64 
                         ? (lead.selfie_b64.startsWith('data:') ? lead.selfie_b64 : `data:image/jpeg;base64,${lead.selfie_b64}`) 
                         : `https://api.dicebear.com/7.x/initials/svg?seed=${lead.name}`;

                        return (
                        <div key={i} className="glass-panel p-5 rounded-2xl flex items-start gap-4 hover:border-brand/50 transition duration-300">
                            <div className="w-16 h-16 rounded-xl overflow-hidden bg-black border border-white/10 shrink-0">
                                <img src={imgSrc} className="w-full h-full object-cover" alt="Selfie" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <h4 className="font-bold text-lg truncate">{lead.name}</h4>
                                <div className="flex items-center gap-2 mb-2">
                                     <span className="text-brand font-mono text-sm">{showFullMobile.has(i) ? lead.mobile : maskMobile(lead.mobile)}</span>
                                     <button onClick={() => toggleMobileReveal(i)} className="text-xs bg-white/10 px-2 py-0.5 rounded hover:bg-white/20">{showFullMobile.has(i) ? 'Hide' : 'Show'}</button>
                                </div>
                                <div className="flex items-center justify-between text-xs text-gray-500 mt-2">
                                    <span>{new Date(lead.timestamp).toLocaleDateString()}</span>
                                    <span className="bg-brand/10 text-brand px-2 py-0.5 rounded-full">{lead.match_count} Matches</span>
                                </div>
                            </div>
                        </div>
                    )})}
                </div>
             </div>
           )}

            {/* Links View */}
            {activeTab === 'links' && (
                <div className="animate-slide-up h-[70vh] flex items-center justify-center">
                    <div className="glass-panel p-8 rounded-3xl w-full max-w-4xl grid md:grid-cols-2 gap-8">
                        <div>
                            <h3 className="text-xl font-bold mb-4">Generate Link</h3>
                            <div className="space-y-4">
                                <div className="bg-black/40 p-4 rounded-xl border border-white/5 h-48 overflow-y-auto">
                                    {events.map(e => (
                                        <label key={e.event_id} className="flex items-center gap-3 p-2 hover:bg-white/5 rounded cursor-pointer">
                                            <input type="checkbox" checked={selectedLinkEvents.includes(e.event_id)} onChange={(changeEvent) => {
                                                if(changeEvent.target.checked) setSelectedLinkEvents([...selectedLinkEvents, e.event_id]);
                                                else setSelectedLinkEvents(selectedLinkEvents.filter(x => x !== e.event_id));
                                            }} className="accent-brand" />
                                            <span>{e.name}</span>
                                        </label>
                                    ))}
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <input type="number" placeholder="Expiry (Hrs)" value={expiryHours} onChange={e => setExpiryHours(Number(e.target.value))} className="bg-black border border-white/10 p-3 rounded-xl focus:border-brand outline-none" />
                                    <input type="text" placeholder="PIN (Optional)" value={linkPassword} onChange={e => setLinkPassword(e.target.value)} className="bg-black border border-white/10 p-3 rounded-xl focus:border-brand outline-none" />
                                </div>
                                <button onClick={handleGenerateLink} className="w-full bg-white text-black font-bold py-3 rounded-xl hover:bg-gray-200 transition">Create Link</button>
                            </div>
                        </div>
                        <div className="flex flex-col items-center justify-center border-l border-white/5 pl-8">
                             {generatedLink ? (
                                 <div className="text-center w-full animate-fade-in">
                                     <div className="w-20 h-20 bg-brand/20 rounded-full flex items-center justify-center mx-auto mb-4 text-brand text-4xl">✓</div>
                                     <div className="bg-black p-4 rounded-xl border border-brand/50 text-brand font-mono text-sm break-all mb-4">{generatedLink}</div>
                                     <div className="flex gap-2 w-full">
                                         <button onClick={() => navigator.clipboard.writeText(generatedLink)} className="flex-1 bg-brand text-black py-2 rounded-lg font-bold">Copy</button>
                                         <button onClick={() => window.open(generatedLink)} className="flex-1 border border-white/20 py-2 rounded-lg hover:bg-white/10">Open</button>
                                     </div>
                                 </div>
                             ) : (
                                 <div className="text-gray-500">Select events and click generate</div>
                             )}
                        </div>
                    </div>
                </div>
            )}

        </div>
      </div>
    </div>
  );
};

export default CollectionManager;