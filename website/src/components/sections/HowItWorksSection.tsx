import { motion } from "framer-motion";

const steps = [
  {
    title: "1. Install Locally",
    description: "Initialize TokenOS inside your repository. It safely builds your code AST and saves it locally.",
    code: "npx -y tokenos ."
  },
  {
    title: "2. Load the MCP Server",
    description: "Add TokenOS to your preferred AI IDE or Assistant. It natively supports Claude Desktop, Claude Code, Cursor, and Antigravity.",
    code: "mcp add tokenos npx tokenos start"
  },
  {
    title: "3. Fast Code Intelligence",
    description: "Your assistant now queries the dependency graph and FTS5 search directly, without losing context limit.",
    code: ""
  }
];

export function HowItWorksSection() {
  return (
    <section className="py-24 relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 border-t border-border/50">
      <div className="text-center max-w-3xl mx-auto mb-20">
        <h2 className="text-3xl md:text-5xl font-mono font-extrabold tracking-tight text-white mb-4 uppercase">
          Setup in <span className="text-[#fe6a01]">Minutes</span>.
        </h2>
        <p className="text-lg text-muted-foreground font-sans">
          No cloud connections. Everything stays local in your terminal.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative">
        {/* Connecting Line */}
        <div className="hidden md:block absolute top-12.5 left-[15%] right-[15%] h-px bg-linear-to-r from-transparent via-[#fe6a01]/30 to-transparent" />

        {steps.map((step, idx) => (
          <motion.div 
            key={idx}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: idx * 0.2, duration: 0.5 }}
            className="relative flex flex-col items-center text-center group"
          >
            <div className="w-24 h-24 rounded-full bg-[#030303] border-2 border-border group-hover:border-[#fe6a01]/50 flex items-center justify-center mb-8 relative z-10 transition-colors shadow-xl">
              <span className="text-4xl font-mono text-[#fe6a01]">{idx + 1}</span>
            </div>
            <h3 className="text-2xl font-mono text-white mb-4 uppercase tracking-wide">
              {step.title}
            </h3>
            <p className="text-gray-400 font-sans leading-relaxed px-4">
              {step.description}
            </p>
            {step.code && (
              <div className="mt-6 bg-black border border-white/10 rounded-md py-3 px-4 w-full text-left font-mono text-sm text-gray-300 shadow-inner group-hover:border-[#fe6a01]/40 transition-colors">
                <span className="text-[#fe6a01] mr-2">$</span>
                {step.code}
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </section>
  );
}
