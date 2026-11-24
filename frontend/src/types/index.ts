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
  detail?: string;
  resources?: { title: string; url: string }[];
}

export interface PlanQuiz {
  question: string;
  answer: string;
}

export interface PlanCoverage {
  topic: string;
  date: string | null;
  /** 高频 / 中频 / 低频，模型没给时为空串 */
  weight: string;
}

export interface AIPlanDay {
  date: string;
  focus: string;
  goal: string;
  /** 考点速览：直接可背的结论、公式、判别法 */
  notes: string[];
  pitfalls: string[];
  quiz: PlanQuiz[];
  tasks: { title: string; detail: string; minutes: number }[];
  resources: { title: string; url: string }[];
}

export interface AIPlan {
  summary: string;
  /** 资料来源说明，例如「已参考 6 条网络资料」 */
  source_note: string;
  /** 考试范围 → 日期 → 考频 的覆盖表 */
  coverage: PlanCoverage[];
  days: AIPlanDay[];
  tasks: Task[];
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

export type Dimension = "德" | "智" | "体" | "美" | "劳";

export interface Course {
  id: number;
  name: string;
  credits: number;
  score: number;
  category: "required" | "elective";
  term: string;
}

export interface ScoreRule {
  id: number;
  dimension: Dimension;
  name: string;
  score: number;
}

export interface BonusItem {
  id: number;
  dimension: Dimension;
  title: string;
  score: number;
  note: string;
}

export interface ResearchOverview {
  courses: {
    count: number;
    credits: number;
    weighted_average: number;
    gpa: number;
  };
  zongce: {
    dimensions: Record<string, number>;
    total: number;
  };
  composite: {
    course_weight: number;
    course_score: number;
    zongce_score: number;
    score: number;
  };
}
