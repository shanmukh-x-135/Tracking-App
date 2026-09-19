"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { AuthUser, ProfileUpdate } from "@/lib/auth/types";

export function ProfileEditor({ user, open, onOpenChange, onSave }: { user: AuthUser; open: boolean; onOpenChange(open: boolean): void; onSave(profile: ProfileUpdate): Promise<void> }) {
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  async function save(form: FormData) {
    setError(undefined); setSaved(false); setIsSaving(true);
    try {
      await onSave({
        displayName: String(form.get("displayName") ?? ""),
        username: String(form.get("username") ?? ""),
        bio: String(form.get("bio") ?? ""),
        avatarUrl: String(form.get("avatarUrl") ?? "") || null,
      });
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your profile could not be saved.");
    } finally { setIsSaving(false); }
  }

  const changeOpen = (nextOpen: boolean) => {
    if (nextOpen) { setError(undefined); setSaved(false); }
    onOpenChange(nextOpen);
  };

  return <Dialog open={open} onOpenChange={changeOpen} title="Edit profile"><form className="dialog-body form-grid" action={save}>
    <div className="profile-editor-preview"><UserAvatar name={user.displayName} avatarUrl={user.avatarUrl} size={56}/><span className="muted">Your avatar uses a URL because Mosaic storage is not enabled for profile uploads.</span></div>
    <label className="field">Display name<input name="displayName" required maxLength={80} defaultValue={user.displayName}/></label>
    <label className="field">Username<input name="username" required pattern="[a-z0-9_]{3,30}" title="3–30 lowercase letters, numbers, or underscores" defaultValue={user.username ?? ""}/></label>
    <label className="field full">Bio<textarea name="bio" maxLength={500} defaultValue={user.bio ?? ""} placeholder="A little about the stories you love."/></label>
    <label className="field full">Avatar image URL<input name="avatarUrl" type="url" defaultValue={user.avatarUrl ?? ""} placeholder="https://…"/></label>
    {error && <p className="form-error field full" role="alert">{error}</p>}
    {saved && <p className="form-success field full" role="status">Profile saved.</p>}
    <div className="actions field full"><button type="button" className="button" onClick={() => changeOpen(false)}>Cancel</button><button className="button primary" type="submit" disabled={isSaving}>{isSaving ? "Saving…" : "Save profile"}</button></div>
  </form></Dialog>;
}
