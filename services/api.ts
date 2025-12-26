import { AccountStatus, Collection, EventData, FaceGroup, Lead, Photo, Photographer } from "../types";

// AWS API Gateway URL
const API_BASE = "https://oel3deh9q3.execute-api.ap-south-1.amazonaws.com/prod";

const getHeaders = (isPublic = false) => {
  const headers: any = {
    'Content-Type': 'application/json'
  };
  if (!isPublic) {
      const token = localStorage.getItem('idToken');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
  }
  return headers;
};

// HELPER: Robust AWS Lambda Response Parser
// Extracts actual data from nested "body" strings or diverse JSON structures
const parseAwsResponse = async (res: Response) => {
    const raw = await res.json();
    let data = raw;
    
    // 1. Unwrap Lambda Proxy "body" if it's a string
    if (raw && raw.body && typeof raw.body === 'string') {
        try {
            data = JSON.parse(raw.body);
        } catch(e) {
            console.warn("Failed to parse body string", e);
            // If body is not JSON, use raw
        }
    } else if (raw && raw.body) {
        // If body is already an object
        data = raw.body;
    }

    return data;
};

// HELPER: Normalize Keys (DynamoDB Capitalized Keys -> Lowercase)
const normalizeItem = (item: any) => {
    if (!item || typeof item !== 'object') return item;
    const newItem: any = {};
    Object.keys(item).forEach(key => {
        // Convert 'Name' -> 'name', 'Mobile' -> 'mobile', etc.
        const lowerKey = key.toLowerCase();
        // Handle specific mappings if needed, else just lowercase
        if (key === 'FaceId' || key === 'face_id') newItem['face_id'] = item[key];
        else if (key === 'FaceName' || key === 'name') newItem['name'] = item[key] || newItem['name']; // prioritize existing
        else newItem[lowerKey] = item[key];
        
        // Preserve CamelCase for specific fields if types require it, or map correctly
        if (lowerKey === 'faceid') newItem['FaceId'] = item[key];
        if (lowerKey === 'timestamp' || lowerKey === 'created_at') newItem['timestamp'] = item[key];
        if (lowerKey === 'match_count') newItem['match_count'] = Number(item[key]);
    });
    // Ensure critical fields exist
    if (!newItem.mobile && item.Mobile) newItem.mobile = item.Mobile;
    if (!newItem.name && item.Name) newItem.name = item.Name;
    return newItem;
};

const DUMMY_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAFhAJ/wlseKgAAAABJRU5ErkJggg==";

