import React from "react";
import { CanvasRevealEffect } from "../ui/canvas-reveal-effect";
import { 
  Database, 
  Search, 
  RefreshCw, 
  Terminal, 
  WifiOff, 
  Code 
} from "lucide-react";

// TokenOS real features matching the implementation plan
const features = [
  {
    title: "Structural Intelligence",
    description: "Parses your TypeScript/TSX into a dependency graph with 10 node types and 10 edge types. Not logs — a live map of how your code connects.",
    icon: <Database className="w-6 h-6 text-[#fe6a01]" />,
    colors: [[254, 106, 1]], // #fe6a01
  },
  {
    title: "Find Anything, Instantly",
    description: "FTS5 full-text search built into SQLite. Add Ollama for concept-level semantic search. Finds loginUser() when you ask for 'authentication handler'.",
    icon: <Search className="w-6 h-6 text-[#fe6a01]" />,
    colors: [[254, 106, 1], [0, 255, 128]], 
  },
  {
    title: "Always Up To Date",
    description: "Chokidar file watcher detects changes instantly. Hash-based skip means only changed files are re-indexed. Your graph is always current.",
    icon: <RefreshCw className="w-6 h-6 text-[#fe6a01]" />,
    colors: [[254, 106, 1], [255, 255, 0]],
  },
  {
    title: "Works With Your Tools",
    description: "Native MCP protocol — works with Claude, Cursor, Antigravity, and any MCP-compatible client. 6 powerful query tools over stdio.",
    icon: <Terminal className="w-6 h-6 text-[#fe6a01]" />,
    colors: [[0, 255, 255], [254, 106, 1]],
  },
  {
    title: "No Cloud. No API Keys.",
    description: "SQLite database lives in your project. FTS5 search needs zero external services. Ollama adds semantic search but isn't required.",
    icon: <WifiOff className="w-6 h-6 text-[#fe6a01]" />,
    colors: [[128, 128, 128]],
  },
  {
    title: "MIT Licensed. Hackable.",
    description: "Full source on GitHub. Extend, fork, contribute. Built with TypeScript, ts-morph, and better-sqlite3.",
    icon: <Code className="w-6 h-6 text-[#fe6a01]" />,
    colors: [[254, 106, 1], [255, 255, 255]],
  }
];

export function FeaturesSection() {
  return (
    <section className="py-24 relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center max-w-3xl mx-auto mb-16">
        <h2 className="text-3xl md:text-5xl font-mono font-extrabold tracking-tight text-white mb-4 uppercase">
          Everything <span className="text-[#fe6a01]">TokenOS</span> Knows.
        </h2>
        <p className="text-lg text-muted-foreground font-sans">
          The structural graph gives your AI assistants persistent memory of your codebase.
        </p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative z-20">
        {features.map((feature, idx) => (
          <FeatureCard 
            key={idx} 
            title={feature.title} 
            description={feature.description}
            icon={feature.icon}
            colors={feature.colors}
          />
        ))}
      </div>
    </section>
  );
}

const FeatureCard = ({
  title,
  description,
  icon,
  colors,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  colors: number[][];
}) => {
  return (
    <div
      className="border border-border/50 group/canvas-card flex flex-col items-center justify-center bg-[#070707] min-h-75 w-full p-6 relative overflow-hidden transition-colors duration-500 hover:border-[#fe6a01]/50"
    >
      <div className="absolute inset-0 w-full h-full opacity-0 group-hover/canvas-card:opacity-100 transition-opacity duration-700 ease-in-out">
        <CanvasRevealEffect
          animationSpeed={3}
          containerClassName="bg-transparent"
          colors={colors}
          dotSize={2}
          showGradient={true}
        />
      </div>

      <div className="relative z-20 flex flex-col items-start w-full h-full">
        <div className="w-12 h-12 rounded-lg bg-[#fe6a01]/10 flex items-center justify-center mb-6 group-hover/canvas-card:-translate-y-2 transition-transform duration-500 border border-[#fe6a01]/20 backdrop-blur-md">
          {icon}
        </div>
        <h3 className="text-xl font-mono text-white mt-auto mb-2 group-hover/canvas-card:-translate-y-2 transition-transform duration-500 delay-75">
          {title}
        </h3>
        <p className="text-sm text-gray-400 font-sans leading-relaxed group-hover/canvas-card:-translate-y-2 transition-transform duration-500 delay-100">
          {description}
        </p>
      </div>
    </div>
  );
};
