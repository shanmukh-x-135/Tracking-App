"use client";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { motion, motionTokens } from "@/components/motion/motion";

export function Dialog({ open, onOpenChange, title, children }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; children: ReactNode }) {
  return <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}><DialogPrimitive.Portal>
    {open && <><DialogPrimitive.Overlay asChild><motion.div className="dialog-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={motionTokens.fast}/></DialogPrimitive.Overlay>
    <DialogPrimitive.Content asChild><div className="dialog-content" aria-describedby={undefined}><motion.div className="dialog-motion" initial={{ opacity: 0, y: 12, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={motionTokens.normal}>
      <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>{children}<DialogPrimitive.Close className="dialog-close" style={{position:"absolute",right:18,top:18,zIndex:4}} aria-label="Close dialog"><X size={16}/></DialogPrimitive.Close>
    </motion.div></div></DialogPrimitive.Content></>}
  </DialogPrimitive.Portal></DialogPrimitive.Root>;
}
