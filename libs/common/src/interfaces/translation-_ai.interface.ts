export interface FlaskHealthResponse {
  status: string;
  models_loaded?: boolean;
  device?: string;
}

export interface FlaskBatchResponse {
  results: Record<string, string[]>;
}

export interface FlaskSingleResponse {
  variants: string[];
  is_arabic: boolean;
}

export interface FlaskStatsResponse {
  [key: string]: unknown;
}
export interface CachedTransliteration {
  text: string;
  from: string;
  to: string;
  variants: string[];
  createdAt: Date;
}
