import React, { useState } from 'react';

/**
 * Charts are drawn to one scale, labelled selectively, and coloured from the
 * validated series tokens. Text always wears an ink token; identity comes from
 * the mark beside it. Series colours were validated for CVD separation and
 * contrast against this app's own surfaces.
 */

const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)'];

interface Tip { x: number; y: number; lines: string[] }

function useTip() {
  const [tip, setTip] = useState<Tip>();
  const node = tip ? (
    <div
      style={{
        position: 'absolute', left: tip.x, top: tip.y, transform: 'translate(-50%, -100%)',
        pointerEvents: 'none', background: 'var(--surface)', border: '1px solid var(--line)',
        borderRadius: 7, padding: '6px 9px', boxShadow: 'var(--shadow)', fontSize: 12,
        whiteSpace: 'nowrap', zIndex: 2,
      }}
    >
      {tip.lines.map((l, i) => (
        <div key={i} style={{ color: i === 0 ? 'var(--ink)' : 'var(--ink-3)', fontVariantNumeric: 'tabular-nums' }}>{l}</div>
      ))}
    </div>
  ) : null;
  return { setTip, node };
}

/** Rounded only on the data end, square at the baseline. */
function barPath(x: number, y: number, w: number, h: number, r: number, end: 'right' | 'none'): string {
  if (end === 'none' || w <= r * 2) return `M${x},${y}h${w}v${h}h${-w}z`;
  return `M${x},${y}h${w - r}a${r},${r} 0 0 1 ${r},${r}v${h - r * 2}a${r},${r} 0 0 1 ${-r},${r}h${-(w - r)}z`;
}

/* ------------------------------ slope chart ----------------------------- */

export interface SlopeSeries { label: string; from: number; to: number }

