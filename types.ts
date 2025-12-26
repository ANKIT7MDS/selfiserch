export interface User {
  sub: string;
  email: string;
  groups: string[];
}

export interface Collection {
  collection_id: string;
  user_id: string;
  name: string;
  created_at: string;
  event_count: number;
  total_photo_count: number;
  total_leads_count?: number;
  storage_bytes: number;
}

export interface EventData {
  event_id: string;
  collection_id: string;
  name: string;
  event_date: string;
  photo_count: number;
  created_at: string;
}

export interface Photo {
  photo_id: string;
  collection_id: string;
  event_id: string;
  url: string;
  thumbnail_url: string;
  created_at: string;
  file_size: number;
  faces: Face[];
  face_ids: string[];
  ai_tags: string[];
}

export interface Face {
  FaceId: string;
  BoundingBox: any;
  Confidence: number;
}

export interface FaceGroup {
  FaceId: string;
  FaceName?: string;
  photoCount: number;
  thumbnail?: string;
  sampleUrl?: string;
  BoundingBox?: any;
}

export interface Lead {
  mobile: string;
  name: string;
  timestamp: string;
  match_count: number;
  selfie_b64?: string;
  selfie_image?: string;
}

export interface AccountStatus {
  storage_limit_bytes: number;
  total_storage_used_bytes: number;
  expiry_date?: string;
}

export interface Photographer {
  user_id: string;
  username: string;
  email: string;
  account_status: string;
  expiry_date: string;
  storage_limit_bytes: number;
  total_storage_used_bytes: number;
}