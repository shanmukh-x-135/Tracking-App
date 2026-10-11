"use client";

import Image from "next/image";
import { Check, Link2, LoaderCircle } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Dialog, DialogTitle } from "@/components/ui/dialog";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { AuthUser, ProfileUpdate } from "@/lib/auth/types";
import { AVATAR_PRESETS, avatarPreset, avatarUrlProblem } from "@/lib/profile/avatars";

const BIO_LIMIT = 500;

function EditorForm({ user, onClose, onSave }: { user: AuthUser; onClose(): void; onSave(profile: ProfileUpdate): Promise<void> }) {
  const initial = { displayName: user.displayName, username: user.username ?? "", bio: user.bio ?? "", avatar: user.avatarUrl ?? "" };
  const [draft, setDraft] = useState(initial);
  // A legacy or custom link is kept as its own choice so switching presets never discards it.
  const [customLink, setCustomLink] = useState(avatarPreset(initial.avatar) ? "" : initial.avatar);
  const [showLink, setShowLink] = useState(Boolean(customLink));
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const linkProblem = draft.avatar === customLink ? avatarUrlProblem(customLink) : undefined;
  const changed = (Object.keys(initial) as (keyof typeof initial)[]).some((key) => draft[key].trim() !== initial[key].trim());
  const update = (patch: Partial<typeof draft>) => { setDraft((current) => ({ ...current, ...patch })); setSaved(false); };
  const chosen = avatarPreset(draft.avatar);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving || linkProblem) return;
    setError(undefined); setSaved(false); setIsSaving(true);
    try {
      await onSave({ displayName: draft.displayName, username: draft.username, bio: draft.bio, avatarUrl: draft.avatar.trim() || null });
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your profile could not be saved.");
    } finally { setIsSaving(false); }
  }

  return <form className="profile-editor" onSubmit={submit}>
    <header className="profile-editor-head">
      <DialogTitle className="dialog-title">Edit profile</DialogTitle>
      <p>How you appear across Mosaic.</p>
    </header>

    <section className="profile-editor-identity" aria-label="Preview">
      <span className="profile-editor-preview"><UserAvatar key={draft.avatar} className="avatar" name={draft.displayName || user.displayName} avatarUrl={draft.avatar.trim() && !linkProblem ? draft.avatar.trim() : undefined} size={96}/></span>
      <span className="profile-editor-preview-copy">
        <strong>{draft.displayName.trim() || "Your name"}</strong>
        <small>{draft.username ? `@${draft.username}` : "Choose a username"}</small>
        <em>{chosen ? chosen.name : draft.avatar ? "Your image link" : "Mosaic default"}</em>
      </span>
    </section>

    <fieldset className="profile-editor-avatars">
      <legend>Avatar</legend>
      <p className="profile-editor-help">Pick a Mosaic avatar, or use a link to an image you host.</p>
      <div className="avatar-grid">
        {AVATAR_PRESETS.map((preset) => <label key={preset.id} className="avatar-option">
          <input type="radio" name="avatar" value={preset.src} checked={draft.avatar === preset.src} onChange={() => update({ avatar: preset.src })}/>
          <span className="avatar-option-art"><Image src={preset.src} alt="" width={64} height={64} unoptimized/><Check className="avatar-option-check" size={14} strokeWidth={3} aria-hidden="true"/></span>
          <span className="avatar-option-name">{preset.name}</span>
        </label>)}
        <label className="avatar-option">
          <input type="radio" name="avatar" value="" checked={!draft.avatar} onChange={() => update({ avatar: "" })}/>
          <span className="avatar-option-art"><Image src="/brand/mosaic/avatar-placeholder.png" alt="" width={64} height={64}/><Check className="avatar-option-check" size={14} strokeWidth={3} aria-hidden="true"/></span>
          <span className="avatar-option-name">Default</span>
        </label>
        {customLink && !avatarUrlProblem(customLink) ? <label className="avatar-option">
          <input type="radio" name="avatar" value={customLink} checked={draft.avatar === customLink} onChange={() => update({ avatar: customLink })}/>
          <span className="avatar-option-art"><UserAvatar className="avatar" name={user.displayName} avatarUrl={customLink} size={64}/><Check className="avatar-option-check" size={14} strokeWidth={3} aria-hidden="true"/></span>
          <span className="avatar-option-name">Your link</span>
        </label> : null}
      </div>
      {showLink ? <label className="profile-editor-field">
        <span>Image link</span>
        <span className="profile-editor-input"><Link2 size={15} aria-hidden="true"/><input type="url" inputMode="url" placeholder="https://…" value={customLink} aria-invalid={Boolean(linkProblem)} aria-describedby="avatar-link-help" onChange={(event) => { setCustomLink(event.target.value); update({ avatar: event.target.value }); }}/></span>
        <small id="avatar-link-help" className={linkProblem ? "is-error" : undefined}>{linkProblem ?? "Use a public https:// image. Uploads aren't available yet."}</small>
      </label> : <button type="button" className="profile-editor-link" onClick={() => { setShowLink(true); if (customLink) update({ avatar: customLink }); }}><Link2 size={15} aria-hidden="true"/>Use an image link instead</button>}
    </fieldset>

    <div className="profile-editor-fields">
      <label className="profile-editor-field">
        <span>Display name</span>
        <input name="displayName" required maxLength={80} autoComplete="name" value={draft.displayName} onChange={(event) => update({ displayName: event.target.value })}/>
      </label>
      <label className="profile-editor-field">
        <span>Username</span>
        <span className="profile-editor-input"><b aria-hidden="true">@</b><input name="username" required pattern="[a-z0-9_]{3,30}" autoComplete="username" autoCapitalize="none" spellCheck={false} value={draft.username} aria-describedby="username-help" onChange={(event) => update({ username: event.target.value })}/></span>
        <small id="username-help">3–30 lowercase letters, numbers or underscores.</small>
      </label>
      <label className="profile-editor-field is-wide">
        <span>Bio</span>
        <textarea name="bio" maxLength={BIO_LIMIT} rows={3} value={draft.bio} placeholder="A little about the stories you love." aria-describedby="bio-count" onChange={(event) => update({ bio: event.target.value })}/>
        <small id="bio-count" className="profile-editor-count" aria-live="polite">{draft.bio.length}/{BIO_LIMIT}</small>
      </label>
    </div>

    <footer className="profile-editor-foot">
      <span className="profile-editor-status" aria-live="polite">
        {error ? <span className="form-error" role="alert">{error}</span> : saved ? <span className="form-success" role="status">Profile saved.</span> : null}
      </span>
      <button type="button" className="button" onClick={onClose}>Cancel</button>
      <button className="button primary" type="submit" disabled={isSaving || !changed || Boolean(linkProblem)} aria-busy={isSaving}>
        {isSaving ? <><LoaderCircle className="spin" size={15} aria-hidden="true"/>Saving…</> : "Save changes"}
      </button>
    </footer>
  </form>;
}

export function ProfileEditor({ user, open, onOpenChange, onSave }: { user: AuthUser; open: boolean; onOpenChange(open: boolean): void; onSave(profile: ProfileUpdate): Promise<void> }) {
  // Mounting the form only while open resets it to the saved profile each time.
  return <Dialog open={open} onOpenChange={onOpenChange} title="Edit profile" titleInContent>{open ? <EditorForm user={user} onClose={() => onOpenChange(false)} onSave={onSave}/> : null}</Dialog>;
}
