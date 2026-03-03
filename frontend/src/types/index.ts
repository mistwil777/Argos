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
  confidence_score?: number;
  published_at?: string;
  created_at: string;
  updated_at?: string;
  workspace_id?: number;
}

export interface Course {
  id: number;
  title: string;
  description: string;
  topic: string;
  topics?: string[];
  level: 'beginner' | 'intermediate' | 'advanced';
  status: 'draft' | 'review' | 'published' | 'archived';
  duration?: number;
  qa_score?: number;
  qa_issues?: string[];
  content?: string;
  template_name?: string;
  source_item_id?: number;
  published_at?: string;
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

export interface WorkspaceStats {
  sources_count: number;
  items_count: number;
  knowledge_items_count: number;
  latest_item_date: string | null;
}

export interface Workspace {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  domain: string | null;
  icon: string;
  color: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  stats?: WorkspaceStats;
}

export interface WorkspaceCreate {
  name: string;
  description?: string;
  domain?: string;
  icon?: string;
  color?: string;
}

export interface WorkspaceUpdate {
  name?: string;
  description?: string;
  domain?: string;
  icon?: string;
  color?: string;
  is_active?: boolean;
}

export interface ContentTemplate {
  id: number;
  name: string;
  display_name: string;
  description: string | null;
  content_type: string;
  default_duration_minutes: number;
  expected_sections: string[] | null;
  output_format: string;
}
