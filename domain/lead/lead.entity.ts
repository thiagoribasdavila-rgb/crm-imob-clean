export type Lead = {
  id: string;
  name: string;
  phone: string;
  email?: string;

  status: "new" | "contacted" | "visit" | "closed" | "lost";
  score: number;

  budget?: number;

  source: "meta" | "google" | "organic";
};
