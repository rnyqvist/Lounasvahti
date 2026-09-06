import { dailyBit } from '../lib/daily-bit.ts';

export function DailyBit({ date }: { date: string }) {
  const bit = dailyBit(date);
  return (
    <aside className="daily-bit" aria-labelledby="daily-bit-heading">
      <div className="daily-bit-heading"><h2 id="daily-bit-heading">Päivän bittipala</h2><span>{bit.kind}</span></div>
      <h3>{bit.title}</h3>
      <div className="daily-bit-joke">{bit.lines.map((line, index) => <p key={index}>{line}</p>)}</div>
      <div className="daily-bit-tip"><strong>Taskuun töihin</strong><p>{bit.tip}</p></div>
      <p className="daily-bit-next">Huomenna uusi bittipala.</p>
    </aside>
  );
}
