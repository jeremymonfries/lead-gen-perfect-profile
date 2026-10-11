export interface NewsItem { url: string; title: string; description: string | null; publisher: string | null; publishedAt: string | null; extraSnippets: string[]; }
export interface NewsSearchOptions { freshness?: 'pd' | 'pw' | 'pm' | 'py'; count?: number; }
export interface NewsSearchProvider { search(query: string, opts?: NewsSearchOptions): Promise<NewsItem[]>; }
