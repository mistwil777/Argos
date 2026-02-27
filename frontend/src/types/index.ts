export interface Item {
  id: number;
  title: string;
  summary: string;
  url: string;
  source_type: string;
  source_url: string;
  topics?: string[];
  subject?: string;
  importance?: string;
  item_type?: string;
  status?: 'pending' | 'classified' | 'rejected';
  classification_status: 'pending' | 'classified' | 'rejected';
  published_at?: string;
  created_at: string;
  updated_at?: string;
}

export interface Course {
  id: number;
  title: string;
  description: string;
  topic: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  status: 'draft' | 'review' | 'published' | 'archived';
  duration?: number;
  qa_score?: number;
  qa_issues?: any[];
  content?: string;
  created_at: string;
  updated_at?: string;
}

export interface CourseSection {
  section_number: number;
  title: string;
  content: string;
  learning_objectives?: string[];
  exercises?: any[];
}

export interface Source {
  course_id: number;
  title: string;
  chunk_text: string;
  _distance?: number;
}

export interface RAGResult {
  success: boolean;
  query: string;
  answer?: string;
  sources?: Source[];
  confidence_score?: number;
  error?: string;
}

export interface Stats {
  total_items: number;
  classified_items: number;
  pending_items: number;
  total_courses: number;
  published_courses: number;
  draft_courses: number;
  total_cost: number;
  cost_this_month: number;
}

export interface Decision {
  id: number;
  item_id?: number;
  course_id?: number;
  decision_type: string;
  decision: string;
  decided_by: string;
  decided_at: string;
  metadata?: any;
}

export interface TopicStat {
  topic: string;
  item_count: number;
  course_count: number;
}

export interface TimelineData {
  date: string;
  items_collected: number;
  items_classified: number;
  courses_generated: number;
}

export interface CostData {
  date: string;
  classifier_cost: number;
  course_generator_cost: number;
  rag_cost: number;
  total: number;
}
