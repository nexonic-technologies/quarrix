export type Candidate = {
  source: 'osm' | 'places' | 'gmaps' | 'import' | 'web' | 'yelp' | 'yellowpages' | 'yell' | 'reddit';
  source_ref: string;
  name: string;
  category: string;
  address: string;
  city: string;
  region: string;
  country: string;
  postcode: string;
  lat: number | null;
  lon: number | null;
  phone: string;
  email: string;
  website: string;
  socials?: Record<string, string>;
  rating?: number | null;
  reviews?: number | null;
  chain?: boolean;
  summary?: string;
  contact_name?: string;
};

export type Progress = (msg: string, found?: number) => void;
