export type FrameScene = "pier" | "night" | "window";

export function LabFrame({
  scene,
  title,
  stamp,
  id,
}: {
  scene: FrameScene;
  title: string;
  stamp?: string;
  id: string;
}) {
  return (
    <div className="lab-swipe-photo" role="img" aria-label={title}>
      {scene === "pier" ? <Pier id={id} /> : scene === "night" ? <Night id={id} /> : <Window id={id} />}
      <span className="lab-swipe-grain" aria-hidden="true" />
      <span className="lab-swipe-leak" data-scene={scene} aria-hidden="true" />
      {stamp ? <span className="lab-swipe-date">{stamp}</span> : null}
    </div>
  );
}

function Pier({ id }: { id: string }) {
  const sky = `${id}-sky`;
  const sun = `${id}-sun`;
  const sea = `${id}-sea`;
  const vig = `${id}-vig`;
  return (
    <svg viewBox="0 0 400 400" aria-hidden="true">
      <defs>
        <linearGradient id={sky} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd7a6" />
          <stop offset="0.38" stopColor="#ffb06a" />
          <stop offset="0.62" stopColor="#ff8ec8" />
          <stop offset="1" stopColor="#3a2866" />
        </linearGradient>
        <radialGradient id={sun} cx="0.7" cy="0.42" r="0.32">
          <stop offset="0" stopColor="#fff4dc" />
          <stop offset="0.45" stopColor="#ffb06a" />
          <stop offset="1" stopColor="#ffb06a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={sea} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4a3278" />
          <stop offset="1" stopColor="#140c22" />
        </linearGradient>
        <radialGradient id={vig} cx="50%" cy="46%" r="72%">
          <stop offset="58%" stopColor="#140818" stopOpacity="0" />
          <stop offset="100%" stopColor="#140818" stopOpacity="0.5" />
        </radialGradient>
      </defs>
      <rect width="400" height="400" fill={`url(#${sky})`} />
      <circle cx="278" cy="168" r="92" fill={`url(#${sun})`} />
      <circle cx="278" cy="168" r="28" fill="#fff1d4" />
      <ellipse cx="36" cy="214" rx="130" ry="26" fill="#2a1844" />
      <rect y="214" width="400" height="186" fill={`url(#${sea})`} />
      <ellipse cx="278" cy="268" rx="16" ry="52" fill="#ffb06a" opacity="0.42" />
      <ellipse cx="278" cy="300" rx="8" ry="28" fill="#fff1d4" opacity="0.28" />
      <path d="M18 400 L154 400 L176 232 L64 246 Z" fill="#1a1028" />
      <path d="M78 250 L168 238" stroke="#f7f2ea" strokeWidth="2" opacity="0.45" />
      <path d="M92 268 L104 400" stroke="#120818" strokeWidth="6" />
      <path d="M124 258 L132 400" stroke="#120818" strokeWidth="6" />
      <rect width="400" height="400" fill={`url(#${vig})`} />
    </svg>
  );
}

function Night({ id }: { id: string }) {
  const sky = `${id}-sky`;
  const glow = `${id}-glow`;
  const vig = `${id}-vig`;
  const windows = [
    [28, 176],
    [46, 176],
    [28, 198],
    [98, 132],
    [116, 132],
    [98, 154],
    [116, 176],
    [176, 108],
    [198, 108],
    [176, 132],
    [262, 164],
    [280, 164],
    [262, 186],
    [334, 128],
    [352, 128],
    [334, 152],
    [352, 176],
  ];
  return (
    <svg viewBox="0 0 400 400" aria-hidden="true">
      <defs>
        <linearGradient id={sky} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1a1038" />
          <stop offset="0.55" stopColor="#3a2866" />
          <stop offset="1" stopColor="#12081c" />
        </linearGradient>
        <filter id={glow} x="-40%" y="-80%" width="180%" height="260%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <radialGradient id={vig} cx="50%" cy="42%" r="74%">
          <stop offset="60%" stopColor="#07060f" stopOpacity="0" />
          <stop offset="100%" stopColor="#07060f" stopOpacity="0.62" />
        </radialGradient>
      </defs>
      <rect width="400" height="400" fill={`url(#${sky})`} />
      <rect x="0" y="168" width="86" height="232" fill="#100818" />
      <rect x="78" y="118" width="78" height="282" fill="#1a1030" />
      <rect x="156" y="86" width="96" height="314" fill="#140c28" />
      <rect x="246" y="146" width="78" height="254" fill="#1c1234" />
      <rect x="318" y="104" width="82" height="296" fill="#12081e" />
      {windows.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="12" height="16" rx="1" fill="#ffb06a" opacity="0.9" />
      ))}
      <rect x="188" y="214" width="14" height="16" rx="1" fill="#8eecff" />
      <rect x="206" y="214" width="14" height="16" rx="1" fill="#8eecff" />
      <rect x="178" y="248" width="64" height="14" rx="3" fill="#3ad4ff" filter={`url(#${glow})`} opacity="0.85" />
      <rect x="178" y="248" width="64" height="14" rx="3" fill="#bff6ff" />
      <rect y="328" width="400" height="72" fill="#0c0a16" />
      <ellipse cx="210" cy="352" rx="36" ry="8" fill="#3ad4ff" opacity="0.35" />
      <rect width="400" height="400" fill={`url(#${vig})`} />
    </svg>
  );
}

function Window({ id }: { id: string }) {
  const wall = `${id}-wall`;
  const glass = `${id}-glass`;
  const vig = `${id}-vig`;
  return (
    <svg viewBox="0 0 400 400" aria-hidden="true">
      <defs>
        <linearGradient id={wall} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f3ddc4" />
          <stop offset="1" stopColor="#e4c2a4" />
        </linearGradient>
        <linearGradient id={glass} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f7fbff" />
          <stop offset="0.55" stopColor="#bff6ff" />
          <stop offset="1" stopColor="#8eecff" />
        </linearGradient>
        <radialGradient id={vig} cx="50%" cy="40%" r="75%">
          <stop offset="62%" stopColor="#1a1028" stopOpacity="0" />
          <stop offset="100%" stopColor="#1a1028" stopOpacity="0.28" />
        </radialGradient>
      </defs>
      <rect width="400" height="400" fill={`url(#${wall})`} />
      <rect x="86" y="36" width="228" height="236" rx="6" fill={`url(#${glass})`} />
      <rect x="196" y="36" width="8" height="236" fill="#f7f2ea" opacity="0.85" />
      <rect x="86" y="146" width="228" height="8" fill="#f7f2ea" opacity="0.85" />
      <ellipse cx="118" cy="292" rx="28" ry="16" fill="#2f6a45" />
      <ellipse cx="146" cy="284" rx="22" ry="18" fill="#3d7d52" />
      <ellipse cx="132" cy="276" rx="16" ry="14" fill="#245438" />
      <rect x="122" y="300" width="22" height="18" rx="3" fill="#c47a55" />
      <rect y="318" width="400" height="18" fill="#d7b48f" />
      <rect y="336" width="400" height="64" fill="#c9966e" />
      <ellipse cx="250" cy="362" rx="22" ry="10" fill="#f7f2ea" />
      <rect x="236" y="348" width="28" height="16" rx="8" fill="#fffaf4" />
      <rect width="400" height="400" fill={`url(#${vig})`} />
    </svg>
  );
}
