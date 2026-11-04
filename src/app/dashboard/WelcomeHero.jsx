'use client';

import { Quote, ShieldCheck } from 'lucide-react';
import LiveClock, { useNow } from '@/components/LiveClock';
import { greetingFor, quoteOfDay } from '@/lib/domain/greeting';

export default function WelcomeHero({ name, scope }) {
  const now = useNow();
  return (
    <section className="welcome-hero">
      <div className="hero-glow" aria-hidden><span /><span /><span /></div>
      <div className="hero-shield" aria-hidden><i /><i /><ShieldCheck size={46} strokeWidth={1.5} /></div>
      <div className="hero-main">
        <div className="hero-eyebrow hero-in">Utamakan Keselamatan dan Kesehatan Kerja</div>
        <h2 className="hero-title hero-in">{now ? greetingFor(now.getHours()) : 'Selamat datang'}, <span>{name}</span></h2>
        <p className="hero-scope hero-in">{scope}</p>
        <div className="hero-quote hero-in">
          <Quote size={18} aria-hidden />
          <div>
            <span className="hero-quote-label">Motivasi K3 hari ini</span>
            <p>{now ? quoteOfDay(now) : ' '}</p>
          </div>
        </div>
      </div>
      <LiveClock now={now} className="hero-clock hero-in" />
    </section>
  );
}
