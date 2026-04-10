import { motion } from "framer-motion";
import { Database, Search } from "lucide-react";

export function EmbeddingsSection() {
  return (
    <section className="py-24 relative z-10 w-full bg-[#050505] border-t border-b border-border/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <h2 className="text-3xl md:text-5xl font-mono font-extrabold tracking-tight text-white mb-6 uppercase">
              Semantic power, <span className="text-[#fe6a01]">your choice</span>.
            </h2>
            <p className="text-lg text-gray-400 font-sans mb-8 leading-relaxed">
              TokenOS is designed to be lightweight. Out of the box, it relies on lighting-fast FTS5 SQLite text search. But when you need conceptual understanding, you can opt-in to vector embeddings effortlessly.
            </p>
            
            <div className="space-y-8">
              <div className="flex gap-4">
                <div className="shrink-0 flex items-center justify-center w-12 h-12 mt-1 rounded-md bg-[#111] border border-border">
                  <Database className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h4 className="text-xl font-mono text-white mb-2">Without Ollama (Default)</h4>
                  <p className="text-gray-500 font-sans text-sm">Uses SQLite FTS5 for instant keyword matching and structural graph queries. Zero overhead, zero external dependencies, massive performance.</p>
                </div>
              </div>
              
              <div className="flex gap-4">
                <div className="shrink-0 flex items-center justify-center w-12 h-12 mt-1 rounded-md bg-[#fe6a01]/10 border border-[#fe6a01]/30">
                  <Search className="w-5 h-5 text-[#fe6a01]" />
                </div>
                <div>
                  <h4 className="text-xl font-mono text-white mb-2">With Ollama (Opt-in)</h4>
                  <p className="text-gray-500 font-sans text-sm">Connects to your local Ollama instance to generate vector embeddings. Allows your AI to find code conceptually, e.g., finding <code className="bg-black px-1 rounded text-[#fe6a01]">loginUser()</code> when searching for "auth handler".</p>
                </div>
              </div>
            </div>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="bg-[#000] border border-border rounded-xl p-6 font-mono text-sm shadow-2xl relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#fe6a01]/10 blur-3xl rounded-full" />
            <div className="text-gray-400 mb-4 border-b border-white/10 pb-2"># .tokenos/config.json</div>
            <div className="text-emerald-400 mb-2">// Default config</div>
            <div className="text-gray-300 mb-6">
              &#123;<br/>
              &nbsp;&nbsp;"embeddings": &#123;<br/>
              &nbsp;&nbsp;&nbsp;&nbsp;"enabled": <span className="text-[#fe6a01]">false</span>,<br/>
              &nbsp;&nbsp;&nbsp;&nbsp;"provider": "ollama",<br/>
              &nbsp;&nbsp;&nbsp;&nbsp;"model": "nomic-embed-text"<br/>
              &nbsp;&nbsp;&#125;<br/>
              &#125;
            </div>
            
            <div className="text-emerald-400 mb-2">// Opt-in semantic search</div>
            <div className="text-gray-300">
              &#123;<br/>
              &nbsp;&nbsp;"embeddings": &#123;<br/>
              &nbsp;&nbsp;&nbsp;&nbsp;"enabled": <span className="text-emerald-500">true</span>,<br/>
              &nbsp;&nbsp;&nbsp;&nbsp;"provider": "ollama",<br/>
              &nbsp;&nbsp;&nbsp;&nbsp;"model": "nomic-embed-text"<br/>
              &nbsp;&nbsp;&#125;<br/>
              &#125;
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
