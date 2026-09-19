"use client";

import Image from "next/image";
import { useState } from "react";

function initials(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0]?.[0] ?? ""}${parts.at(-1)?.[0] ?? ""}` : parts[0]?.slice(0, 2) ?? "M").toUpperCase();
}

export function UserAvatar({ name, avatarUrl, size = 38, className = "avatar" }: { name: string; avatarUrl?: string; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const label = `${name}'s profile`;
  if (!avatarUrl || failed) return <span className={`${className} avatar-fallback`} role="img" aria-label={label}>{initials(name)}</span>;
  return <Image className={className} src={avatarUrl} width={size} height={size} alt={label} onError={() => setFailed(true)}/>;
}
