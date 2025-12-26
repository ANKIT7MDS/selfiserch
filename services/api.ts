import { AccountStatus, Collection, EventData, FaceGroup, Lead, Photo, Photographer } from "../types";

// AWS API Gateway URL
const API_BASE = "https://oel3deh9q3.execute-api.ap-south-1.amazonaws.com/prod";

const getHeaders = () => {
  const token = localStorage.getItem('idToken');
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
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

  upsertCollection: async (name: string, collection_id?: string) => {
    const res = await fetch(`${API_BASE}/upsert-collection`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ name, collection_id })
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
  getEvents: async (collection_id: string): Promise<{ events: EventData[] }> => {
    const res = await fetch(`${API_BASE}/get-events`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ collection_id })
    });
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

  generateUploadUrls: async (collection_id: string, event_id: string, files: { name: string, type: string, size?: number }[]) => {
    const res = await fetch(`${API_BASE}/generate-upload-urls`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ collection_id, event_id, files })
    });
    if (!res.ok) throw new Error("Failed to generate upload URLs");
    return res.json();
  },

  // --- People & Faces ---
  listPeople: async (collection_id: string): Promise<{ people: FaceGroup[] }> => {
    const res = await fetch(`${API_BASE}/list_people`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ collection_id })
    });
    return res.json();
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
    const res = await fetch(`${API_BASE}/save-details`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ collection_id, action: 'list' })
    });
    if (!res.ok) throw new Error("Failed to fetch leads");
    return res.json();
  },

  // --- Guest Side (No Auth Header usually, or minimal) ---
  // Updated to include PIN
  findMatches: async (linkId: string, selfieImage: string, pin?: string) => {
    const res = await fetch(`${API_BASE}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linkId, selfieImage, pin }) // Passing PIN here
    });
    if (res.status === 401 || res.status === 403) {
        throw new Error("Invalid PIN");
    }
    if (!res.ok) throw new Error("Search failed");
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

  // NEW: Update Photographer (Edit Limits/Status)
  adminUpdatePhotographer: async (user_id: string, data: { storage_limit_bytes?: number, expiry_date?: string, account_status?: string }) => {
    const res = await fetch(`${API_BASE}/master/photographer/${user_id}`, {
      method: 'PUT', // Assuming PUT for update, adjust if backend uses POST
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