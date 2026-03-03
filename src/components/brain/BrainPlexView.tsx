import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BrainNode } from '@/hooks/useBrainNodes';
import { BrainNodeCard } from './BrainNodeCard';
import { cn } from '@/lib/utils';

interface BrainPlexViewProps {
  activeNode: BrainNode | null;
  parent: BrainNode | null;
  children: BrainNode[];
  siblings: BrainNode[];
  onNavigate: (nodeId: string) => void;
  onOpenPanel: (node: BrainNode) => void;
}

export function BrainPlexView({
  activeNode,
  parent,
  children,
  siblings,
  onNavigate,
  onOpenPanel,
}: BrainPlexViewProps) {
  if (!activeNode) return null;

  // Split siblings into left and right
  const leftSiblings = siblings.filter((_, i) => i % 2 === 0);
  const rightSiblings = siblings.filter((_, i) => i % 2 === 1);

  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
      {/* SVG lines connecting nodes */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" style={{ overflow: 'visible' }}>
        {/* Parent line */}
        {parent && (
          <motion.line
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.3 }}
            transition={{ duration: 0.5 }}
            x1="50%" y1="50%" x2="50%" y2="15%"
            stroke="hsl(var(--border))" strokeWidth="2" strokeDasharray="6 4"
          />
        )}
        {/* Children lines */}
        {children.map((_, i) => {
          const count = children.length;
          const xPercent = count === 1 ? 50 : 20 + (60 * i / (count - 1));
          return (
            <motion.line
              key={`child-line-${i}`}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 0.3 }}
              transition={{ duration: 0.5, delay: i * 0.05 }}
              x1="50%" y1="50%" x2={`${xPercent}%`} y2="85%"
              stroke="hsl(var(--border))" strokeWidth="2" strokeDasharray="6 4"
            />
          );
        })}
        {/* Left sibling lines */}
        {leftSiblings.map((_, i) => (
          <motion.line
            key={`left-line-${i}`}
            initial={{ opacity: 0 }} animate={{ opacity: 0.2 }}
            transition={{ duration: 0.4, delay: i * 0.05 }}
            x1="50%" y1="50%" x2="8%" y2={`${35 + i * 12}%`}
            stroke="hsl(var(--border))" strokeWidth="1.5" strokeDasharray="4 4"
          />
        ))}
        {/* Right sibling lines */}
        {rightSiblings.map((_, i) => (
          <motion.line
            key={`right-line-${i}`}
            initial={{ opacity: 0 }} animate={{ opacity: 0.2 }}
            transition={{ duration: 0.4, delay: i * 0.05 }}
            x1="50%" y1="50%" x2="92%" y2={`${35 + i * 12}%`}
            stroke="hsl(var(--border))" strokeWidth="1.5" strokeDasharray="4 4"
          />
        ))}
      </svg>

      {/* Parent node (top) */}
      <AnimatePresence mode="popLayout">
        {parent && (
          <motion.div
            key={`parent-${parent.id}`}
            className="absolute top-[8%] left-1/2 -translate-x-1/2 z-10"
            initial={{ y: -40, opacity: 0, scale: 0.8 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -40, opacity: 0, scale: 0.8 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          >
            <BrainNodeCard
              node={parent}
              size="sm"
              onClick={() => onNavigate(parent.id)}
              onDoubleClick={() => onOpenPanel(parent)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Left siblings */}
      <div className="absolute left-2 top-1/2 -translate-y-1/2 flex flex-col gap-2 z-10">
        <AnimatePresence mode="popLayout">
          {leftSiblings.map((sibling, i) => (
            <motion.div
              key={`sibling-left-${sibling.id}`}
              initial={{ x: -60, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -60, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25, delay: i * 0.05 }}
            >
              <BrainNodeCard
                node={sibling}
                size="xs"
                onClick={() => onNavigate(sibling.id)}
                onDoubleClick={() => onOpenPanel(sibling)}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Right siblings */}
      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-2 z-10">
        <AnimatePresence mode="popLayout">
          {rightSiblings.map((sibling, i) => (
            <motion.div
              key={`sibling-right-${sibling.id}`}
              initial={{ x: 60, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 60, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25, delay: i * 0.05 }}
            >
              <BrainNodeCard
                node={sibling}
                size="xs"
                onClick={() => onNavigate(sibling.id)}
                onDoubleClick={() => onOpenPanel(sibling)}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Active node (center) */}
      <AnimatePresence mode="popLayout">
        <motion.div
          key={`active-${activeNode.id}`}
          className="relative z-20"
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.5, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 350, damping: 30 }}
        >
          <BrainNodeCard
            node={activeNode}
            size="lg"
            isActive
            onDoubleClick={() => onOpenPanel(activeNode)}
          />
        </motion.div>
      </AnimatePresence>

      {/* Children (bottom) */}
      <div className="absolute bottom-[6%] left-0 right-0 flex justify-center gap-3 z-10 px-4 flex-wrap">
        <AnimatePresence mode="popLayout">
          {children.map((child, i) => (
            <motion.div
              key={`child-${child.id}`}
              initial={{ y: 50, opacity: 0, scale: 0.7 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 50, opacity: 0, scale: 0.7 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25, delay: i * 0.04 }}
            >
              <BrainNodeCard
                node={child}
                size="sm"
                onClick={() => onNavigate(child.id)}
                onDoubleClick={() => onOpenPanel(child)}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
