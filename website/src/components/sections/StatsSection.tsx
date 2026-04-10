import { motion } from "framer-motion";

const stats = [
  { value: "10", label: "Node Types Extracted" },
  { value: "10", label: "Edge Types Mapped" },
  { value: "6", label: "MCP Query Tools" },
  { value: "0", label: "External Services Req." }
];

export function StatsSection() {
  return (
    <section className="py-24 relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 border-t border-border/50">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-8 divide-x divide-border/50">
        {stats.map((stat, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: idx * 0.1, duration: 0.5 }}
            className="flex flex-col items-center justify-center text-center px-4"
          >
            <div className="text-5xl md:text-7xl font-mono font-bold text-[#fe6a01] mb-2">
              {stat.value}
            </div>
            <div className="text-sm md:text-base text-gray-400 font-sans tracking-wide uppercase">
              {stat.label}
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
