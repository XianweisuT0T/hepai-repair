import type { Gear } from '../shared/types';

const radii: Record<Gear['size'], number> = { small: 27, medium: 35, large: 43 };

function gearVertices(radius: number, teeth: number) {
  return Array.from({ length: teeth * 4 }, (_, index) => {
    const angle = index * Math.PI * 2 / (teeth * 4) - Math.PI / 2;
    const distance = index % 4 === 0 || index % 4 === 3 ? radius * .86 : radius;
    return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance };
  });
}

export function gearPath(radius: number, teeth: number) {
  return gearVertices(radius, teeth).map(({ x, y }, index) =>
    `${index ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`,
  ).join(' ') + 'Z';
}

/** The contact shadow belongs to the stationary parent, outside gear-motion. */
export function GearDrawing({ gear, prefix }: { gear: Gear; prefix: string }) {
  const radius = radii[gear.size];
  const teeth = gear.size === 'large' ? 20 : gear.size === 'medium' ? 16 : 12;
  const holeCount = gear.size === 'large' ? 5 : gear.size === 'medium' ? 4 : 3;
  const thickness = gear.size === 'large' ? 4.4 : gear.size === 'medium' ? 3.8 : 3.2;
  const points = gearVertices(radius, teeth);
  const notchY = -radius * .63;
  const notchLength = Math.max(7.5, radius * .23);

  return <g className="gear-motion">
    <defs>
      <linearGradient id={`${prefix}-gear-face`} x1=".12" y1=".08" x2=".87" y2=".94">
        <stop stopColor="#d7bb7d"/>
        <stop offset=".33" stopColor="#c0a065"/>
        <stop offset=".7" stopColor="#b29055"/>
        <stop offset="1" stopColor="#98763f"/>
      </linearGradient>
      <linearGradient id={`${prefix}-gear-bevel`} x1=".1" y1="0" x2=".8" y2="1">
        <stop stopColor="#e5cd95"/>
        <stop offset=".48" stopColor="#b6975e"/>
        <stop offset="1" stopColor="#795b32"/>
      </linearGradient>
      <linearGradient id={`${prefix}-gear-side`} x1="0" y1="0" x2="0" y2="1">
        <stop stopColor="#a1834b"/>
        <stop offset="1" stopColor="#564126"/>
      </linearGradient>
      <linearGradient id={`${prefix}-gear-pocket`} x1=".1" y1="0" x2=".6" y2="1">
        <stop stopColor="#172820"/>
        <stop offset=".42" stopColor="#27372c"/>
        <stop offset="1" stopColor="#3b4430"/>
      </linearGradient>
      <radialGradient id={`${prefix}-gear-hub`} cx=".3" cy=".22" r=".85">
        <stop stopColor="#d9c08a"/>
        <stop offset=".64" stopColor="#ba985d"/>
        <stop offset="1" stopColor="#8a6a3b"/>
      </radialGradient>
    </defs>

    {/* Each visible tooth flank is a face, rather than an offset outline. */}
    {points.map((point, index) => {
      const next = points[(index + 1) % points.length];
      if (next.x >= point.x) return null;
      return <path key={index}
        d={`M${point.x} ${point.y}L${next.x} ${next.y}L${next.x} ${next.y + thickness}L${point.x} ${point.y + thickness}Z`}
        fill={index % 4 === 1 ? '#9b7d45' : `url(#${prefix}-gear-side)`}
        stroke="#69502e" strokeWidth=".3" strokeLinejoin="round"/>;
    })}
    <path d={gearPath(radius, teeth)} fill={`url(#${prefix}-gear-bevel)`}/>
    <path d={gearPath(radius - .8, teeth)} fill={`url(#${prefix}-gear-face)`}/>
    <circle r={radius * .71} fill="none" stroke="#816333" strokeWidth=".75"/>
    <path d={`M${-radius * .63} ${radius * .27}A${radius * .69} ${radius * .69} 0 0 0 ${radius * .55} ${radius * .42}`}
      fill="none" stroke="#ddc48b" strokeWidth=".55" opacity=".62"/>

    {Array.from({ length: holeCount }, (_, index) => {
      // Leave a solid web at twelve o'clock for the readable engraved marks.
      const angle = -Math.PI / 4 + index * Math.PI * 1.5 / (holeCount - 1);
      const x = Math.cos(angle) * radius * .43;
      const y = Math.sin(angle) * radius * .43;
      const rx = radius * .112;
      const ry = radius * .173;
      return <g key={index} transform={`translate(${x} ${y}) rotate(${angle * 180 / Math.PI - 90})`}>
        <ellipse rx={rx + .65} ry={ry + .65} fill="#9b7a43"/>
        <ellipse cy=".5" rx={rx} ry={ry} fill={`url(#${prefix}-gear-pocket)`}/>
        <path d={`M${-rx * .82} ${ry * .28}A${rx * .88} ${ry * .88} 0 0 0 ${rx * .82} ${ry * .28}`}
          fill="none" stroke="#d1b77b" strokeWidth=".65"/>
        <path d={`M${-rx * .8} ${-ry * .25}A${rx * .9} ${ry * .9} 0 0 1 ${rx * .8} ${-ry * .25}`}
          fill="none" stroke="#665030" strokeWidth=".9"/>
      </g>;
    })}

    <circle cy="1.5" r={radius * .245} fill="#795e35"/>
    <circle r={radius * .245} fill={`url(#${prefix}-gear-hub)`} stroke="#d5bb81" strokeWidth=".55"/>
    <circle r="4.6" fill="#6b542f"/>
    <circle cy=".45" r="3.9" fill="#1b2e25"/>
    <path d="M-3.4 2.1A4 4 0 0 0 3.4 2.1" fill="none" stroke="#ddc18a" strokeWidth=".75"/>

    <g className="gear-count-marks" aria-hidden="true">
      {Array.from({ length: gear.notches }, (_, index) => {
        const x = (index - (gear.notches - 1) / 2) * 8;
        return <g key={index}>
          <path d={`M${x + 1.15} ${notchY + .8}v${notchLength}`} fill="none" stroke="#e4cf9a" strokeWidth="4.2" strokeLinecap="round"/>
          <path d={`M${x} ${notchY}v${notchLength}`} fill="none" stroke="#3e301e" strokeWidth="3.8" strokeLinecap="round"/>
          <path d={`M${x - .6} ${notchY + .8}v${notchLength - 1.6}`} fill="none" stroke="#6d502c" strokeWidth=".8" strokeLinecap="round"/>
        </g>;
      })}
    </g>

    <path d={`M${-radius * .59} ${-radius * .36}A${radius * .69} ${radius * .69} 0 0 1 ${-radius * .28} ${-radius * .62}`}
      fill="none" stroke="#e6d2a2" strokeWidth=".65" opacity=".58"/>
    <path d={`M${radius * .44} ${radius * .48}A${radius * .65} ${radius * .65} 0 0 0 ${radius * .57} ${radius * .3}`}
      fill="none" stroke="#7b5d31" strokeWidth=".55" opacity=".5"/>
  </g>;
}
