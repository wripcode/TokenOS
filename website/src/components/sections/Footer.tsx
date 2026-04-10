import { Terminal, Code, Zap } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-[#030303] border-t border-white/5 pt-16 pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 md:gap-8 mb-12">
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center gap-2 text-white mb-4">
              <Terminal className="w-6 h-6 text-[#fe6a01]" />
              <span className="font-mono font-bold text-xl tracking-tight">TokenOS</span>
            </div>
            <p className="text-gray-400 font-sans max-w-sm mb-6">
              Local-first codebase graph intelligence for AI assistants. Powered by SQLite, ts-morph, and Ollama.
            </p>
            <div className="inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs text-blue-400 font-mono">
              <Code className="w-3.5 h-3.5 mr-1.5" />
              Supports TypeScript Only
            </div>
          </div>
          
          <div>
            <h4 className="text-white font-mono font-medium mb-4 uppercase text-sm tracking-wider">Resources</h4>
            <ul className="space-y-3">
              <li>
                <a href="https://github.com/wripcode/TokenOS" target="_blank" rel="noreferrer" className="text-gray-400 hover:text-[#fe6a01] transition-colors text-sm flex items-center gap-2">
                  <Code className="w-4 h-4" /> Source Code
                </a>
              </li>
              <li>
                <a href="https://www.npmjs.com/package/tokenos" target="_blank" rel="noreferrer" className="text-gray-400 hover:text-[#fe6a01] transition-colors text-sm">
                  npm Package
                </a>
              </li>
              <li>
                <a href="https://modelcontextprotocol.io/" target="_blank" rel="noreferrer" className="text-gray-400 hover:text-[#fe6a01] transition-colors text-sm">
                  MCP Standard
                </a>
              </li>
            </ul>
          </div>
          
          <div>
            <h4 className="text-white font-mono font-medium mb-4 uppercase text-sm tracking-wider">Community</h4>
            <ul className="space-y-3">
              <li>
                <a href="https://github.com/wripcode/TokenOS/discussions" target="_blank" rel="noreferrer" className="text-gray-400 hover:text-[#fe6a01] transition-colors text-sm">
                  Discussions
                </a>
              </li>
              <li>
                <a href="https://github.com/wripcode/TokenOS/issues" target="_blank" rel="noreferrer" className="text-gray-400 hover:text-[#fe6a01] transition-colors text-sm">
                  Report an Issue
                </a>
              </li>
            </ul>
          </div>
        </div>
        
        <div className="border-t border-white/5 pt-8 flex flex-col md:flex-row justify-between items-center gap-6 md:gap-4">
          <div className="flex flex-col items-center md:items-start text-center md:text-left">
            <p className="text-gray-400 text-sm font-sans flex items-center justify-center md:justify-start gap-1.5 mb-1">
              Built with <Zap className="w-4 h-4 text-[#fe6a01] fill-[#fe6a01]" /> by <a href="https://github.com/wripcode" target="_blank" rel="noreferrer" className="text-white hover:text-[#fe6a01] transition-colors font-medium">wripcode</a>
            </p>
            <p className="text-gray-500 text-xs font-mono">
              for people who think beyond limits
            </p>
          </div>
          
          <div className="flex flex-col items-center md:items-end gap-2">
            <p className="text-gray-500 text-xs font-sans">
              &copy; {new Date().getFullYear()} TokenOS. Released under the MIT License.
            </p>
            <div className="text-gray-400 text-xs font-mono bg-white/5 px-3 py-1 rounded-full border border-white/10">
              v2.1.0
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
