import { motion } from "framer-motion";

const tools = [
  { name: "Antigravity IDE", description: "Native integration for autonomous agent coding." },
  { name: "Claude Desktop", description: "Direct MCP connection for desktop intelligence." },
  { name: "Claude Code", description: "Seamless CLI integration for AI pair programming." },
  { name: "Cursor IDE", description: "Enhances Cursor's context with global AST awareness." },
  { name: "Any MCP Client", description: "Built fully standard-compliant for Model Context Protocol." },
];

export function SupportedToolsSection() {
  return (
    <section className="py-24 relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 border-t border-border/50">
      <div className="text-center max-w-3xl mx-auto mb-16">
        <h2 className="text-3xl md:text-5xl font-mono font-extrabold tracking-tight text-white mb-4 uppercase">
          Universal <span className="text-[#fe6a01]">Compatibility</span>.
        </h2>
        <p className="text-lg text-muted-foreground font-sans">
          Built natively on the Model Context Protocol (MCP). If your AI speaks MCP, it speaks TokenOS.
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-6">
        {tools.map((tool, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: idx * 0.1, duration: 0.5 }}
            className="bg-[#080808] border border-border/50 hover:border-[#fe6a01]/50 transition-colors p-6 rounded-lg w-full sm:w-[calc(50%-12px)] lg:w-[calc(33.333%-16px)]"
          >
            <h3 className="text-xl font-mono text-white mb-2">{tool.name}</h3>
            <p className="text-sm text-gray-400 font-sans">{tool.description}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
