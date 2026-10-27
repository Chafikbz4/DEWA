"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Icon } from "./platform";

type ChatMessage = { id: number; from: "assistant" | "you"; text: string };

const QUICK_PROMPTS = [
  "How do I accept a request?",
  "How do I update my stock?",
  "When do I get paid?",
  "How does delivery work?",
];

function assistantReply(input: string, pendingRequests: number) {
  const value = input.toLowerCase();
  if (/request|accept|inbox|offer|reject/.test(value)) {
    return pendingRequests > 0
      ? `You have ${pendingRequests} request${pendingRequests === 1 ? "" : "s"} waiting. Open Requests inbox, click the reference to review the prescription, enter your amount and choose Accept interest — or reject it with a short reason.`
      : "Open Requests inbox, click the reference to review the prescription, enter your amount and choose Accept interest — or reject it with a short reason. New requests appear there as soon as patients submit them.";
  }
  if (/stock|medicine|quantity|price|catalogue|catalog/.test(value)) {
    return "Go to Stock and choose Add medicine. Search the national catalogue, select the medicine, set availability, quantity and price. Use Upload picture to add a real photo from your device, then add any specific details such as dosage or expiry.";
  }
  if (/pay|paid|payment|money|revenue|settle/.test(value)) {
    return "Cash on delivery or pickup is marked paid when you confirm the order was collected or delivered. Online payments (CCP and BaridiMob) stay pending until DEWA receives the transfer confirmation. Revenue on the dashboard reflects settled orders only.";
  }
  if (/deliver|delivery|courier|company|shipping/.test(value)) {
    return "For delivery orders, prepare the medicine and choose Hand to company once the courier arrives. The patient sees that it is on the way immediately. You cannot change a delivery order to pickup after the patient has chosen.";
  }
  if (/verified|verification|profile|name|address|phone|email/.test(value)) {
    return "Your pharmacy profile shows the public name, address and contact details patients see. Keep them current. Legal fields lock after verification — contact DEWA support if a verified legal detail must change.";
  }
  if (/hello|hi|hey|salam|bonjour/.test(value)) {
    return "Hello! I can help with requests, stock, payments, delivery and your pharmacy profile. Choose a suggestion below or type your question.";
  }
  return "I could not match that to a help topic yet. Try asking about requests, stock, payments, delivery or your profile — or use one of the suggestions below.";
}

export function PharmacyAssistant({ pendingRequests = 0 }: { pendingRequests?: number }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 0,
      from: "assistant",
      text: "Hello! I am your DEWA pharmacy assistant. I can guide you through requests, stock, payments and delivery. What do you need?",
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
      { id: base + 1, from: "assistant", text: assistantReply(question, pendingRequests) },
    ]);
    setDraft("");
  }

  return (
    <section className="platform-panel pharmacy-assistant" aria-label="Pharmacy assistant">
      <div className="panel-title">
        <div>
          <span className="platform-kicker">DEWA ASSISTANT</span>
          <h3>How can I help?</h3>
        </div>
        <span className="assistant-orb"><Icon name="shield" size={18} /></span>
      </div>
      <p className="panel-copy">Answers about requests, stock, payments and delivery — available anytime.</p>

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
          placeholder="Ask about requests, stock or payments..."
          aria-label="Ask the pharmacy assistant"
        />
        <button className="platform-primary" type="submit" disabled={!draft.trim()}>
          Send <Icon name="arrow" size={15} />
        </button>
      </form>
    </section>
  );
}
