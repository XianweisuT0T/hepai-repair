import { DepthLayer } from './ObjectDepth';

const backLeft = 'M0 38L-6-56L-17-4L-45-20L-31 14L-58 28L-21 32L0 38Z';
const backRight = 'M0 38L17-55L23-7L50-24L34 13L59 26L23 31L0 38Z';
const frontLeft = 'M0 38L0-38L-10-13L-22 2L-8 4L-24 20L-6 19L-17 32Z';
const frontRight = 'M0 38V-38L9-14L21 3L8 4L24 20L6 19L17 32Z';
const moon = 'M7-21A22 22 0 1 0 18 14A18 18 0 0 1 7-21Z';
const star = 'M0-22L6.4-7.4L22-6.8L10.6 3.8L14 20L0 11.6L-14 20L-10.6 3.8L-22-6.8L-6.4-7.4Z';

/** Fixed paper theatre in the box's SVG coordinates; the parent owns camera motion. */
export function PaperTheatre({ prefix }: { prefix: string }) {
  return <g className="paper-theatre" pointerEvents="none" aria-hidden="true">
    <defs>
      <linearGradient id={`${prefix}-paper-stage-metal`} x1="0" y1="0" x2="0" y2="1">
        <stop stopColor="#eed9a4"/><stop offset=".36" stopColor="#c5ad77"/>
        <stop offset="1" stopColor="#887548"/>
      </linearGradient>
      <linearGradient id={`${prefix}-paper-stage-edge`} x1="0" y1="0" x2="0" y2="1">
        <stop stopColor="#bda16a"/><stop offset="1" stopColor="#75623e"/>
      </linearGradient>
      <radialGradient id={`${prefix}-paper-contact`}>
        <stop stopColor="#122b25" stopOpacity=".48"/>
        <stop offset=".58" stopColor="#122b25" stopOpacity=".19"/>
        <stop offset="1" stopColor="#122b25" stopOpacity="0"/>
      </radialGradient>
      <radialGradient id={`${prefix}-paper-ambient`}>
        <stop stopColor="#e3d8a4" stopOpacity=".13"/>
        <stop offset=".67" stopColor="#d8d7ac" stopOpacity=".035"/>
        <stop offset="1" stopColor="#d8d7ac" stopOpacity="0"/>
      </radialGradient>
    </defs>

    {/* The pedestal stays at (500, 309), outside the moving sculpture. Its
        contact shadows are simple gradient geometry rather than SVG filters. */}
    <g className="paper-pedestal">
      <DepthLayer name="paper-stage-base" depth={.5}>
        <g className="paper-stage-base" transform="translate(500 309)">
          <ellipse cy="10" rx="74" ry="13" fill={`url(#${prefix}-paper-contact)`}/>
          <path d="M-61-1A61 10 0 0 0 61-1V5A61 10 0 0 1-61 5Z" fill={`url(#${prefix}-paper-stage-edge)`} stroke="#74613e" strokeWidth=".75"/>
          <ellipse rx="61" ry="10" fill={`url(#${prefix}-paper-stage-metal)`} stroke="#b49b64" strokeWidth=".9"/>
          <ellipse cy="-2.5" rx="56" ry="8" fill="#d1c08e" stroke="#e9d7a4" strokeWidth=".6"/>
          <path d="M-47 4Q0 11 47 4" fill="none" stroke="#f1dba5" strokeWidth=".75" opacity=".5"/>
          {/* Narrow stem and paper feet sit on, and visibly shade, the top face. */}
          <ellipse cx="1" cy="-3.5" rx="32" ry="5.8" fill={`url(#${prefix}-paper-contact)`}/>
          <ellipse cx="-52" cy="-3" rx="8" ry="2.6" fill={`url(#${prefix}-paper-contact)`}/>
          <ellipse cx="44" cy="-3" rx="8" ry="2.6" fill={`url(#${prefix}-paper-contact)`}/>
          <path d="M-6-18H6V-3Q0 0-6-3Z" fill="#ab9669" stroke="#897b55" strokeWidth=".65"/>
          <path d="M-4-17V-4" stroke="#e4d3a0" strokeWidth="1" opacity=".6"/>
          <ellipse cy="-18" rx="6" ry="2" fill="#d9c999"/>
        </g>
      </DepthLayer>
    </g>

    {/* This physical origin never follows the lid. Depth wrappers have no
        static transform; their children own placement, so parallax cannot
        overwrite the tree, moon or star anchors. Painter order is deliberate:
        moon -> rear paper -> stars -> front folded paper. */}
    <g className="paper-sculpture" transform="translate(500 262)">
      <ellipse cy="-6" rx="99" ry="90" fill={`url(#${prefix}-paper-ambient)`}/>
      <g className="paper-motion">
        <DepthLayer name="paper-moon" depth={.32}>
          <g className="paper-moon" transform="translate(-57 -30)">
            <path d="M3 21V68" fill="none" stroke="#a89667" strokeWidth="1.5"/>
            <path d="M2.6 23V66" fill="none" stroke="#e5d39b" strokeWidth=".55"/>
            <g transform="rotate(-13)">
              <path d={moon} transform="translate(1.4 1.7)" fill="#aaa16f" stroke="#a29a6c" strokeWidth=".6"/>
              <path d={moon} fill="#e3d69f" stroke="#f4e8b6" strokeWidth=".7"/>
              <path d="M-2-17C-16-7-18 7-7 18" fill="none" stroke="#b3ac7f" strokeWidth=".8" opacity=".65"/>
              <path d="M-9-16A20 20 0 0 0-15 8" fill="none" stroke="#fff1bf" strokeWidth=".6" opacity=".7"/>
            </g>
          </g>
        </DepthLayer>

        <DepthLayer name="paper-tree-back" depth={.4}>
          <g className="paper-tree-back" transform="translate(0 0)">
            {/* A shallow offset gives the cut edge thickness; the pale rear
                faces retain the old silhouette and stay quieter than the fold. */}
            <path d={backLeft} transform="translate(1.4 1.5)" fill="#536c60"/>
            <path d={backRight} transform="translate(1.4 1.5)" fill="#73876c"/>
            <path d={backLeft} fill="#7d9587" stroke="#c2d0ad" strokeWidth=".7"/>
            <path d={backRight} fill="#9eaf96" stroke="#d8dcc0" strokeWidth=".7"/>
            <path d="M0 36L-17-4L-31 14L-21 32Z" fill="#bdc7a7"/>
            <path d="M0 36L23-7L34 13L23 31Z" fill="#d0d2ad"/>
            <path d="M-6-51L0 34L17-50" fill="none" stroke="#e1e3c3" strokeWidth=".65" opacity=".5"/>
            <path d="M-40 24L-21 28M35 24L49 22" stroke="#e1e3c3" strokeWidth=".55" opacity=".35"/>
          </g>
        </DepthLayer>

        <DepthLayer name="paper-stars" depth={.22}>
          <g className="paper-stars" transform="translate(44 -40)">
            <path d="M0 10V78" fill="none" stroke="#aa9768" strokeWidth="1.2"/>
            <path d="M-.4 13V74" fill="none" stroke="#ead8a6" strokeWidth=".45"/>
            <g transform="scale(.54)">
              <path d={star} transform="translate(1.6 1.7)" fill="#a59a71"/>
              <path d={star} fill="#e8d7a2" stroke="#f4e7bb" strokeWidth=".8"/>
              <path d="M0-17L0 9L10 15" fill="none" stroke="#c8ba8b" strokeWidth=".65" opacity=".7"/>
            </g>
            <path d="M-119 47l3-7 3 7 7 2-7 3-3 7-3-7-7-3ZM22 37l2-5 2 5 5 2-5 2-2 5-2-5-5-2Z" fill="#d8d4b0" opacity=".78"/>
            <path d="M-98 60Q-64 46-44 56Q-18 40 0 58" fill="none" stroke="#d5c691" strokeWidth=".8" strokeDasharray="2 3" opacity=".5"/>
          </g>
        </DepthLayer>

        <DepthLayer name="paper-tree-front" depth={.72}>
          <g className="paper-tree-front" transform="translate(0 0)">
            {/* Small cast shadow falls onto the rear sheet, then a thin edge
                and brighter two-faced fold make the front sheet stand forward. */}
            <path d={`${frontLeft} ${frontRight}`} transform="translate(3 2)" fill="#29463b" opacity=".13"/>
            <path d={frontLeft} transform="translate(1.2 1.6)" fill="#a1ad90"/>
            <path d={frontRight} transform="translate(1.2 1.6)" fill="#94a184"/>
            <path d={frontLeft} fill="#e7e4c9" stroke="#c4ccb0" strokeWidth=".6"/>
            <path d={frontRight} fill="#d2d9ba" stroke="#aebd9f" strokeWidth=".6"/>
            <path d="M0-39V38" stroke="#f1f1d9" strokeWidth="1.15"/>
            <path d="M-9 4L0 8L8 4M-6 19L0 24L6 19" fill="none" stroke="#f2efd5" strokeWidth=".6" opacity=".65"/>
            <path d="M-3 37L0 39L4 37" fill="none" stroke="#a9b393" strokeWidth=".8"/>
          </g>
        </DepthLayer>
      </g>
    </g>
  </g>;
}
