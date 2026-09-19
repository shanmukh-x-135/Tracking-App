"use client";

import { Database, LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";

export function AccountActions({ onEdit }: { onEdit?: () => void }) {
  const { user, signOut } = useAuth();
  const router = useRouter();
  if (!user) return <a className="button" href="/login">Sign in</a>;
  return <div className="actions"><Link className="button" href="/settings/data"><Database size={15}/>Your data</Link><button className="button" onClick={onEdit}><Settings size={15}/>Edit profile</button><button className="icon-button glass" aria-label="Sign out" onClick={async () => { await signOut(); router.replace("/home"); }}><LogOut size={16}/></button></div>;
}
