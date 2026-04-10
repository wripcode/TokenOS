import { Terminal, Code } from "lucide-react";

export function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[#030303]/80 backdrop-blur-md border-b border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="shrink-0 flex items-center">
            <a href="#" className="flex items-center gap-2 text-white hover:text-[#fe6a01] transition-colors">
              <Terminal className="w-6 h-6 text-[#fe6a01]" />
              <span className="font-mono font-bold text-xl tracking-tight">TokenOS</span>
            </a>
          </div>
          
          {/* Desktop Nav */}
          <div className="hidden md:block">
            <div className="ml-10 flex items-center space-x-8">
              <a href="https://github.com/wripcode/TokenOS" target="_blank" rel="noreferrer" className="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-sans font-medium transition-colors flex items-center gap-2">
                <Code className="w-4 h-4" />
                GitHub
              </a>
              <a href="https://github.com/wripcode/TokenOS/discussions" target="_blank" rel="noreferrer" className="text-gray-300 hover:text-[#fe6a01] px-3 py-2 rounded-md text-sm font-sans font-medium transition-colors">
                Discussions
              </a>
            </div>
          </div>
          
          {/* Mobile menu button could be added here if needed, but keeping it minimal for now */}
        </div>
      </div>
    </nav>
  );
}
