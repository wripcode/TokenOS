import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface TerminalProps {
  commands?: string[];
  outputs?: Record<number, React.ReactNode[]>;
  className?: string;
  typingSpeed?: number;
  delayBetweenCommands?: number;
  initialDelay?: number;
  enableSound?: boolean;
  autoPlay?: boolean;
}

export function Terminal({ 
  commands = [], 
  outputs = {},
  className, 
  typingSpeed = 50, 
  delayBetweenCommands = 800, 
  initialDelay = 500, 
  autoPlay = true 
}: TerminalProps) {
  const [currentCommandIndex, setCurrentCommandIndex] = useState(0);
  const [typedCommand, setTypedCommand] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [hasStarted, setHasStarted] = useState(!autoPlay);
  const [history, setHistory] = useState<{ command: string; output?: React.ReactNode[] }[]>([]);
  const [isDone, setIsDone] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Auto scroll
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [typedCommand, history, currentCommandIndex, isTyping]);

  useEffect(() => {
    if (!autoPlay) {
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting) {
            setTimeout(() => setHasStarted(true), initialDelay);
            observer.disconnect();
          }
        },
        { threshold: 0.5 }
      );

      if (terminalRef.current) {
        observer.observe(terminalRef.current);
      }
      return () => observer.disconnect();
    } else {
      const timeout = setTimeout(() => setHasStarted(true), initialDelay);
      return () => clearTimeout(timeout);
    }
  }, [autoPlay, initialDelay]);

  useEffect(() => {
    if (!hasStarted || isDone || commands.length === 0) return;

    const currentCommand = commands[currentCommandIndex];
    if (!currentCommand) return;

    if (typedCommand.length < currentCommand.length) {
      setIsTyping(true);
      const timeout = setTimeout(() => {
        setTypedCommand(currentCommand.slice(0, typedCommand.length + 1));
      }, typingSpeed + Math.random() * 40);
      return () => clearTimeout(timeout);
    } else {
      setIsTyping(false);
      const timeout = setTimeout(() => {
        setHistory((prev) => [
          ...prev,
          {
            command: currentCommand,
            output: outputs[currentCommandIndex],
          },
        ]);
        setTypedCommand("");
        if (currentCommandIndex < commands.length - 1) {
          setCurrentCommandIndex((prev) => prev + 1);
        } else {
          setIsDone(true);
        }
      }, delayBetweenCommands);
      return () => clearTimeout(timeout);
    }
  }, [typedCommand, currentCommandIndex, commands, hasStarted, isDone, outputs, typingSpeed, delayBetweenCommands]);

  return (
    <div
      ref={terminalRef}
      className={cn(
        "w-full max-w-3xl mx-auto rounded-xl overflow-hidden border border-border bg-[#030303]/80 backdrop-blur-xl shadow-2xl font-mono text-sm",
        className
      )}
    >
      {/* Terminal Header */}
      <div className="flex items-center px-4 py-3 border-b border-border bg-[#080808]">
        <div className="flex space-x-2">
          <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500/50" />
          <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/50" />
        </div>
        <div className="flex-1 text-center text-xs text-muted-foreground font-sans">
          bash — TokenOS Session
        </div>
      </div>

      {/* Terminal Body */}
      <div 
        ref={bodyRef}
        className="p-4 sm:p-6 min-h-75 max-h-100 overflow-y-auto text-gray-300 scroll-smooth"
      >
        {history.map((item, idx) => {
          const isAI = item.command.startsWith("AI:");
          return (
            <div key={idx} className="mb-4">
              {isAI ? (
                <div className="flex items-start mt-4">
                  <span className="text-[#fe6a01] font-bold mr-2">&gt;</span>
                  <span className="text-[#fe6a01] font-bold">{item.command}</span>
                </div>
              ) : (
                <div className="flex items-start">
                  <span className="text-[#fe6a01] mr-2">$</span>
                  <span className="text-gray-100">{item.command}</span>
                </div>
              )}
              {item.output && (
                <div className="mt-2 space-y-1">
                  {item.output.map((line, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.1 }}
                      onAnimationComplete={() => {
                        // Keep scroll locked to bottom as lines appear
                        if (bodyRef.current) {
                          bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
                        }
                      }}
                    >
                      {line}
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {!isDone && hasStarted && commands[currentCommandIndex] && (
          commands[currentCommandIndex].startsWith("AI:") ? (
            <div className="flex items-start mt-4">
              <span className="text-[#fe6a01] font-bold mr-2">&gt;</span>
              <span className="text-[#fe6a01] font-bold">{typedCommand}</span>
              {isTyping && (
                <motion.span
                  animate={{ opacity: [1, 0] }}
                  transition={{ repeat: Infinity, duration: 0.8 }}
                  className="inline-block w-2.5 h-4 ml-1 bg-[#fe6a01]"
                />
              )}
            </div>
          ) : (
            <div className="flex items-start">
              <span className="text-[#fe6a01] mr-2">$</span>
              <span className="text-gray-100">{typedCommand}</span>
              {isTyping && (
                <motion.span
                  animate={{ opacity: [1, 0] }}
                  transition={{ repeat: Infinity, duration: 0.8 }}
                  className="inline-block w-2.5 h-4 ml-1 bg-[#fe6a01]"
                />
              )}
            </div>
          )
        )}

        {isDone && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-4 pt-4 border-t border-border/50"
          >
            <div className="flex items-start">
              <span className="text-emerald-500 mr-2">TokenOS Ready:</span>
              <span className="text-gray-400">Waiting for AI queries...</span>
            </div>
            <div className="flex items-start mt-2">
              <span className="text-[#fe6a01] mr-2">$</span>
              <motion.span
                animate={{ opacity: [1, 0] }}
                transition={{ repeat: Infinity, duration: 0.8 }}
                className="inline-block w-2.5 h-4 ml-1 bg-[#fe6a01]"
              />
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
