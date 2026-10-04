"use client";

import Image from "next/image";
import { ChevronLeft, ChevronRight, RotateCcw, SkipForward, X } from "lucide-react";
import { useState } from "react";
import { motion, useReducedMotion } from "@/components/motion/motion";
import type { MosaicRecap } from "@/lib/mosaic/recap";

interface MosaicRecapProps {
  recap: MosaicRecap;
  onExplore(): void;
}

export function MosaicRecap({ recap, onExplore }: MosaicRecapProps) {
  const reduced = useReducedMotion();
  const [sceneIndex, setSceneIndex] = useState(0);
  const scene = recap.scenes[sceneIndex];
  const finalScene = sceneIndex === recap.scenes.length - 1;
  const art = recap.snapshot.tiles.slice(0, 18);
  const next = () => finalScene ? onExplore() : setSceneIndex((value) => value + 1);

  return <section className="mosaic-recap" role="dialog" aria-modal="true" aria-label="Your Mosaic recap">
    <div className="mosaic-recap-art" aria-hidden="true">{art.map((tile, index) => <motion.span key={tile.key} className="mosaic-recap-tile" initial={reduced ? false : { opacity: 0, x: (index % 6 - 2.5) * 88, y: 160 + Math.floor(index / 6) * 42, rotate: (index % 5 - 2) * 13, scale: .5 }} animate={{ opacity: 1, x: (index % 6 - 2.5) * 48, y: (Math.floor(index / 6) - 1) * 50, rotate: (index % 5 - 2) * 3, scale: finalScene ? .78 : .54 }} transition={reduced ? { duration: 0 } : { delay: index * .025, duration: .7, ease: [0.16, 1, .3, 1] }}>
      {tile.artwork ? <Image src={tile.artwork} alt="" fill sizes="120px"/> : tile.title.slice(0, 1)}
    </motion.span>)}</div>
    <div className="mosaic-recap-controls"><button type="button" className="icon-button" onClick={onExplore} aria-label="Skip recap"><SkipForward size={17}/></button><button type="button" className="icon-button" onClick={() => setSceneIndex(0)} aria-label="Replay recap"><RotateCcw size={17}/></button><button type="button" className="icon-button" onClick={onExplore} aria-label="Close recap"><X size={17}/></button></div>
    <div className="mosaic-recap-copy" aria-live="polite"><p>{sceneIndex + 1} / {recap.scenes.length}</p><motion.div key={scene.id} initial={reduced ? false : { opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={reduced ? { duration: 0 } : { duration: .42, ease: [0.22, 1, .36, 1] }}><h2>{scene.title}</h2><p>{scene.detail}</p></motion.div></div>
    <div className="mosaic-recap-nav"><button type="button" className="button ghost" disabled={sceneIndex === 0} onClick={() => setSceneIndex((value) => value - 1)}><ChevronLeft size={16}/>Back</button><button type="button" className="button accent" onClick={next}>{finalScene ? "Explore your Mosaic" : "Continue"}<ChevronRight size={16}/></button></div>
  </section>;
}
