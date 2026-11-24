export interface Subject {
  id: number;
  name: string;
  color: string;
  icon: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface SubjectInput {
  name: string;
  color: string;
}
