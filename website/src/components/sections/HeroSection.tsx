import React from "react";
import { motion } from "framer-motion";
import { Terminal } from "../ui/terminal";
import { Copy } from "lucide-react";
import { cn } from "@/lib/utils";

const commands = [
  "npx -y tokenos .",
  "AI: \"Does handleLogin call any external API?\"",
  "AI: \"Show me the entire authentication flow\"",
  "AI: \"Where is the database configured?\"",
  "AI: \"Map the data flow from UserContext to the PaymentGateway, exclude UI components, and limit search depth to 5.\""
];

const outputs: Record<number, React.ReactNode[]> = {
  0: [
    <div key="1" className="text-gray-300">✓ Parsed 847 nodes across 142 files</div>,
    <div key="2" className="text-gray-300">✓ Extracted 1,203 edges (CALLS, IMPORTS, RENDERS...)</div>,
    <div key="3" className="text-gray-300">✓ Built FTS5 search index</div>,
    <div key="4" className="text-gray-300">✓ File watcher active — real-time sync</div>,
    <div key="5" className="text-gray-300">✓ MCP server running on stdio</div>,
  ],
  1: [
    <div key="7" className="text-gray-300">TokenOS: Found 3 relevant nodes:</div>,
    <div key="8" className="text-gray-400 pl-4">→ src/auth/login.ts::handleLogin (function)</div>,
    <div key="9" className="text-gray-400 pl-4">→ src/auth/middleware.ts::requireAuth (function)</div>,
    <div key="11" className="text-gray-300 mt-2">TokenOS: Resolving connections...</div>,
    <div key="12" className="text-gray-400 pl-4">→ Yes, it calls: src/api/user.ts::fetchUserProfile</div>,
    <div key="13" className="mt-4 text-emerald-400">Tokens used: 1,250 <span className="text-gray-500">(vs ~80,000 without TokenOS)</span></div>
  ],
  2: [
    <div key="1" className="text-gray-300">TokenOS: Analyzing module graph...</div>,
    <div key="2" className="text-gray-400 pl-4">1. src/app/login/page.tsx (renders form)</div>,
    <div key="3" className="text-gray-400 pl-4">2. src/auth/login.ts (handles request)</div>,
    <div key="4" className="text-gray-400 pl-4">3. src/api/user.ts (fetches user)</div>,
    <div key="5" className="text-gray-400 pl-4">4. src/db/session.ts (creates session cookie)</div>,
    <div key="6" className="mt-4 text-emerald-400">Tokens used: 2,100 <span className="text-gray-500">(vs ~120,000 without TokenOS)</span></div>
  ],
  3: [
    <div key="1" className="text-gray-300">TokenOS: Found configuration node:</div>,
    <div key="2" className="text-gray-400 pl-4">→ src/db/config.ts::dbConfig (variable)</div>,
    <div key="3" className="text-gray-400 pl-4">→ Relies on .env (DATABASE_URL)</div>,
    <div key="4" className="mt-4 text-emerald-400">Tokens used: 850 <span className="text-gray-500">(vs ~40,000 without TokenOS)</span></div>
  ],
  4: [
    <div key="1" className="text-gray-300">TokenOS: Executing constrained subgraph traversal...</div>,
    <div key="2" className="text-gray-400 pl-4">Filters applied: [exclude="ui,components", max_depth=5]</div>,
    <div key="3" className="text-gray-300 mt-2">Target nodes identified:</div>,
    <div key="4" className="text-gray-400 pl-4 space-y-1">
      <div>→ <span className="text-blue-400">src/context/UserContext.tsx</span> (Source)</div>
      <div>→ <span className="text-blue-400">src/services/PaymentGateway.ts</span> (Target)</div>
    </div>,
    <div key="5" className="text-gray-300 mt-3">Shortest path resolved:</div>,
    <div key="6" className="text-gray-400 text-sm font-mono border-l-2 border-[#fe6a01]/30 ml-2 pl-3 py-1 space-y-1">
      <div>1. <span className="text-purple-400">UserContext.tsx</span> :: useUserSession()</div>
      <div>2. <span className="text-purple-400">user.service.ts</span> :: getPaymentToken()</div>
      <div>3. <span className="text-purple-400">api/billing.ts</span>  :: processStripeCharge()</div>
      <div>4. <span className="text-purple-400">PaymentGateway</span>  :: execute()</div>
    </div>,
    <div key="7" className="text-[#fe6a01] mt-3 text-sm italic border border-[#fe6a01]/20 bg-[#fe6a01]/5 inline-block px-3 py-1 rounded">
      "Isolated 4 critical files. Context compressed by 98%."
    </div>,
    <div key="8" className="mt-4 text-emerald-400 font-medium">Tokens used: 1,820 <span className="text-gray-500 font-normal">(vs ~2.1M full-context window)</span></div>
  ]
};

export function HeroSection() {
  const [copied, setCopied] = React.useState(false);
  
  const handleCopy = () => {
    navigator.clipboard.writeText("npx -y tokenos .");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 overflow-hidden z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Background glow behind Hero text */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-150 h-150 bg-[#fe6a01]/10 blur-[120px] rounded-full pointer-events-none" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-8 items-center relative z-20">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="flex flex-col items-start text-left"
        >
          <div className="flex flex-wrap gap-3 mb-8">
            <div className="inline-flex items-center rounded-full border border-[#fe6a01]/30 bg-[#fe6a01]/10 px-3 py-1 text-sm text-[#fe6a01] font-mono backdrop-blur-md">
              <span className="flex h-2 w-2 rounded-full bg-[#fe6a01] mr-2"></span>
              v2.1.0 · MIT Licensed
            </div>
          </div>
          
          <h1 className="text-4xl md:text-5xl lg:text-7xl font-mono font-extrabold tracking-tighter text-white uppercase leading-[1.1] mb-6 shadow-sm">
            Your AI Doesn't Know <br />
            <span className="text-[#fe6a01]">Your Codebase.</span>
          </h1>
          
          <p className="text-xl md:text-2xl text-gray-400 mb-10 max-w-2xl font-sans leading-relaxed">
            TokenOS builds a persistent code graph your AI actually remembers. One command. Zero config. Works offline.
          </p>
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full sm:w-auto">
            <div 
              onClick={handleCopy}
              className="flex items-center justify-between bg-[#111] border border-border rounded-md px-6 py-4 cursor-pointer hover:border-[#fe6a01]/50 transition-colors group font-mono min-w-70"
            >
              <div className="flex items-center text-gray-200">
                <span className="text-[#fe6a01] mr-3">$</span>
                npx -y tokenos .
              </div>
              <Copy className={cn("w-4 h-4 transition-colors", copied ? "text-emerald-500" : "text-gray-500 group-hover:text-white")} />
            </div>
            
            <a 
              href="https://github.com/wripcode/TokenOS" 
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center px-6 py-4 bg-transparent hover:bg-white/5 border border-transparent text-white font-sans font-medium rounded-md transition-colors h-full whitespace-nowrap"
            >
              View on GitHub &rarr;
            </a>
          </div>
        </motion.div>
        
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, delay: 0.2 }}
          className="w-full relative"
        >
          {/* Decorative elements behind terminal */}
          <div className="absolute -inset-1 rounded-xl bg-linear-to-r from-[#fe6a01]/50 to-purple-500/30 blur-lg opacity-30 pointer-events-none" />
          
          <Terminal 
            commands={commands}
            outputs={outputs}
            typingSpeed={60}
            delayBetweenCommands={1500}
            initialDelay={1000}
          />
        </motion.div>
      </div>
    </section>
  );
}
