export interface InvokeRequest {
  prompt: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface DeepseekResponse {
  content: string;
}

export type Bindings = {
  ASSETS: Fetcher;
  GROQ_API_KEY: string;
  KLUSTER_API_KEY: string;
  KLUSTER_API_BASE_URL: string;
  CORS_ORIGIN: string;
  SITE_URL: string;
};
