import { useEffect, useState } from "react";

const styles = `
  @keyframes bar1Drop {
    0%   { transform: translateY(-6px); opacity: 0; }
    12%  { transform: translateY(-6px); opacity: 0.75; }
    42%  { transform: translateY(0px);  opacity: 0.75; }
    58%  { transform: translateY(3px) scaleX(0.8);  opacity: 0.35; }
    70%  { transform: translateY(5px) scaleX(0.5); opacity: 0; }
    100% { transform: translateY(5px) scaleX(0.5); opacity: 0; }
  }
  @keyframes bar2Drop {
    0%   { transform: translateY(-4px); opacity: 0; }
    30%  { transform: translateY(-4px); opacity: 0; }
    42%  { transform: translateY(-4px); opacity: 0.55; }
    65%  { transform: translateY(0px);  opacity: 0.55; }
    78%  { transform: translateY(3px) scaleX(0.7);  opacity: 0.2; }
    88%  { transform: translateY(5px) scaleX(0.4); opacity: 0; }
    100% { transform: translateY(5px) scaleX(0.4); opacity: 0; }
  }
  .moving-bar1 {
    animation: bar1Drop 1.5s ease-in-out infinite;
    transform-origin: center bottom;
  }
  .moving-bar2 {
    animation: bar2Drop 1.5s ease-in-out infinite;
    transform-origin: center bottom;
  }
`;

export default function MovingIndicator({ size = 40, label, delay = 0 }) {
  const [injected, setInjected] = useState(false);

  useEffect(() => {
    if (injected) return;
    const id = "moving-indicator-styles";
    if (!document.getElementById(id)) {
      const style = document.createElement("style");
      style.id = id;
      style.textContent = styles;
      document.head.appendChild(style);
    }
    setInjected(true);
  }, [injected]);

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 8,
    }}>
      <svg
        width={size}
        height={size * 1.1}
        viewBox="0 0 44 48"
        fill="none"
      >
        <line className="moving-bar2"
          x1="14" y1="6" x2="30" y2="6"
          stroke="#a8a29e" strokeWidth="2.5" strokeLinecap="round"
          opacity="0"
          style={{ animationDelay: `${delay}ms` }}
        />
        <line className="moving-bar1"
          x1="11" y1="13" x2="33" y2="13"
          stroke="#a8a29e" strokeWidth="2.5" strokeLinecap="round"
          opacity="0"
          style={{ animationDelay: `${delay}ms` }}
        />
        <rect x="4" y="20" width="36" height="24" rx="4"
          stroke="#78716c" strokeWidth="2.5" fill="none"
        />
      </svg>
      {label && (
        <span style={{
          color: "#78716c",
          fontSize: 15,
          fontWeight: 500,
        }}>
          {label}
        </span>
      )}
    </div>
  );
}