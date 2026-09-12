"use client";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

export function Dialog({ open, onOpenChange, title, children }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; children: ReactNode }) {
  return <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}><DialogPrimitive.Portal><DialogPrimitive.Overlay className="dialog-overlay"/><DialogPrimitive.Content className="dialog-content" aria-describedby={undefined}><DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>{children}<DialogPrimitive.Close className="dialog-close" style={{position:"absolute",right:18,top:18,zIndex:4}} aria-label="Close dialog"><X size={16}/></DialogPrimitive.Close></DialogPrimitive.Content></DialogPrimitive.Portal></DialogPrimitive.Root>;
}
