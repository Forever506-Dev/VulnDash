import { useState, useEffect } from 'react';
import { scoreColor, scoreGrade } from '../hooks/useTauri';

export default function ScoreGauge({ score }: { score: number }) {
  const [displayScore, setDisplayScore] = useState(0);
  const color = scoreColor(displayScore);
  const grade = scoreGrade(displayScore);
  const circumference = 2 * Math.PI * 54;
  const dash = (displayScore / 100) * circumference;

  useEffect(() => {
    let start: number | null = null;
    const duration = 1000;
    const from = 0;
    const to = score;

    function step(ts: number) {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayScore(Math.round(from + (to - from) * eased));
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }, [score]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-36 h-36">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
          <circle
            cx="60" cy="60" r="54" fill="none"
            stroke={displayScore >= 90 ? '#22c55e' : displayScore >= 75 ? '#3b82f6' : displayScore >= 60 ? '#eab308' : displayScore >= 40 ? '#f97316' : '#ef4444'}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
            style={{ transition: 'stroke-dasharray 0.8s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-3xl font-bold ${color}`}>{displayScore}</span>
          <span className={`text-lg font-semibold ${color}`}>{grade}</span>
        </div>
      </div>
      <span className="text-zinc-400 text-sm">Security Score</span>
    </div>
  );
}
