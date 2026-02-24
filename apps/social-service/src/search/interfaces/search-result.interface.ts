export interface SearchResult<T> {
  data: T[];
  total: number;
  page: number;
  pages: number;
}
