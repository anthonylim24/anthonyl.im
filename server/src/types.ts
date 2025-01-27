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