export const Api = {
  // --- Auth & Account ---
  getAccountStatus: async (): Promise<AccountStatus> => {
    const res = await fetch(`${API_BASE}/account-status`, { headers: getHeaders() });
    if (!res.ok) throw new Error("Failed to fetch account status");
    return parseAwsResponse(res);
  },

  // --- Collections ---
  getCollections: async (): Promise<{ Items: Collection[], total_photo_count: number }> => {
    const res = await fetch(`${API_BASE}/get-collections`, { headers: getHeaders() });
    if (!res.ok) throw new Error("Failed to fetch collections");
    const data = await parseAwsResponse(res);
    // Standardize return structure
    return {
        Items: Array.isArray(data) ? data : (data.Items || data.collections || []),
        total_photo_count: data.total_photo_count || 0
    };
  },

  upsertCollection: async (name: string, collection_id?: string, custom_theme?: any) => {
    const res = await fetch(`${API_BASE}/upsert-collection`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ name, collection_id, custom_theme })
    });
    if (!res.ok) throw new Error("Failed to save collection");
    return parseAwsResponse(res);
  },

  deleteCollection: async (collection_id: string) => {
    const res = await fetch(`${API_BASE}/delete-collection`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ collection_id })
    });
    if (!res.ok) throw new Error("Failed to delete collection");
    return parseAwsResponse(res);
  },

  // --- Events ---
  getEvents: async (collection_id: string, isPublic = false): Promise<{ events: EventData[] }> => {
    const res = await fetch(`${API_BASE}/get-events`, {
      method: 'POST',
      headers: getHeaders(isPublic),
      body: JSON.stringify({ collection_id, is_public: isPublic }) 
    });
    if (!res.ok) throw new Error("Failed to fetch events");
    const data = await parseAwsResponse(res);
    const list = Array.isArray(data) ? data : (data.events || data.Items || []);
    return { events: list };
  },

  upsertEvent: async (collection_id: string, name: string, event_date: string, event_id?: string) => {
    const res = await fetch(`${API_BASE}/upsert-event`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ collection_id, name, event_date, event_id })
    });
    if (!res.ok) throw new Error("Failed to save event");
    return parseAwsResponse(res);
  },

  deleteEvent: async (collection_id: string, event_id: string) => {
    const res = await fetch(`${API_BASE}/delete-event`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ collection_id, event_id })
    });
    if (!res.ok) throw new Error("Failed to delete event");
    return parseAwsResponse(res);
  },

  // --- Photos & Upload ---
  getPhotos: async (collection_id: string): Promise<{ photos: Photo[] }> => {
    const res = await fetch(`${API_BASE}/get-photos`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ collection_id })
    });
    if (!res.ok) throw new Error("Failed to fetch photos");
    const data = await parseAwsResponse(res);
    const list = Array.isArray(data) ? data : (data.photos || data.Items || []);
    return { photos: list };
  },

  deletePhoto: async (collection_id: string, photo_id: string) => {
    const res = await fetch(`${API_BASE}/delete-photo`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ collection_id, photo_id })
    });
    if (!res.ok) throw new Error("Delete failed");
    return parseAwsResponse(res);
  },

  generateUploadUrls: async (collection_id: string, event_id: string, files: { name: string, type: string, size?: number }[]) => {
    const res = await fetch(`${API_BASE}/generate-upload-urls`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ collection_id, event_id, files })
    });
    if (!res.ok) throw new Error("Failed to generate upload URLs");
    return parseAwsResponse(res);
  },
  
  generatePublicUploadUrls: async (collection_id: string, event_id: string, files: { name: string, type: string, size?: number }[]) => {
    const res = await fetch(`${API_BASE}/generate-upload-urls`, {
      method: 'POST',
      headers: getHeaders(true),
      body: JSON.stringify({ collection_id, event_id, files, is_public: true }) 
    });
    if (!res.ok) throw new Error("Failed to generate upload URLs");
    return parseAwsResponse(res);
  },
  
  getPublicCollectionInfo: async (linkId: string) => {
      const res = await fetch(`${API_BASE}/search`, {
          method: 'POST',
          headers: getHeaders(true),
          body: JSON.stringify({ linkId, metadata_only: true })
      });
      return parseAwsResponse(res);
  },

  // --- People & Faces ---
  listPeople: async (collection_id: string): Promise<{ people: FaceGroup[] }> => {
    try {
      const res = await fetch(`${API_BASE}/list_people`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ collection_id })
      });
      const data = await parseAwsResponse(res);
      // Robustly find the list
      const list = Array.isArray(data) ? data : (data.people || data.items || data.faces || []);
      return { people: list };
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
    return parseAwsResponse(res);
  },

  // --- Links & Guests ---
  generateLink: async (payload: { collection_id: string, event_ids: string[], expiry_hours: number, password?: string }) => {
    // Ensure numbers are actually numbers
    const cleanPayload = {
        ...payload,
        expiry_hours: Number(payload.expiry_hours) || 24
    };
    
    const res = await fetch(`${API_BASE}/generate-search-link`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(cleanPayload)
    });
    if (!res.ok) throw new Error("Failed to generate link");
    return parseAwsResponse(res);
  },

  getLeads: async (collection_id: string): Promise<Lead[]> => {
    try {
      const res = await fetch(`${API_BASE}/save-details`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ collection_id, action: 'list' })
      });
      
      if (!res.ok) return [];

      const data = await parseAwsResponse(res);
      
      // Determine where the array is
      let rawList: any[] = [];
      if (Array.isArray(data)) rawList = data;
      else if (Array.isArray(data.leads)) rawList = data.leads;
      else if (Array.isArray(data.items)) rawList = data.items;
      else if (Array.isArray(data.Items)) rawList = data.Items; // DynamoDB style

      // Normalize all items to ensure UI gets lowercase keys (name, mobile, etc.)
      return rawList.map(normalizeItem);
      
    } catch (e) {
      console.warn("getLeads error", e);
      return []; 
    }
  },

  // --- Guest Side (PUBLIC) ---
  findMatches: async (linkId: string, selfieImage: string, pin?: string) => {
    const res = await fetch(`${API_BASE}/search`, {
      method: 'POST',
      headers: getHeaders(true), 
      body: JSON.stringify({ linkId, selfieImage, pin })
    });
    if (res.status === 401 || res.status === 403) throw new Error("Invalid PIN");
    if (!res.ok) throw new Error("Search failed");
    return parseAwsResponse(res);
  },

  // --- CLIENT SELECTION (PUBLIC) ---
  getClientGallery: async (linkId: string, pin: string) => {
      const res = await fetch(`${API_BASE}/search`, {
          method: 'POST',
          headers: getHeaders(true),
          body: JSON.stringify({ 
              linkId, 
              pin, 
              mode: 'client_selection',
              selfieImage: DUMMY_IMAGE 
          })
      });
      
      if (res.status === 401 || res.status === 403) throw new Error("INCORRECT_PIN");
      if (!res.ok) throw new Error("GALLERY_ERROR");
      return parseAwsResponse(res);
  },

  saveClientSelection: async (linkId: string, selectedPhotoIds: string[]) => {
      const res = await fetch(`${API_BASE}/save-details`, {
        method: 'POST',
        headers: getHeaders(true),
        body: JSON.stringify({
            linkId,
            name: "CLIENT_SELECTION",
            mobile: "0000000000",
            photo_count: selectedPhotoIds.length,
            selfie_image: JSON.stringify(selectedPhotoIds) 
        })
      });
      return parseAwsResponse(res);
  },

  saveGuestDetails: async (payload: any) => {
    const res = await fetch(`${API_BASE}/save-details`, {
      method: 'POST',
      headers: getHeaders(true),
      body: JSON.stringify(payload)
    });
    return parseAwsResponse(res);
  },

  // --- Super Admin ---
  adminListPhotographers: async (): Promise<Photographer[]> => {
    const res = await fetch(`${API_BASE}/master/photographers`, { headers: getHeaders() });
    const data = await parseAwsResponse(res);
    return Array.isArray(data) ? data : (data.photographers || []);
  },

  adminCreatePhotographer: async (email: string) => {
    const res = await fetch(`${API_BASE}/master/photographer`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ email })
    });
    if (!res.ok) throw new Error("Failed to create photographer");
    return parseAwsResponse(res);
  },

  adminUpdatePhotographer: async (user_id: string, data: { storage_limit_bytes?: number, expiry_date?: string, account_status?: string }) => {
    const res = await fetch(`${API_BASE}/master/photographer/${user_id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error("Failed to update photographer");
    return parseAwsResponse(res);
  },

  adminDeletePhotographer: async (user_id: string) => {
    const res = await fetch(`${API_BASE}/master/photographer/${user_id}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    if (!res.ok) throw new Error("Failed to delete");
    return parseAwsResponse(res);
  }
};