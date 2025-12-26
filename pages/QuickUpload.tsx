import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Api } from '../services/api';
import { EventData } from '../types';

const QuickUpload = () => {
    const { collectionId } = useParams<{ collectionId: string }>();
    const [events, setEvents] = useState<EventData[]>([]);
    const [selectedEventId, setSelectedEventId] = useState("");
    const [files, setFiles] = useState<File[]>([]);
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState("Loading event details...");
    
    useEffect(() => {
        if(collectionId) {
            loadEvents();
        }
    }, [collectionId]);

    const loadEvents = async () => {
        try {
            // Updated to pass true for public access
            const res = await Api.getEvents(collectionId!, true); 
            setEvents(res.events || []);
            setStatus("Ready to upload");
        } catch(e) {
            console.error(e);
            setStatus("Error: Link invalid or expired.");
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) setFiles(Array.from(e.target.files));
    };

    const handleUpload = async () => {
        if (!collectionId || !selectedEventId || files.length === 0) return;
        setUploading(true);
        setProgress(0);
        setStatus("Initializing Upload...");
        
        const BATCH_SIZE = 5;
        const totalFiles = files.length;
        let completedCount = 0;
        
        try {
          for (let i = 0; i < totalFiles; i += BATCH_SIZE) {
              const batch = files.slice(i, i + BATCH_SIZE);
              setStatus(`Uploading batch ${Math.floor(i / BATCH_SIZE) + 1} / ${Math.ceil(totalFiles/BATCH_SIZE)}`);
              
              const filePayload = batch.map(f => ({ name: f.name, type: f.type, size: f.size }));
              // Using the Public wrapper
              const { urls } = await Api.generatePublicUploadUrls(collectionId, selectedEventId, filePayload);
              
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
          setStatus("Upload Complete! You can close this window.");
          setFiles([]);
          alert("All photos uploaded successfully.");
        } catch (e) {
          console.error(e);
          setStatus("Upload Failed. Check connection.");
        } finally {
          setUploading(false);
        }
    };

    if(!collectionId) return <div className="text-white text-center mt-20">Invalid Link</div>;

    return (
        <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-lg bg-[#111] border border-gray-800 p-8 rounded-2xl shadow-2xl">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-brand rounded-full flex items-center justify-center text-black font-bold">☁️</div>
                    <div>
                        <h1 className="text-xl font-bold">Quick Upload Portal</h1>
                        <p className="text-xs text-gray-500">Secure Assistant Access</p>
                    </div>
                </div>

                {status.includes("Error") ? (
                    <div className="text-red-500 bg-red-900/20 p-4 rounded border border-red-500/50">{status}</div>
                ) : (
                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm text-gray-400 mb-2">Select Event Folder</label>
                            <select 
                                value={selectedEventId} 
                                onChange={e => setSelectedEventId(e.target.value)} 
                                className="w-full bg-black border border-gray-700 p-3 rounded-lg text-white focus:border-brand outline-none"
                            >
                                <option value="">-- Choose Event --</option>
                                {events.map(e => <option key={e.event_id} value={e.event_id}>{e.name} ({e.event_date})</option>)}
                            </select>
                        </div>

                        <div className={`border-2 border-dashed rounded-xl p-8 transition flex flex-col items-center justify-center text-center cursor-pointer ${files.length > 0 ? 'border-brand bg-brand/5' : 'border-gray-700 hover:border-gray-500'}`}>
                            <input type="file" multiple accept="image/*" onChange={handleFileSelect} className="hidden" id="q-up" disabled={uploading} />
                            <label htmlFor="q-up" className="cursor-pointer w-full">
                                <div className="text-3xl mb-2">📂</div>
                                <div className="font-bold">Select Photos</div>
                                <div className="text-xs text-gray-500 mt-2">{files.length} files selected</div>
                            </label>
                        </div>

                        {files.length > 0 && !uploading && (
                            <button onClick={handleUpload} className="w-full bg-brand text-black font-bold py-3 rounded-lg hover:brightness-110 shadow-[0_0_15px_rgba(0,230,118,0.3)]">
                                Start Upload
                            </button>
                        )}

                        {uploading && (
                            <div>
                                <div className="flex justify-between text-xs mb-1">
                                    <span className="text-brand font-mono">{status}</span>
                                    <span>{progress}%</span>
                                </div>
                                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                                    <div className="h-full bg-brand transition-all duration-300" style={{width: `${progress}%`}}></div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
            <div className="mt-8 text-xs text-gray-600">EventLens Pro &copy; 2025</div>
        </div>
    );
};

export default QuickUpload;