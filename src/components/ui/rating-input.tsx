"use client";

import { Star } from "lucide-react";
import { useId, useState } from "react";
import { motion, motionTokens } from "@/components/motion/motion";

interface RatingInputProps {
  value?: number;
  onChange(value: number): void;
  label?: string;
  ariaPrefix?: string;
  disabled?: boolean;
}

/** Five targets preserve a compact UI while each target selects its left or right half. */
export function RatingInput({ value = 0, onChange, label = "Your rating", ariaPrefix = "Rate ", disabled }: RatingInputProps) {
  const [hovered, setHovered] = useState<number>();
  const id = useId();
  const active = hovered ?? value;
  const setFromPointer = (event: React.MouseEvent<HTMLButtonElement>, star: number) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    onChange(star - (event.clientX - bounds.left < bounds.width / 2 ? 0.5 : 0));
  };
  return <fieldset className="rating-input" aria-describedby={`${id}-value`} onPointerLeave={() => setHovered(undefined)}>
    <legend>{label}</legend>
    <div className="rating-stars" role="group" aria-label={label}>
      {[1, 2, 3, 4, 5].map((star) => {
        const fill = Math.max(0, Math.min(1, active - (star - 1)));
        return <button key={star} type="button" disabled={disabled} className={`rating-star ${fill === 1 ? "active" : ""}`} aria-label={`${ariaPrefix}${star} stars`} onPointerMove={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          setHovered(star - (event.clientX - bounds.left < bounds.width / 2 ? 0.5 : 0));
        }} onClick={(event) => setFromPointer(event, star)} onKeyDown={(event) => {
          if (event.key === "ArrowRight" || event.key === "ArrowUp") { event.preventDefault(); onChange(Math.min(5, (value || 0) + 0.5)); }
          if (event.key === "ArrowLeft" || event.key === "ArrowDown") { event.preventDefault(); onChange(Math.max(0.5, (value || 1) - 0.5)); }
          if (event.key === "Escape") { event.preventDefault(); onChange(0); }
        }}>
          <Star size={24}/><motion.span className="rating-star-fill" animate={{ width: `${fill * 100}%` }} transition={motionTokens.fast}><Star size={24} fill="currentColor"/></motion.span>
        </button>;
      })}
    </div>
    <output id={`${id}-value`} className="rating-value">{value ? `${value.toFixed(1)} / 5` : "Not rated"}</output>
  </fieldset>;
}
