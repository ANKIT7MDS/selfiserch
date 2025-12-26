import { AccountStatus, Collection, EventData, FaceGroup, Lead, Photo, Photographer } from "../types";

// AWS API Gateway URL
const API_BASE = "https://oel3deh9q3.execute-api.ap-south-1.amazonaws.com/prod";

const getHeaders = (isPublic = false) => {
  const headers: any = {
    'Content-Type': 'application/json'
  };
  const token = localStorage.getItem('idToken');
  // Only add Authorization if NOT public and token exists
  if (token && !isPublic) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

export const Api = {
  // --- Auth & Account ---
  getAccountStatus: async (): Promise<AccountStatus> => {
    const res = await fetch(`${API_BASE}/account-status`, { headers: getHeaders() });
    if (!res.ok) throw new Error("Failed to fetch account status");
    return res.json();
  },

  // --- Collections ---
  getCollections: async (): Promise<{ Items: Collection[], total_photo_count: number }> => {
    const res = await fetch(`${API_BASE}/get-collections`, { headers: getHeaders() });
    if (!res.ok) throw new Error("Failed to fetch collections");
    return res.json();
  },

  upsertCollection: async (name: string, collection_id?: string, custom_theme?: any) => {
    const res = await fetch(`${API_BASE}/upsert-collection`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ name, collection_id, custom_theme })
    });
    if (!res.ok) throw new Error("Failed to save collection");
    return res.json();
  },

  deleteCollection: async (collection_id: string) => {
    const res = await fetch(`${API_BASE}/delete-collection`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ collection_id })
    });
    if (!res.ok) throw new Error("Failed to delete collection");
    return res.json();
  },

  // --- Events ---
  getEvents: async (collection_id: string, isPublic = false): Promise<{ events: EventData[] }> => {
    // IMPORTANT: If isPublic is true, we must ensure the backend accepts unauthenticated requests
    // OR we might need a specific 'public' endpoint. Assuming current endpoint handles it based on payload.
    const res = await fetch(`${API_BASE}/get-events`, {
      method: 'POST',
      headers: getHeaders(isPublic),
      body: JSON.stringify({ collection_id, is_public: isPublic }) 
    });
    if (!res.ok) throw new Error("Failed to fetch events");
    return res.json();
  },

  upsertEvent: async (collection_id: string, name: string, event_date: string, event_id?: string) => {
    const res = await fetch(`${API_BASE}/upsert-event`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ collection_id, name, event_date, event_id })
    });
    if (!res.ok) throw new Error("Failed to save event");
    return res.json();
  },

  deleteEvent: async (collection_id: string, event_id: string) => {
    const res = await fetch(`${API_BASE}/delete-event`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ collection_id, event_id })
    });
    if (!res.ok) throw new Error("Failed to delete event");
    return res.json();
  },

  // --- Photos & Upload ---
  getPhotos: async (collection_id: string): Promise<{ photos: Photo[] }> => {
    const res = await fetch(`${API_BASE}/get-photos`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ collection_id })
    });
    if (!res.ok) throw new Error("Failed to fetch photos");
    return res.json();
  },

  deletePhoto: async (collection_id: string, photo_id: string) => {
    const res = await fetch(`${API_BASE}/delete-photo`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ collection_id, photo_id })
    });
    if (!res.ok) throw new Error("Delete failed");
    return res.json();
  },

  generateUploadUrls: async (collection_id: string, event_id: string, files: { name: string, type: string, size?: number }[]) => {
    const res = await fetch(`${API_BASE}/generate-upload-urls`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ collection_id, event_id, files })
    });
    if (!res.ok) throw new Error("Failed to generate upload URLs");
    return res.json();
  },
  
  generatePublicUploadUrls: async (collection_id: string, event_id: string, files: { name: string, type: string, size?: number }[]) => {
    const res = await fetch(`${API_BASE}/generate-upload-urls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ collection_id, event_id, files, is_public: true }) 
    });
    if (!res.ok) throw new Error("Failed to generate upload URLs");
    return res.json();
  },
  
  getPublicCollectionInfo: async (linkId: string) => {
      const res = await fetch(`${API_BASE}/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ linkId, metadata_only: true })
      });
      return res.json();
  },

  // --- People & Faces ---
  listPeople: async (collection_id: string): Promise<{ people: FaceGroup[] }> => {
    try {
      const res = await fetch(`${API_BASE}/list_people`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ collection_id })
      });
      const data = await res.json();
      // Robust parsing: check all possible keys where backend might send data
      return { people: data.people || data.items || data.faces || [] };
    } catch (e) {
      console.warn("listPeople API failed", e);
      return { people: [] };
    }
  },

  saveFaceName: async (collection_id: string, face_id: string, name: string) => {
    const res = await fetch(`${API_BASE}/save-face-name`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ collection_id, face_id, name })
    });
    if (!res.ok) throw new Error("Failed to save name");
    return res.json();
  },

  // --- Links & Guests ---
  generateLink: async (payload: { collection_id: string, event_ids: string[], expiry_hours: number, password?: string }) => {
    const res = await fetch(`${API_BASE}/generate-search-link`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error("Failed to generate link");
    return res.json();
  },

  getLeads: async (collection_id: string): Promise<Lead[]> => {
    try {
      const res = await fetch(`${API_BASE}/save-details`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ collection_id, action: 'list' })
      });
      if (!res.ok) return [];
      const data = await res.json();
      // Handle various response structures
      if (Array.isArray(data)) return data;
      if (Array.isArray(data.leads)) return data.leads;
      if (Array.isArray(data.items)) return data.items;
      if (Array.isArray(data.body)) return JSON.parse(data.body); // Sometimes AWS returns body as string
      return [];
    } catch (e) {
      console.warn("getLeads error", e);
      return []; 
    }
  },

  // --- Guest Side ---
  findMatches: async (linkId: string, selfieImage: string, pin?: string) => {
    const res = await fetch(`${API_BASE}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linkId, selfieImage, pin })
    });
    if (res.status === 401 || res.status === 403) throw new Error("Invalid PIN");
    if (!res.ok) throw new Error("Search failed");
    return res.json();
  },

  // --- CLIENT SELECTION ---
  getClientGallery: async (linkId: string, pin: string) => {
      // Sending selfieImage as bypass trigger
      const res = await fetch(`${API_BASE}/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
              linkId, 
              pin, 
              mode: 'client_selection',
              selfieImage: "CLIENT_MODE_BYPASS" 
          })
      });
      
      if (res.status === 401 || res.status === 403) throw new Error("INCORRECT_PIN");
      if (!res.ok) throw new Error("GALLERY_ERROR");
      return res.json();
  },

  saveClientSelection: async (linkId: string, selectedPhotoIds: string[]) => {
      const res = await fetch(`${API_BASE}/save-details`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            linkId,
            name: "CLIENT_SELECTION",
            mobile: "0000000000",
            photo_count: selectedPhotoIds.length,
            selfie_image: JSON.stringify(selectedPhotoIds) 
        })
      });
      return res.json();
  },

  saveGuestDetails: async (payload: any) => {
    const res = await fetch(`${API_BASE}/save-details`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return res.json();
  },

  // --- Super Admin ---
  adminListPhotographers: async (): Promise<Photographer[]> => {
    const res = await fetch(`${API_BASE}/master/photographers`, { headers: getHeaders() });
    return res.json();
  },

  adminCreatePhotographer: async (email: string) => {
    const res = await fetch(`${API_BASE}/master/photographer`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ email })
    });
    if (!res.ok) throw new Error("Failed to create photographer");
    return res.json();
  },

  adminUpdatePhotographer: async (user_id: string, data: { storage_limit_bytes?: number, expiry_date?: string, account_status?: string }) => {
    const res = await fetch(`${API_BASE}/master/photographer/${user_id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error("Failed to update photographer");
    return res.json();
  },

  adminDeletePhotographer: async (user_id: string) => {
    const res = await fetch(`${API_BASE}/master/photographer/${user_id}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    if (!res.ok) throw new Error("Failed to delete");
    return res.json();
  }
};