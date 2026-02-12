export interface SearchStrategy<T = any> {
  search(
    query: any,
    skip?: number,
    limit?: number,
    sortBy?: string,
    order?: 'asc' | 'desc',
  ): Promise<T>;
}
