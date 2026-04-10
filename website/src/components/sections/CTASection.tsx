import React from "react";
import { motion } from "framer-motion";
import { Copy } from "lucide-react";

export function CTASection() {
  const [copied, setCopied] = React.useState(false);
  
  const handleCopy = () => {
    navigator.clipboard.writeText("npx -y tokenos .");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="py-32 relative z-10 w-full bg-[#fe6a01] flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#000_1px,transparent_1px)] bg-size-[16px_16px]" />
      
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-20">
        <motion.h2 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-4xl md:text-7xl font-mono tracking-tighter text-[#030303] mb-6 uppercase leading-none"
        >
          One Command.<br/>Infinite Context.
        </motion.h2>
        
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className="text-xl md:text-2xl text-[#030303]/80 font-sans mb-12 max-w-2xl mx-auto"
        >
          Stop paying for your AI's amnesia. Give it a brain that remembers.
        </motion.p>
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <div 
            onClick={handleCopy}
            className="flex items-center justify-between bg-[#030303] text-white rounded-md px-8 py-5 cursor-pointer hover:bg-black transition-colors group font-mono text-lg shadow-2xl min-w-75"
          >
            <div className="flex items-center">
              <span className="text-[#fe6a01] mr-3">$</span>
              npx -y tokenos .
            </div>
            <Copy className={`w-5 h-5 ml-4 transition-colors ${copied ? "text-emerald-500" : "text-gray-500 group-hover:text-white"}`} />
          </div>
          
          <a 
            href="https://github.com/wripcode/TokenOS" 
            target="_blank"
            rel="noreferrer"
            className="flex items-center px-8 py-5 bg-transparent border-2 border-[#030303] text-[#030303] hover:bg-[#030303] hover:text-white font-sans font-bold rounded-md transition-colors text-lg"
          >
            Star on GitHub
          </a>
        </motion.div>
      </div>
    </section>
  );
}
