"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Icon } from "./platform";

type ChatMessage = { id: number; from: "assistant" | "you"; text: string };

const QUICK_PROMPTS = [
  "How do I send a prescription?",
  "How do I compare offers?",
  "How do I pay for my order?",
  "How do I track my delivery?",
];

function assistantReply(input: string) {
  const value = input.toLowerCase();
  if (/send|prescription|request|upload|new|photo|scan/.test(value)) {
    return "Go to Requests and tap “New request”. Choose your wilaya (and commune if you want), upload a photo or PDF of your prescription, confirm you consent to share it, then submit. Nearby pharmacies receive it right away.";
  }
  if (/offer|compare|price|accept|choose|pharmacy/.test(value)) {
    return "When a pharmacy accepts your request, open the Order board and tap the “Accepted” status. You can see the price, then choose pickup or home delivery and how you want to pay.";
  }
  if (/pay|payment|money|ccp|baridimob|cash|delivery fee/.test(value)) {
    return "You can pay on delivery (cash or card when it arrives), or by CCP / BaridiMob. Online payment is being finalised, so for now you confirm the order and pay when you receive it. You never pay before a pharmacy accepts.";
  }
  if (/track|deliver|delivery|where|status|courier/.test(value)) {
    return "Open the Delivery page to follow each order step by step: preparing, ready, on the way, delivered. It refreshes automatically, and delivery orders show the courier progress.";
  }
  if (/pickup|collect|code|store/.test(value)) {
    return "For pickup orders, go to the pharmacy and show your order reference. The pharmacy confirms the hand-over and your order is marked collected.";
  }
  if (/profile|account|email|phone|password|address/.test(value)) {
    return "In Profile you can update your name, email and phone, and change your password. Keep at least one contact (email or phone) so you can always sign in and get updates.";
  }
  if (/hello|hi|hey|salam|bonjour/.test(value)) {
    return "Hello! I can show you how to send a prescription, compare pharmacy offers, pay, and track delivery. Pick a suggestion below or type your question.";
  }
  return "I can help you use DEWA: sending a prescription, comparing offers, paying, and tracking delivery. Try one of the suggestions below, or ask in your own words.";
}

export function PatientAssistant() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 0,
      from: "assistant",
      text: "Hi! I am your DEWA assistant. I can guide you through sending a prescription, comparing offers, paying and tracking your delivery. What would you like to do?",
    },
  ]);
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messages.length > 1) endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages]);

  function send(value: string, event?: FormEvent) {
    event?.preventDefault();
    const question = value.trim();
    if (!question) return;
    const base = messages.length ? messages[messages.length - 1].id + 1 : 1;
    setMessages((current) => [
      ...current,
      { id: base, from: "you", text: question },
      { id: base + 1, from: "assistant", text: assistantReply(question) },
    ]);
    setDraft("");
  }

  return (
    <section className="platform-panel pharmacy-assistant" aria-label="DEWA assistant">
      <div className="panel-title">
        <div>
          <span className="platform-kicker">DEWA ASSISTANT</span>
          <h3>How can I help you?</h3>
        </div>
        <span className="assistant-orb"><Icon name="shield" size={18} /></span>
      </div>
      <p className="panel-copy">New to DEWA? Ask how to send a prescription, compare offers, pay or track delivery.</p>

      <div className="assistant-thread" role="log" aria-live="polite">
        {messages.map((message) => (
          <div className={`assistant-message ${message.from}`} key={message.id}>
            {message.from === "assistant" ? <span className="assistant-avatar">D</span> : null}
            <p>{message.text}</p>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="assistant-prompts">
        {QUICK_PROMPTS.map((prompt) => (
          <button type="button" key={prompt} onClick={() => send(prompt)}>{prompt}</button>
        ))}
      </div>

      <form className="assistant-input" onSubmit={(event) => send(draft, event)}>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask how to use DEWA..."
          aria-label="Ask the DEWA assistant"
        />
        <button className="platform-primary" type="submit" disabled={!draft.trim()}>
          Send <Icon name="arrow" size={15} />
        </button>
      </form>
    </section>
  );
}
