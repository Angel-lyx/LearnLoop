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

export interface Material {
  id: number;
  subject_id: number;
  title: string;
  filename: string;
  kind: string;
  size: number;
  page_count: number;
  created_at: string;
}

export interface AnnotationPage {
  page: number;
  payload: string;
  updated_at: string;
}

export interface Variant {
  question: string;
  answer: string;
}

export interface Mistake {
  id: number;
  subject_id: number;
  question: string;
  answer: string;
  error_analysis: string;
  solution: string;
  knowledge_points: string[];
  variants: Variant[];
  status: "unmastered" | "mastered" | "archived" | string;
  created_at: string;
  updated_at: string;
}

export interface Analysis {
  error_analysis: string;
  solution: string;
  knowledge_points: string[];
  variants: Variant[];
}

export interface AISettings {
  configured: boolean;
  model: string;
  base_url: string;
  source: "database" | "environment" | "none";
}

export interface Exam {
  id: number;
  subject_id: number;
  title: string;
  exam_date: string;
  scope: string;
  created_at: string;
  days_left: number;
}

export interface Task {
  id: number;
  subject_id: number | null;
  exam_id: number | null;
  title: string;
  due_date: string;
  done: boolean;
  source: string;
}

export interface MindMapNode {
  id: string;
  topic: string;
  children?: MindMapNode[];
}

export interface MindMapDoc {
  id: number;
  subject_id: number;
  title: string;
  data: { nodeData: MindMapNode };
  created_at: string;
  updated_at: string;
}
