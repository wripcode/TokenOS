import { motion } from "framer-motion";
import { AlertCircle, Brain, Search, Clock } from "lucide-react";

export function ProblemSection() {
  return (
    <section className="py-24 relative z-10 w-full bg-[#0a0a0a] border-y border-border/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8 }}
          >
            <h2 className="text-3xl md:text-5xl font-mono font-extrabold tracking-tight text-white mb-4 uppercase">
              The <span className="text-red-500">Token</span> Death Spiral.
            </h2>
            <div className="space-y-6 text-lg text-gray-400 font-sans leading-relaxed">
              <p>
                You start a new chat with Claude. It asks to analyze your files. You say yes.
                It reads 40 files, burns 50,000 tokens, and context window is already half full before you even ask a question.
              </p>
              <p>
                Next chat? Same thing. Again. And again.
              </p>
              <p className="text-xl text-white font-medium pl-6 border-l-2 border-[#fe6a01]">
                You're not paying for intelligence.<br />
                You're paying for amnesia.
              </p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="grid grid-cols-1 sm:grid-cols-2 gap-4"
          >
            <div className="bg-[#111] p-6 border border-red-500/20 rounded-lg flex flex-col items-start gap-4">
              <div className="p-3 bg-red-500/10 rounded-full text-red-500">
                <Brain className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-white font-mono font-medium mb-1">Zero Memory</h4>
                <p className="text-sm text-gray-500">Every AI chat starts from zero. It has no structural awareness of your code.</p>
              </div>
            </div>

            <div className="bg-[#111] p-6 border border-red-500/20 rounded-lg flex flex-col items-start gap-4">
              <div className="p-3 bg-red-500/10 rounded-full text-red-500">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-white font-mono font-medium mb-1">Redundant Processing</h4>
                <p className="text-sm text-gray-500">Your AI redundantly parses identical files across every single conversation.</p>
              </div>
            </div>

            <div className="bg-[#111] p-6 border border-red-500/20 rounded-lg flex flex-col items-start gap-4 mt-0 sm:mt-8">
              <div className="p-3 bg-red-500/10 rounded-full text-red-500">
                <Search className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-white font-mono font-medium mb-1">Blind Searching</h4>
                <p className="text-sm text-gray-500">Finding code means guessing file names. No semantic or relationship search.</p>
              </div>
            </div>

            <div className="bg-[#111] p-6 border border-red-500/20 rounded-lg flex flex-col items-start gap-4 mt-0 sm:mt-8">
              <div className="p-3 bg-red-500/10 rounded-full text-red-500">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-white font-mono font-medium mb-1">Black Box</h4>
                <p className="text-sm text-gray-500">You have no visibility into what the AI actually "knows" or indexes about the project.</p>
              </div>
            </div>
          </motion.div>

        </div>
      </div>
    </section>
  );
}
