export type NewsItem = {
  id: string;
  title: string;
  link?: string;
  summary?: string;
  source?: string;
  pubMs?: number;
};

export type NewsResponse = {
  items: NewsItem[];
  fetchedAt: number;
  error?: string;
};
