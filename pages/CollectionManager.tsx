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

  // Upload State
  const [files, setFiles] = useState<File[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

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
      alert("Delete functionality requires backend implementation. (Mock Success)");
      // await Api.deletePhotos(Array.from(selectedPhotos));
      // loadData();
      setSelectedPhotos(new Set());
  };

  // --- Upload Logic ---
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const handleUpload = async () => {
    if (!id || !selectedEventId || files.length === 0) return;
    setUploading(true);
    setProgress(0);

    try {
      // 1. Generate URLs
      const filePayload = files.map(f => ({ name: f.name, type: 'image/jpeg' }));
      const { urls } = await Api.generateUploadUrls(id, selectedEventId, filePayload);

      // 2. Upload
      let completed = 0;
      await Promise.all(files.map(async (file, idx) => {
        const urlObj = urls[idx];
        if (urlObj && urlObj.uploadURL) {
          await fetch(urlObj.uploadURL, {
            method: 'PUT',
            body: file,
            headers: { 'Content-Type': 'image/jpeg' }
          });
          completed++;
          setProgress(Math.round((completed / files.length) * 100));
        }
      }));

      alert("Upload Complete! Backend is processing AI tags & Indexing.");
      setFiles([]);
      loadData(); 
    } catch (e) {
      console.error(e);
      alert("Upload failed.");
    } finally {
      setUploading(false);
    }
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
    <div className="min-h-screen bg-dark-bg text-white p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/dashboard')} className="text-gray-400 hover:text-white">
              ← Back
            </button>
            <h1 className="text-2xl font-bold">Collection Manager</h1>
          </div>
          <div className="flex gap-2 bg-dark-card p-1 rounded-lg border border-dark-border overflow-x-auto">
            {['gallery', 'events', 'upload', 'links', 'guests'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`px-4 py-2 rounded-md text-sm font-semibold capitalize transition whitespace-nowrap ${activeTab === tab ? 'bg-brand text-black' : 'text-gray-400 hover:text-white'}`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Content Area */}
        <div className="bg-dark-card border border-dark-border rounded-2xl p-6 min-h-[600px]">
          
          {/* Gallery Tab */}
          {activeTab === 'gallery' && (
            <div>
              {/* Face Filters */}
              <div className="flex overflow-x-auto gap-4 mb-6 pb-2 scrollbar-hide">
                <div 
                    onClick={() => setFilterFaceId(null)}
                    className={`flex flex-col items-center min-w-[70px] cursor-pointer ${!filterFaceId ? 'opacity-100' : 'opacity-50'}`}
                >
                    <div className="w-16 h-16 rounded-full border-2 border-gray-500 bg-gray-800 flex items-center justify-center">All</div>
                    <span className="text-xs mt-1 text-gray-400">All Photos</span>
                </div>
                {faces.map(face => (
                  <div 
                    key={face.FaceId} 
                    onClick={() => setFilterFaceId(face.FaceId)}
                    className={`flex flex-col items-center min-w-[70px] cursor-pointer transition ${filterFaceId === face.FaceId ? 'opacity-100 scale-110' : 'opacity-60 hover:opacity-100'}`}
                  >
                    <img 
                      src={face.thumbnail || face.sampleUrl || 'https://picsum.photos/70'} 
                      className={`w-16 h-16 rounded-full border-2 object-cover ${filterFaceId === face.FaceId ? 'border-brand' : 'border-gray-700'}`} 
                      alt="Face" 
                    />
                    <span className="text-xs mt-1 text-gray-400 truncate w-16 text-center">{face.FaceName || 'Unknown'}</span>
                  </div>
                ))}
              </div>

              {/* Toolbar */}
              <div className="flex justify-between items-center mb-4 bg-black/40 p-3 rounded-lg">
                <div className="flex items-center gap-4">
                    <select 
                        className="bg-black border border-gray-700 rounded p-1 text-sm"
                        value={filterEventId}
                        onChange={(e) => setFilterEventId(e.target.value)}
                    >
                        <option value="All">All Events</option>
                        {events.map(e => <option key={e.event_id} value={e.event_id}>{e.name}</option>)}
                    </select>
                    <span className="text-sm text-gray-400">{displayedPhotos.length} photos</span>
                </div>
                <div className="flex gap-2">
                    <button onClick={selectAllPhotos} className="text-sm border border-gray-600 px-3 py-1 rounded hover:bg-gray-800">
                        {selectedPhotos.size === displayedPhotos.length ? 'Deselect All' : 'Select All'}
                    </button>
                    {selectedPhotos.size > 0 && (
                        <button onClick={handleDeleteSelected} className="text-sm bg-red-500/20 text-red-400 px-3 py-1 rounded hover:bg-red-500/40 border border-red-500/50">
                            Delete ({selectedPhotos.size})
                        </button>
                    )}
                </div>
              </div>
              
              {/* Photo Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {displayedPhotos.map(photo => (
                  <div 
                    key={photo.photo_id} 
                    onClick={() => togglePhotoSelection(photo.photo_id)}
                    className={`aspect-square relative group bg-black rounded-lg overflow-hidden border cursor-pointer transition ${selectedPhotos.has(photo.photo_id) ? 'border-brand' : 'border-dark-border'}`}
                  >
                    <img src={photo.thumbnail_url} loading="lazy" className="w-full h-full object-cover" alt="img" />
                    
                    {/* Checkbox Overlay */}
                    <div className={`absolute top-2 right-2 w-5 h-5 rounded border flex items-center justify-center ${selectedPhotos.has(photo.photo_id) ? 'bg-brand border-brand' : 'bg-black/50 border-white'}`}>
                        {selectedPhotos.has(photo.photo_id) && <span className="text-black text-xs font-bold">✓</span>}
                    </div>

                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2">
                      <a href={photo.url} download onClick={(e) => e.stopPropagation()} className="p-2 bg-white text-black rounded-full hover:bg-brand">⬇</a>
                    </div>
                  </div>
                ))}
              </div>
              {displayedPhotos.length === 0 && <p className="text-center text-gray-500 mt-10">No photos match filters.</p>}
            </div>
          )}

          {/* Events Tab */}
          {activeTab === 'events' && (
            <div>
              <div className="flex justify-end mb-4">
                <button onClick={() => {
                    const name = prompt("Event Name:");
                    const date = prompt("Date (YYYY-MM-DD):", new Date().toISOString().split('T')[0]);
                    if(name && date && id) Api.upsertEvent(id, name, date).then(loadData);
                }} className="bg-brand text-black px-4 py-2 rounded-lg font-bold">+ New Event</button>
              </div>
              <div className="space-y-4">
                {events.map(evt => (
                  <div key={evt.event_id} className="flex items-center justify-between p-4 bg-black/30 rounded-lg border border-dark-border">
                    <div>
                      <h3 className="font-bold">{evt.name}</h3>
                      <p className="text-sm text-gray-400">{evt.event_date} • {evt.photo_count} Photos</p>
                    </div>
                    <button onClick={() => {
                        if(id && confirm("Delete event?")) Api.deleteEvent(id, evt.event_id).then(loadData);
                    }} className="text-red-500 border border-red-500/20 px-3 py-1 rounded hover:bg-red-500/10">Delete</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upload Tab */}
          {activeTab === 'upload' && (
            <div className="max-w-2xl mx-auto text-center">
              <div className="mb-6">
                <label className="block text-left mb-2 text-gray-400">Select Event</label>
                <select 
                  className="w-full bg-black border border-dark-border p-3 rounded-lg outline-none focus:border-brand"
                  value={selectedEventId}
                  onChange={(e) => setSelectedEventId(e.target.value)}
                >
                  <option value="">-- Choose Event --</option>
                  {events.map(e => <option key={e.event_id} value={e.event_id}>{e.name}</option>)}
                </select>
              </div>

              <div className="border-2 border-dashed border-dark-border rounded-2xl p-10 hover:border-brand transition bg-black/20">
                <input type="file" multiple accept="image/*" onChange={handleFileSelect} className="hidden" id="fileUpload" />
                <label htmlFor="fileUpload" className="cursor-pointer">
                  <div className="text-4xl mb-4">☁️</div>
                  <p className="text-xl font-bold">Click to Select Photos</p>
                  <p className="text-gray-500 text-sm mt-2">{files.length} files selected (Max 2000)</p>
                </label>
              </div>

              {files.length > 0 && (
                <div className="mt-6">
                  {uploading ? (
                    <div>
                        <div className="flex justify-between text-xs mb-1">
                            <span>Uploading...</span>
                            <span>{progress}%</span>
                        </div>
                        <div className="w-full bg-gray-700 rounded-full h-4">
                            <div className="bg-brand h-4 rounded-full transition-all" style={{width: `${progress}%`}}></div>
                        </div>
                    </div>
                  ) : (
                    <button onClick={handleUpload} className="bg-brand text-black font-bold px-8 py-3 rounded-full hover:scale-105 transition">
                      Start Upload
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Links Tab */}
          {activeTab === 'links' && (
            <div className="max-w-xl mx-auto">
                <h3 className="text-xl font-bold mb-4">Generate Guest Link</h3>
                <div className="space-y-4">
                    <div>
                        <label className="block text-gray-400 text-sm mb-2">Select Events</label>
                        <div className="max-h-40 overflow-y-auto bg-black p-3 rounded border border-dark-border">
                            {events.map(e => (
                                <label key={e.event_id} className="flex items-center gap-2 mb-2 cursor-pointer">
                                    <input 
                                        type="checkbox" 
                                        checked={selectedLinkEvents.includes(e.event_id)}
                                        onChange={(ch) => {
                                            if(ch.target.checked) setSelectedLinkEvents([...selectedLinkEvents, e.event_id]);
                                            else setSelectedLinkEvents(selectedLinkEvents.filter(x => x !== e.event_id));
                                        }}
                                        className="accent-brand"
                                    />
                                    {e.name}
                                </label>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="block text-gray-400 text-sm mb-2">Expiry (Hours)</label>
                        <input type="number" value={expiryHours} onChange={e => setExpiryHours(Number(e.target.value))} className="w-full bg-black border border-dark-border p-2 rounded" />
                    </div>
                    <div>
                        <label className="block text-gray-400 text-sm mb-2">PIN (Optional)</label>
                        <input type="text" value={linkPassword} onChange={e => setLinkPassword(e.target.value)} className="w-full bg-black border border-dark-border p-2 rounded" />
                    </div>
                    <button onClick={handleGenerateLink} className="w-full bg-brand text-black font-bold py-2 rounded hover:bg-brand-hover">Generate Link</button>
                    
                    {generatedLink && (
                        <div className="mt-4 p-4 bg-brand/10 border border-brand/50 rounded text-center">
                            <p className="text-brand font-mono text-sm break-all mb-2">{generatedLink}</p>
                            <button onClick={() => navigator.clipboard.writeText(generatedLink)} className="bg-brand text-black px-4 py-1 rounded text-sm font-bold">Copy Link</button>
                            <button onClick={() => window.open(generatedLink, '_blank')} className="ml-2 border border-brand text-brand px-4 py-1 rounded text-sm font-bold">Test Link</button>
                        </div>
                    )}
                </div>
            </div>
          )}

          {/* Guests Tab */}
          {activeTab === 'guests' && (
            <div>
                <h3 className="text-xl font-bold mb-6">Guest Activity (Leads)</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {leads.map((lead, i) => (
                        <div key={i} className="bg-black/40 p-4 rounded-xl border border-dark-border flex items-center gap-4 hover:border-brand/50 transition">
                            <img src={lead.selfie_b64 ? (lead.selfie_b64.startsWith('data') ? lead.selfie_b64 : `data:image/jpeg;base64,${lead.selfie_b64}`) : 'https://picsum.photos/50'} className="w-12 h-12 rounded-full object-cover border border-brand" alt="Selfie" />
                            <div>
                                <h4 className="font-bold">{lead.name || 'Guest'}</h4>
                                <p className="text-brand text-sm">{lead.mobile}</p>
                                <p className="text-xs text-gray-500 mt-1">Matched: {lead.match_count} photos</p>
                                <p className="text-xs text-gray-600">{new Date(lead.timestamp).toLocaleString()}</p>
                            </div>
                        </div>
                    ))}
                    {leads.length === 0 && <p className="text-gray-500">No leads yet.</p>}
                </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default CollectionManager;