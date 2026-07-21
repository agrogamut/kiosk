import { motion, useReducedMotion } from "framer-motion";

interface PulseRingProps {
  size?: "sm" | "lg";
}

const RING_COUNT = 3;

export function PulseRing({ size = "lg" }: PulseRingProps) {
  const reduceMotion = useReducedMotion();
  const dimension = size === "lg" ? 96 : 40;

  if (reduceMotion) {
    return (
      <div
        role="status"
        aria-label="Loading"
        className="rounded-full border-4 border-primary"
        style={{ width: dimension, height: dimension }}
      />
    );
  }

  return (
    <div role="status" aria-label="Loading" className="relative" style={{ width: dimension, height: dimension }}>
      {Array.from({ length: RING_COUNT }).map((_, index) => (
        <motion.span
          key={index}
          className="absolute inset-0 rounded-full border-2 border-primary"
          initial={{ opacity: 0.6, scale: 0.4 }}
          animate={{ opacity: 0, scale: 1 }}
          transition={{
            duration: 1.8,
            repeat: Infinity,
            ease: "easeOut",
            delay: index * 0.6,
          }}
        />
      ))}
      <div className="absolute inset-[30%] rounded-full bg-primary" />
    </div>
  );
}
