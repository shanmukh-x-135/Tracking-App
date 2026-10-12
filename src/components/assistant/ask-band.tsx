"use client";

import Link from "next/link";
import { ArrowUp, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import "./assistant.css";

const starters = ["What should I watch next from my watchlist?", "What did I log this month?", "Which movies did I rate highest?"];

/** Home entry point: a question here opens /ask prefilled; nothing is sent until the user confirms there. */
export function AskBand() {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const open = (value: string) => router.push(`/ask?q=${encodeURIComponent(value.trim())}`);
  return <section className="section ask-band" aria-labelledby="ask-band-title">
    <div>
      <span className="eyebrow"><Sparkles size={12}/> Mosaic AI</span>
      <h2 id="ask-band-title">Ask your Mosaic</h2>
      <p>Answers from your own library and history. Read-only.</p>
    </div>
    <form onSubmit={(event) => { event.preventDefault(); if (question.trim()) open(question); }}>
      <label className="sr-only" htmlFor="ask-band-input">Ask about your Mosaic</label>
      <input id="ask-band-input" value={question} maxLength={1000} onChange={(event) => setQuestion(event.target.value)} placeholder="What should I read next?"/>
      <button type="submit" className="ask-send" aria-label="Ask" disabled={!question.trim()}><ArrowUp size={18}/></button>
    </form>
    <div className="ask-band-chips">{starters.map((starter) => <Link key={starter} className="ask-starter" href={`/ask?q=${encodeURIComponent(starter)}`}>{starter}</Link>)}</div>
  </section>;
}