/** Baseline against a comparable unseen reassessment, on the 0-4 rubric. */
export function SlopeChart({ series, max = 4 }: { series: SlopeSeries[]; max?: number }) {
  const { setTip, node } = useTip();
  const w = 520, h = 210, padL = 92, padR = 108, padT = 16, padB = 30;
  const plotW = w - padL - padR, plotH = h - padT - padB;
  const y = (v: number) => padT + plotH - (v / max) * plotH;

  if (!series.length) return <p className="small muted">No paired baseline and reassessment yet.</p>;

  return (
    <div style={{ position: 'relative' }}>
      <svg className="chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Baseline against reassessment score by participant">
        {[0, 1, 2, 3, 4].map((v) => (
          <g key={v}>
            <line className="grid-line" x1={padL} x2={padL + plotW} y1={y(v)} y2={y(v)} />
            <text className="tick" x={padL - 10} y={y(v) + 3.5} textAnchor="end">{v}</text>
          </g>
        ))}
        <line className="axis-line" x1={padL} x2={padL} y1={padT} y2={padT + plotH} />
        <line className="axis-line" x1={padL + plotW} x2={padL + plotW} y1={padT} y2={padT + plotH} />
        <text className="label" x={padL} y={h - 10} textAnchor="middle">Baseline</text>
        <text className="label" x={padL + plotW} y={h - 10} textAnchor="middle">Reassessment</text>

        {series.map((s, i) => {
          const colour = SERIES[i % SERIES.length]!;
          return (
            <g key={s.label}>
              <line x1={padL} y1={y(s.from)} x2={padL + plotW} y2={y(s.to)} stroke={colour} strokeWidth={2} strokeLinecap="round" />
              {([[padL, s.from], [padL + plotW, s.to]] as const).map(([cx, v], k) => (
                <circle
                  key={k} cx={cx} cy={y(v)} r={4.5} fill={colour}
                  stroke="var(--surface)" strokeWidth={2}
                  onMouseEnter={(e) => setTip({
                    x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY - 8,
                    lines: [s.label, `${k === 0 ? 'Baseline' : 'Reassessment'} ${v}/4`],
                  })}
                  onMouseLeave={() => setTip(undefined)}
                />
              ))}
              <text className="label-strong" x={padL + plotW + 12} y={y(s.to) + 4}>{s.to}/4</text>
            </g>
          );
        })}
      </svg>
      {/* One series needs no legend: the title already names what is plotted. */}
      {series.length > 1 && (
        <div className="legend" style={{ marginTop: 4 }}>
          {series.map((s, i) => (
            <span className="key" key={s.label}>
              <span className="swatch" style={{ background: SERIES[i % SERIES.length] }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
      {series.length === 1 && <div className="legend" style={{ marginTop: 4 }}>{series[0]!.label}</div>}
      {node}
    </div>
  );
}

/* ---------------------------- stacked effort ---------------------------- */

export interface EffortRow { label: string; parts: { name: string; value: number }[] }

/** Total effort: worker plus review plus rework. AI cost is never netted off. */
export function EffortBars({ rows, unit = 'min' }: { rows: EffortRow[]; unit?: string }) {
  const { setTip, node } = useTip();
  const max = Math.max(1, ...rows.map((r) => r.parts.reduce((a, b) => a + b.value, 0)));
  const w = 520, padL = 108, padR = 56, barH = 22, gapY = 18, padT = 8, padB = 26;
  const plotW = w - padL - padR;
  const h = padT + rows.length * (barH + gapY) + padB;
  const names = rows[0]?.parts.map((p) => p.name) ?? [];

  return (
    <div style={{ position: 'relative' }}>
      <svg className="chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Total effort per submission, split by worker, review and rework time">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line className="grid-line" x1={padL + plotW * f} x2={padL + plotW * f} y1={padT} y2={h - padB} />
            <text className="tick" x={padL + plotW * f} y={h - padB + 15} textAnchor="middle">{Math.round(max * f)}</text>
          </g>
        ))}
        <line className="axis-line" x1={padL} x2={padL} y1={padT} y2={h - padB} />

        {rows.map((row, ri) => {
          const total = row.parts.reduce((a, b) => a + b.value, 0);
          const y = padT + ri * (barH + gapY);
          let x = padL;
          return (
            <g key={row.label}>
              <text className="label" x={padL - 12} y={y + barH / 2 + 4} textAnchor="end">{row.label}</text>
              {row.parts.map((p, pi) => {
                const segW = Math.max(0, (p.value / max) * plotW - 2); // 2px surface gap
                const node_ = (
                  <path
                    key={p.name}
                    d={barPath(x, y, segW, barH, 4, pi === row.parts.length - 1 ? 'right' : 'none')}
                    fill={SERIES[pi % SERIES.length]}
                    onMouseEnter={(e) => setTip({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY - 8, lines: [`${p.name} ${p.value} ${unit}`, `${row.label} · total ${total} ${unit}`] })}
                    onMouseLeave={() => setTip(undefined)}
                  />
                );
                x += (p.value / max) * plotW;
                return node_;
              })}
              <text className="label-strong" x={padL + (total / max) * plotW + 10} y={y + barH / 2 + 4}>{total}</text>
            </g>
          );
        })}
      </svg>
      <div className="legend" style={{ marginTop: 2 }}>
        {names.map((n, i) => (
          <span className="key" key={n}>
            <span className="swatch" style={{ background: SERIES[i % SERIES.length] }} />{n}
          </span>
        ))}
        <span className="key">Values in {unit}</span>
      </div>
      {node}
    </div>
  );
}

/* --------------------------- evidence spread ---------------------------- */

const STATUS_FILL: Record<string, string> = {
  demonstrated: 'var(--st-demonstrated)', self_reported: 'var(--st-self)',
  not_demonstrated: 'var(--st-none)', not_met: 'var(--st-notmet)', unknown: 'var(--st-unknown)',
};

/** A reserved status palette, so a state never impersonates a series. */
export function StatusSpread({ counts }: { counts: { status: string; label: string; value: number }[] }) {
  const total = counts.reduce((a, b) => a + b.value, 0) || 1;
  return (
    <div className="stack tight">
      <div style={{ display: 'flex', gap: 2, height: 12 }}>
        {counts.filter((c) => c.value > 0).map((c) => (
          <div
            key={c.status}
            title={`${c.label}: ${c.value}`}
            style={{ width: `${(c.value / total) * 100}%`, background: STATUS_FILL[c.status], borderRadius: 3 }}
          />
        ))}
      </div>
      <div className="legend">
        {counts.map((c) => (
          <span className="key" key={c.status}>
            <span className="swatch" style={{ background: STATUS_FILL[c.status] }} />
            {c.label} <span className="num" style={{ color: 'var(--ink-2)' }}>{c.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
