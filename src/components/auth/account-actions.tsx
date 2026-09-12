"use client";

import { LogOut, Settings } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";

export function AccountActions() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  if (!user) return <a className="button" href="/login">Sign in</a>;
  return <div className="actions"><button className="button"><Settings size={15}/>Edit profile</button><button className="icon-button glass" aria-label="Sign out" onClick={async () => { await signOut(); router.replace("/"); }}><LogOut size={16}/></button></div>;
}
