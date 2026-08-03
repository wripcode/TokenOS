// Shared types for the TokenOS system

export type NodeType =
  | "function"
  | "class"
  | "file"
  | "import"
  | "variable"
  | "component"       // React/JSX component (function that returns JSX)
  | "interface"       // TypeScript interface declaration
  | "type_alias"      // TypeScript type alias
  | "enum"            // TypeScript enum
  | "route";          // Next.js App Router route entry

export type EdgeType =
  | "CALLS"           // function calls another function
  | "IMPORTS"         // file imports a module
  | "EXPORTS"         // file exports a symbol
  | "EXTENDS"         // class extends a base class
  | "IMPLEMENTS"      // class implements an interface
  | "DEFINES"         // file defines a symbol
  | "RENDERS"         // component renders another component (JSX usage)
  | "CONTAINS"        // wrapper component contains a child in JSX tree
  | "TYPE_OF"         // symbol references a type/interface
  | "PART_OF_TAB";    // component belongs to a tab (value from TabsContent)

export interface GraphNode {
  id: string;
  type: NodeType;
  name: string;
  file_path: string;
  summary?: string;
  code_snippet?: string;
  embedding?: string; // JSON-serialized float[]
  meta?: string;      // JSON string: { role?, tab?, feature?, route? }
  hash?: string;
  importance: number;
  created_at?: string;
  updated_at?: string;
}

export interface GraphEdge {
  id?: number;
  from_node: string;
  to_node: string;
  type: EdgeType;
}

export interface ParsedNode {
  id: string;
  type: NodeType;
  name: string;
  file_path: string;
  summary?: string;
  code_snippet?: string;
  meta?: string;      // JSON string: { role?, tab?, feature?, route? }
  hash?: string;
}

export interface ParsedEdge {
  from_node: string;
  to_node: string;
  type: EdgeType;
}

export interface SearchResult extends Omit<GraphNode, "embedding"> {
  similarity?: number;
}

export interface GraphResponse {
  nodes: Array<{
    id: string;
    name: string;
    type: string;
    summary?: string;
    importance?: number;
    meta?: Record<string, any>;
  }>;
  edges: Array<{
    from: string;
    to: string;
    type: string;
  }>;
}

export interface QueryOptions {
  depth?: number;              // default: 1
  includeCode?: boolean;       // default: false
  includeSummary?: boolean;    // default: true
  edgeTypes?: string[];        // filter edges
  nodeTypes?: string[];        // filter nodes
}

export type QueryMode = 
  | "explore"      // broad, shallow
  | "trace"        // deep, focused
  | "dependency"   // imports/exports only
  | "semantic";    // embedding-driven

export interface ConversationMemory {
  id: string;
  title: string;
  summary: string;
  key_points: string[];
  tags: string[];
  created_at: number;
  embedding?: string; // or number[] depending on storage
}

export interface SessionCapture {
  id: string;             // "session::uuid8"
  summary: string;        // What happened this session
  decisions: string[];    // Decisions made
  patterns: string[];     // Patterns learned or reinforced
  next_context: string;   // Where we left off
  tags: string[];
  created_at: number;
}

export interface ProjectProfile {
  id: string;                // "profile::project-hash"
  project_path: string;      // The watchPath this profile belongs to
  summary: string;           // One-paragraph project description
  decisions: string[];       // Deduplicated across all sessions
  patterns: string[];        // Deduplicated across all sessions
  current_state: string;     // Latest next_context from most recent session
  session_count: number;     // How many sessions contributed
  last_distilled_at: number;
  created_at: number;
}
