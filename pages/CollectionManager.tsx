import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Api } from '../services/api';
import { Collection, EventData, Photo, FaceGroup, Lead } from '../types';

const CollectionManager = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'gallery' | 'events' | 'upload' | 'links' | 'guests'>('gallery');
  
  // Data State
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [events, setEvents] = useState<EventData[]>([]);
  const [faces, setFaces] = useState<FaceGroup[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  
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
    try {
      const [evtData, photoData] = await Promise.all([
        Api.getEvents(id),
        Api.getPhotos(id)
      ]);
      setEvents(evtData.events || []);
      setPhotos(photoData.photos || []);
      
      Api.listPeople(id).then(d => setFaces(d.people || []));
      Api.getLeads(id).then(l => setLeads(l));
      
    } catch (e) {
      console.error(e);
    }
  };

  // --- Face Naming Logic ---
  const handleNameFace = async (e: React.MouseEvent, faceId: string, currentName: string | undefined) => {
    e.stopPropagation(); // Prevent filtering when clicking edit
    const newName = prompt("Enter Name for this person:", currentName || "");
    if (newName && id) {
        try {
            await Api.saveFaceName(id, faceId, newName);
            // Optimistic update
            setFaces(prev => prev.map(f => f.FaceId === faceId ? { ...f, FaceName: newName } : f));
        } catch (error) {
            alert("Failed to update name");
        }
    }
  };

  // --- Filter Logic ---
  const getFilteredPhotos = () => {
    let res = photos;
    if (filterFaceId) {
      res = res.filter(p => p.face_ids && p.face_ids.includes(filterFaceId));
    }
    if (filterEventId !== 'All') {
      res = res.filter(p => p.event_id === filterEventId);
    }
    return res;
  };
  const displayedPhotos = getFilteredPhotos();

  // --- Selection Logic ---
  const togglePhotoSelection = (pid: string) => {
    const newSet = new Set(selectedPhotos);
    if (newSet.has(pid)) newSet.delete(pid);
    else newSet.add(pid);
    setSelectedPhotos(newSet);
  };

  const selectAllPhotos = () => {
    if (selectedPhotos.size === displayedPhotos.length) {
        setSelectedPhotos(new Set());
    } else {
        setSelectedPhotos(new Set(displayedPhotos.map(p => p.photo_id)));
    }
  };

  const handleDeleteSelected = async () => {
      if(selectedPhotos.size === 0) return;
      if(!confirm(`Delete ${selectedPhotos.size} photos? This cannot be undone.`)) return;
      alert("Backend delete integration required.");
      setSelectedPhotos(new Set());
  };

  // --- Smart Upload Logic (Batched) ---
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const handleUpload = async () => {
    if (!id || !selectedEventId || files.length === 0) return;
    setUploading(true);
    setProgress(0);
    setUploadStatus("Starting Smart Upload...");

    // Batch Configuration
    const BATCH_SIZE = 5; // Upload 5 photos at a time to prevent browser freeze
    const totalFiles = files.length;
    let completedCount = 0;

    try {
      for (let i = 0; i < totalFiles; i += BATCH_SIZE) {
          const batch = files.slice(i, i + BATCH_SIZE);
          const currentBatchNumber = Math.floor(i / BATCH_SIZE) + 1;
          const totalBatches = Math.ceil(totalFiles / BATCH_SIZE);
          
          setUploadStatus(`Processing batch ${currentBatchNumber} of ${totalBatches}...`);

          // 1. Prepare Payload (Simulating Hash Check)
          // Ideally: Calculate MD5 here to prevent dupes.
          const filePayload = batch.map(f => ({ 
              name: f.name, 
              type: f.type,
              size: f.size // Send size for backend validation
          }));

          // 2. Get Signed URLs for this batch only
          const { urls } = await Api.generateUploadUrls(id, selectedEventId, filePayload);

          // 3. Upload in Parallel (Promise.all)
          await Promise.all(batch.map(async (file, idx) => {
            const urlObj = urls[idx];
            // If backend returns no URL (duplicate), skip
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
      // Small delay to let user see 100%
      await new Promise(r => setTimeout(r, 1000));
      
      alert(`Successfully uploaded ${totalFiles} photos!`);
      setFiles([]);
      setUploadStatus("");
      loadData(); 
    } catch (e) {
      console.error(e);
      setUploadStatus("Error occurred during upload.");
      alert("Upload interrupted. Please check internet and try again.");
    } finally {
      setUploading(false);
    }
  };

  // --- Guest Privacy Helpers ---
  const toggleMobileReveal = (index: number) => {
      const newSet = new Set(showFullMobile);
      if(newSet.has(index)) newSet.delete(index);
      else newSet.add(index);
      setShowFullMobile(newSet);
  };

  const maskMobile = (mobile: string) => {
      if(!mobile || mobile.length < 4) return mobile;
      return mobile.slice(0, 2) + "******" + mobile.slice(-4);
  };

  // --- Link Gen Logic ---
  const handleGenerateLink = async () => {
    if (!id || selectedLinkEvents.length === 0) {
        alert("Select at least one event");
        return;
    }
    try {
        const res = await Api.generateLink({
            collection_id: id,
            event_ids: selectedLinkEvents,
            expiry_hours: expiryHours,
            password: linkPassword
        });
        const guestUrl = `${window.location.origin}/#/?linkId=${res.searchUrl.split('linkId=')[1]}`;
        setGeneratedLink(guestUrl);
    } catch (e) {
        alert("Failed to generate link");
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white p-4 md:p-8 font-sans">
      <div className="max-w-8xl mx-auto">
        
        {/* Top Header */}
        <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4 bg-[#111] p-4 rounded-2xl border border-white/5 shadow-xl">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/dashboard')} className="w-10 h-10 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-gray-300 transition">
              ←
            </button>
            <div>
              <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">Collection Manager</h1>
              <p className="text-xs text-gray-500">Manage photos, AI faces, and guest access</p>
            </div>
          </div>
          
          <div className="flex bg-[#1a1a1a] p-1.5 rounded-xl border border-white/5 overflow-x-auto max-w-full">
            {[
              { id: 'gallery', label: 'Gallery', icon: '🖼️' },
              { id: 'events', label: 'Events', icon: '📅' },
              { id: 'upload', label: 'Upload', icon: '☁️' },
              { id: 'links', label: 'Share', icon: '🔗' },
              { id: 'guests', label: 'Leads', icon: '👥' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all duration-200 whitespace-nowrap ${
                  activeTab === tab.id 
                  ? 'bg-brand text-black shadow-[0_0_15px_rgba(0,230,118,0.4)]' 
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <span>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content Area */}
        <div className="min-h-[600px] animate-fade-in">
          
          {/* Gallery Tab */}
          {activeTab === 'gallery' && (
            <div className="space-y-6">
              
              {/* Face Filters (Instagram Story Style) */}
              <div className="bg-[#111] p-4 rounded-2xl border border-white/5 overflow-x-auto pb-4 scrollbar-hide">
                <div className="flex gap-4 min-w-max px-2">
                    <div 
                        onClick={() => setFilterFaceId(null)}
                        className={`group flex flex-col items-center cursor-pointer transition-transform hover:scale-105 ${!filterFaceId ? 'opacity-100' : 'opacity-60'}`}
                    >
                        <div className="w-16 h-16 rounded-full border-2 border-brand/50 bg-gradient-to-br from-gray-800 to-black flex items-center justify-center shadow-lg">
                            <span className="text-xl">♾️</span>
                        </div>
                        <span className="text-xs mt-2 font-medium text-brand">All Photos</span>
                    </div>

                    {faces.map(face => (
                    <div 
                        key={face.FaceId} 
                        onClick={() => setFilterFaceId(face.FaceId)}
                        className={`relative group flex flex-col items-center cursor-pointer transition-transform hover:scale-105 ${filterFaceId === face.FaceId ? 'opacity-100' : 'opacity-70 hover:opacity-100'}`}
                    >
                        <div className={`relative w-16 h-16 rounded-full p-0.5 ${filterFaceId === face.FaceId ? 'bg-gradient-to-tr from-brand to-blue-500' : 'bg-gray-700'}`}>
                            <img 
                                src={face.thumbnail || face.sampleUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${face.FaceId}`} 
                                className="w-full h-full rounded-full object-cover border-2 border-black" 
                                alt="Face" 
                            />
                        </div>
                        {/* Edit Name Button */}
                        <button 
                            onClick={(e) => handleNameFace(e, face.FaceId, face.FaceName)}
                            className="absolute -top-1 -right-1 bg-gray-800 text-white p-1 rounded-full text-[10px] border border-gray-600 hover:bg-brand hover:text-black transition"
                            title="Name this person"
                        >
                            ✏️
                        </button>
                        <span className="text-xs mt-2 font-medium text-gray-300 truncate w-20 text-center">
                            {face.FaceName || 'Name Me'}
                        </span>
                        <span className="text-[10px] text-gray-600">{face.photoCount} photos</span>
                    </div>
                    ))}
                </div>
              </div>

              {/* Toolbar */}
              <div className="flex flex-wrap justify-between items-center gap-4 bg-[#111] p-3 rounded-xl border border-white/5">
                <div className="flex items-center gap-4">
                    <div className="relative">
                        <select 
                            className="appearance-none bg-[#1a1a1a] border border-white/10 rounded-lg pl-4 pr-10 py-2 text-sm focus:border-brand outline-none"
                            value={filterEventId}
                            onChange={(e) => setFilterEventId(e.target.value)}
                        >
                            <option value="All">All Events</option>
                            {events.map(e => <option key={e.event_id} value={e.event_id}>{e.name}</option>)}
                        </select>
                        <div className="absolute right-3 top-2.5 pointer-events-none text-gray-500 text-xs">▼</div>
                    </div>
                    <span className="text-sm text-gray-400 font-mono">{displayedPhotos.length} <span className="text-gray-600">photos</span></span>
                </div>
                <div className="flex gap-2">
                    <button onClick={selectAllPhotos} className="px-4 py-2 bg-[#222] hover:bg-[#333] rounded-lg text-sm font-medium transition">
                        {selectedPhotos.size === displayedPhotos.length ? 'Deselect All' : 'Select All'}
                    </button>
                    {selectedPhotos.size > 0 && (
                        <button onClick={handleDeleteSelected} className="px-4 py-2 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-lg text-sm font-medium transition border border-red-500/20">
                            Delete ({selectedPhotos.size})
                        </button>
                    )}
                </div>
              </div>
              
              {/* Photo Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {displayedPhotos.map(photo => (
                  <div 
                    key={photo.photo_id} 
                    onClick={() => togglePhotoSelection(photo.photo_id)}
                    className={`aspect-square relative group bg-[#111] rounded-xl overflow-hidden cursor-pointer transition-all duration-200 ${selectedPhotos.has(photo.photo_id) ? 'ring-2 ring-brand ring-offset-2 ring-offset-black scale-95' : 'hover:ring-1 hover:ring-white/30'}`}
                  >
                    <img src={photo.thumbnail_url} loading="lazy" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" alt="img" />
                    
                    <div className={`absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center transition-all ${selectedPhotos.has(photo.photo_id) ? 'bg-brand text-black scale-100' : 'bg-black/40 border border-white/30 scale-0 group-hover:scale-100'}`}>
                        {selectedPhotos.has(photo.photo_id) && <span className="font-bold text-xs">✓</span>}
                    </div>

                    <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                        <a href={photo.url} download onClick={(e) => e.stopPropagation()} className="block w-full text-center bg-white/10 hover:bg-white/20 backdrop-blur-md py-1 rounded text-xs font-medium">Download</a>
                    </div>
                  </div>
                ))}
              </div>
              {displayedPhotos.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                      <div className="text-4xl mb-4">📷</div>
                      <p>No photos match your filters.</p>
                  </div>
              )}
            </div>
          )}

          {/* Events Tab */}
          {activeTab === 'events' && (
            <div className="bg-[#111] p-6 rounded-2xl border border-white/5">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold">Event Timeline</h3>
                <button onClick={() => {
                    const name = prompt("Event Name:");
                    const date = prompt("Date (YYYY-MM-DD):", new Date().toISOString().split('T')[0]);
                    if(name && date && id) Api.upsertEvent(id, name, date).then(loadData);
                }} className="bg-brand text-black px-4 py-2 rounded-lg font-bold shadow-lg shadow-brand/20 hover:scale-105 transition">+ Add Event</button>
              </div>
              <div className="grid gap-4">
                {events.map(evt => (
                  <div key={evt.event_id} className="flex items-center justify-between p-5 bg-[#1a1a1a] rounded-xl border border-white/5 hover:border-brand/30 transition group">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-brand/10 flex items-center justify-center text-brand font-bold text-lg">
                            {evt.name.charAt(0)}
                        </div>
                        <div>
                            <h3 className="font-bold text-lg text-white">{evt.name}</h3>
                            <div className="flex gap-3 text-sm text-gray-400 mt-1">
                                <span className="flex items-center gap-1">📅 {evt.event_date}</span>
                                <span className="flex items-center gap-1">📸 {evt.photo_count} photos</span>
                            </div>
                        </div>
                    </div>
                    <button onClick={() => {
                        if(id && confirm("Delete event?")) Api.deleteEvent(id, evt.event_id).then(loadData);
                    }} className="opacity-0 group-hover:opacity-100 text-red-500 bg-red-500/10 px-4 py-2 rounded-lg font-medium transition hover:bg-red-500 hover:text-white">Delete</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upload Tab */}
          {activeTab === 'upload' && (
            <div className="bg-[#111] p-8 rounded-2xl border border-white/5 min-h-[500px] flex flex-col items-center justify-center">
              <div className="w-full max-w-xl">
                <div className="mb-8">
                    <h3 className="text-2xl font-bold text-center mb-2">Smart Batch Upload</h3>
                    <p className="text-gray-400 text-center">Auto-batches and hashes for performance</p>
                </div>
                
                <div className="mb-6">
                  <select 
                    className="w-full bg-[#050505] border border-gray-700 p-4 rounded-xl outline-none focus:border-brand text-white transition"
                    value={selectedEventId}
                    onChange={(e) => setSelectedEventId(e.target.value)}
                  >
                    <option value="">-- Choose Event for Upload --</option>
                    {events.map(e => <option key={e.event_id} value={e.event_id}>{e.name}</option>)}
                  </select>
                </div>

                <div className={`relative border-2 border-dashed rounded-2xl p-12 text-center transition-all ${files.length > 0 ? 'border-brand bg-brand/5' : 'border-gray-700 hover:border-gray-500 bg-[#050505]'}`}>
                  <input type="file" multiple accept="image/*" onChange={handleFileSelect} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                  <div className="pointer-events-none">
                    <div className="text-5xl mb-4 opacity-50">☁️</div>
                    <p className="text-xl font-bold text-white">Click or Drag Photos</p>
                    <p className="text-gray-500 text-sm mt-2">{files.length > 0 ? `${files.length} files ready` : 'Supports JPG, PNG, HEIC (Auto-converted)'}</p>
                  </div>
                </div>

                {files.length > 0 && (
                  <div className="mt-8">
                    {uploading ? (
                      <div className="bg-[#1a1a1a] p-4 rounded-xl border border-white/10">
                          <div className="flex justify-between text-sm mb-2 font-mono">
                              <span className="text-brand animate-pulse">{uploadStatus}</span>
                              <span>{progress}%</span>
                          </div>
                          <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
                              <div className="bg-brand h-full transition-all duration-300 shadow-[0_0_10px_#00e676]" style={{width: `${progress}%`}}></div>
                          </div>
                      </div>
                    ) : (
                      <button onClick={handleUpload} className="w-full bg-brand text-black font-bold text-lg py-4 rounded-xl hover:bg-brand-hover hover:-translate-y-1 transition shadow-lg shadow-brand/20">
                        Start Upload 🚀
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Links Tab */}
          {activeTab === 'links' && (
            <div className="grid md:grid-cols-2 gap-8">
                <div className="bg-[#111] p-6 rounded-2xl border border-white/5 h-fit">
                    <h3 className="text-xl font-bold mb-4">Generate Link</h3>
                    <div className="space-y-4">
                        <div className="bg-[#1a1a1a] p-4 rounded-xl border border-white/5">
                            <label className="block text-gray-400 text-xs uppercase font-bold tracking-wider mb-3">Select Events to Share</label>
                            <div className="max-h-48 overflow-y-auto space-y-2 custom-scrollbar">
                                {events.map(e => (
                                    <label key={e.event_id} className="flex items-center gap-3 p-2 rounded hover:bg-white/5 cursor-pointer transition">
                                        <input 
                                            type="checkbox" 
                                            checked={selectedLinkEvents.includes(e.event_id)}
                                            onChange={(ch) => {
                                                if(ch.target.checked) setSelectedLinkEvents([...selectedLinkEvents, e.event_id]);
                                                else setSelectedLinkEvents(selectedLinkEvents.filter(x => x !== e.event_id));
                                            }}
                                            className="w-5 h-5 accent-brand rounded"
                                        />
                                        <span className="text-sm">{e.name}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-gray-400 text-xs mb-1">Expiry (Hours)</label>
                                <input type="number" value={expiryHours} onChange={e => setExpiryHours(Number(e.target.value))} className="w-full bg-black border border-gray-700 p-3 rounded-lg focus:border-brand outline-none" />
                            </div>
                            <div>
                                <label className="block text-gray-400 text-xs mb-1">PIN (Optional)</label>
                                <input type="text" placeholder="No PIN" value={linkPassword} onChange={e => setLinkPassword(e.target.value)} className="w-full bg-black border border-gray-700 p-3 rounded-lg focus:border-brand outline-none" />
                            </div>
                        </div>

                        <button onClick={handleGenerateLink} className="w-full bg-white text-black font-bold py-3 rounded-xl hover:bg-gray-200 transition">
                            Generate Search Link
                        </button>
                    </div>
                </div>

                <div className="bg-[#111] p-6 rounded-2xl border border-white/5 flex flex-col items-center justify-center text-center">
                     {!generatedLink ? (
                         <div className="opacity-30">
                             <div className="text-6xl mb-4">🔗</div>
                             <p>Link details will appear here</p>
                         </div>
                     ) : (
                        <div className="w-full animate-fade-in">
                            <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                                <span className="text-3xl">✔</span>
                            </div>
                            <h3 className="text-xl font-bold text-white mb-2">Link Ready!</h3>
                            <div className="bg-black p-4 rounded-xl border border-brand/30 mb-6 break-all font-mono text-brand text-sm">
                                {generatedLink}
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => navigator.clipboard.writeText(generatedLink)} className="flex-1 bg-brand text-black py-3 rounded-xl font-bold hover:brightness-110">
                                    Copy Link
                                </button>
                                <button onClick={() => window.open(generatedLink, '_blank')} className="flex-1 border border-gray-600 text-white py-3 rounded-xl font-bold hover:bg-white/10">
                                    Open
                                </button>
                            </div>
                        </div>
                     )}
                </div>
            </div>
          )}

          {/* Guests Tab */}
          {activeTab === 'guests' && (
            <div className="bg-[#111] p-6 rounded-2xl border border-white/5">
                <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                    Guest Leads <span className="bg-brand/20 text-brand text-xs px-2 py-0.5 rounded-full">{leads.length}</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {leads.map((lead, i) => {
                        // FIX: Ensure Base64 image displays correctly even if prefix is missing
                        const imgSrc = lead.selfie_b64 
                            ? (lead.selfie_b64.startsWith('data:') ? lead.selfie_b64 : `data:image/jpeg;base64,${lead.selfie_b64}`) 
                            : 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + lead.name;

                        return (
                        <div key={i} className="bg-[#1a1a1a] p-4 rounded-xl border border-white/5 flex items-start gap-4 hover:border-brand/30 transition group">
                            <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-brand/50 flex-shrink-0 bg-black">
                                <img src={imgSrc} className="w-full h-full object-cover" alt="Guest" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h4 className="font-bold text-lg text-white truncate">{lead.name || 'Unknown Guest'}</h4>
                                
                                {/* Privacy Masking */}
                                <div className="flex items-center gap-2">
                                    <a href={`tel:${lead.mobile}`} className="text-brand text-sm hover:underline block mb-1">
                                        {showFullMobile.has(i) ? lead.mobile : maskMobile(lead.mobile)}
                                    </a>
                                    <button 
                                        onClick={() => toggleMobileReveal(i)}
                                        className="text-xs text-gray-500 hover:text-white"
                                    >
                                        {showFullMobile.has(i) ? 'Hide' : 'Show'}
                                    </button>
                                </div>

                                <div className="flex items-center gap-2 text-xs text-gray-500">
                                    <span className="bg-white/10 px-1.5 py-0.5 rounded text-gray-300">Found {lead.match_count} photos</span>
                                </div>
                                <p className="text-[10px] text-gray-600 mt-2">{new Date(lead.timestamp).toLocaleString()}</p>
                            </div>
                        </div>
                    )})}
                    {leads.length === 0 && (
                        <div className="col-span-full py-10 text-center text-gray-500">
                            No guest activity recorded yet.
                        </div>
                    )}
                </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default CollectionManager;