import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BrainNode } from '@/hooks/useBrainNodes';
import { BrainNodeCard } from './BrainNodeCard';
import { ChevronDown, ChevronRight } from 'lucide-react';

const BRAIN_EXPANDED_KEY = 'brain_last_expanded_child';

interface BrainPlexViewProps {
  activeNode: BrainNode | null;
  parent: BrainNode | null;
  children: BrainNode[];
  siblings: BrainNode[];
  allNodes: BrainNode[];
  onNavigate: (nodeId: string) => void;
  onOpenPanel: (node: BrainNode) => void;
}

export function BrainPlexView({
  activeNode,
  parent,
  children,
  siblings,
  allNodes,
  onNavigate,
  onOpenPanel,
}: BrainPlexViewProps) {
  const [expandedChildId, setExpandedChildId] = useState<string | null>(null);

  // Check if children have grandchildren (expandable mode)
  const childrenWithGrandchildren = useMemo(() => {
    return children.map(child => ({
      ...child,
      grandchildren: allNodes
        .filter(n => n.parent_id === child.id)
        .sort((a, b) => a.order_index - b.order_index),
    }));
  }, [children, allNodes]);

  const hasExpandableChildren = childrenWithGrandchildren.some(c => c.grandchildren.length > 0);

  // Restore last expanded child from localStorage
  useEffect(() => {
    if (!hasExpandableChildren || !activeNode) return;
    const saved = localStorage.getItem(`${BRAIN_EXPANDED_KEY}_${activeNode.id}`);
    if (saved && childrenWithGrandchildren.some(c => c.id === saved)) {
      setExpandedChildId(saved);
    } else {
      setExpandedChildId(null);
    }
  }, [activeNode?.id, hasExpandableChildren, childrenWithGrandchildren]);

  const toggleExpand = (childId: string) => {
    const newVal = expandedChildId === childId ? null : childId;
    setExpandedChildId(newVal);
    if (activeNode) {
      if (newVal) {
        localStorage.setItem(`${BRAIN_EXPANDED_KEY}_${activeNode.id}`, newVal);
      } else {
        localStorage.removeItem(`${BRAIN_EXPANDED_KEY}_${activeNode.id}`);
      }
    }
  };

  if (!activeNode) return null;

  const leftSiblings = siblings.filter((_, i) => i % 2 === 0);
  const rightSiblings = siblings.filter((_, i) => i % 2 === 1);

  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
      {/* SVG lines */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id="lineGradientUp" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.6" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.15" />
          </linearGradient>
          <linearGradient id="lineGradientDown" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.6" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.15" />
          </linearGradient>
        </defs>
        {parent && (
          <motion.line
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.6 }}
            x1="50%" y1="50%" x2="50%" y2="15%"
            stroke="url(#lineGradientUp)" strokeWidth="2.5"
          />
        )}
        {!hasExpandableChildren && children.map((child, i) => {
          const count = children.length;
          const xPercent = count === 1 ? 50 : 20 + (60 * i / (count - 1));
          return (
            <motion.line
              key={`child-line-${i}`}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.5, delay: i * 0.05 }}
              x1="50%" y1="50%" x2={`${xPercent}%`} y2="85%"
              stroke="url(#lineGradientDown)" strokeWidth="2"
            />
          );
        })}
        {hasExpandableChildren && children.map((child, i) => {
          const count = children.length;
          const xPercent = count === 1 ? 50 : 25 + (50 * i / (count - 1));
          return (
            <motion.line
              key={`child-line-${i}`}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.5, delay: i * 0.05 }}
              x1="50%" y1="55%" x2={`${xPercent}%`} y2="72%"
              stroke="url(#lineGradientDown)" strokeWidth="2"
            />
          );
        })}
        {leftSiblings.map((_, i) => (
          <motion.line
            key={`left-line-${i}`}
            initial={{ opacity: 0 }} animate={{ opacity: 0.35 }}
            transition={{ duration: 0.4, delay: i * 0.05 }}
            x1="50%" y1="50%" x2="8%" y2={`${35 + i * 12}%`}
            stroke="hsl(var(--muted-foreground))" strokeWidth="1.5" strokeDasharray="6 4"
          />
        ))}
        {rightSiblings.map((_, i) => (
          <motion.line
            key={`right-line-${i}`}
            initial={{ opacity: 0 }} animate={{ opacity: 0.35 }}
            transition={{ duration: 0.4, delay: i * 0.05 }}
            x1="50%" y1="50%" x2="92%" y2={`${35 + i * 12}%`}
            stroke="hsl(var(--muted-foreground))" strokeWidth="1.5" strokeDasharray="6 4"
          />
        ))}
      </svg>

      {/* Parent node */}
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
          className={`relative z-20 ${hasExpandableChildren ? 'mb-32' : ''}`}
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

      {/* Children - expandable mode (categories with grandchildren) */}
      {hasExpandableChildren && (
        <div className="absolute bottom-[4%] left-0 right-0 z-10 px-4 overflow-y-auto max-h-[45%]">
          <div className="flex flex-col items-center gap-2 max-w-2xl mx-auto">
            {childrenWithGrandchildren.map((child, i) => {
              const isExpanded = expandedChildId === child.id;
              const count = child.grandchildren.length;
              return (
                <motion.div
                  key={`child-group-${child.id}`}
                  className="w-full"
                  initial={{ y: 30, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: i * 0.06 }}
                >
                  {/* Category header */}
                  <button
                    onClick={() => toggleExpand(child.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card/80 backdrop-blur-sm hover:border-primary/40 transition-all group"
                  >
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: child.color || 'hsl(var(--primary))' }}
                    />
                    <span className="font-medium text-sm text-foreground flex-1 text-left">
                      {child.name}
                    </span>
                    <span className="text-xs text-muted-foreground">{count}</span>
                    {isExpanded
                      ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    }
                  </button>

                  {/* Expanded grandchildren */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden"
                      >
                        <div className="flex flex-wrap gap-2 py-2 pl-5">
                          {child.grandchildren.map((gc, gi) => (
                            <motion.div
                              key={gc.id}
                              initial={{ scale: 0.8, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              transition={{ delay: gi * 0.03 }}
                            >
                              <BrainNodeCard
                                node={gc}
                                size="xs"
                                onClick={() => onNavigate(gc.id)}
                                onDoubleClick={() => onOpenPanel(gc)}
                              />
                            </motion.div>
                          ))}
                          {child.grandchildren.length === 0 && (
                            <p className="text-xs text-muted-foreground italic py-1">Sin elementos</p>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* Children - simple mode (no grandchildren) */}
      {!hasExpandableChildren && (
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
      )}
    </div>
  );
}
