"use client";

import Image from "next/image";
import { useState } from "react";

export function UserAvatar({ name, avatarUrl, size = 38, className = "avatar" }: { name: string; avatarUrl?: string; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const label = `${name}'s profile`;
  if (!avatarUrl || failed) return <Image className={`${className} avatar-fallback`} src="/brand/mosaic/avatar-placeholder.png" width={size} height={size} alt={label}/>;
  return <Image className={className} src={avatarUrl} width={size} height={size} alt={label} onError={() => setFailed(true)}/>;
}
