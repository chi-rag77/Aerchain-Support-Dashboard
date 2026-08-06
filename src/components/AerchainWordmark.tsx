import { useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
  height?: number;
  inverted?: boolean;
}

/**
 * Aerchain wordmark.
 *
 * Tries to load /logos/aerchain-wordmark.png first (the real brand asset).
 * Falls back to an SVG-drawn recreation if the file isn't present.
 *
 * To use the real logo: save the PNG as public/logos/aerchain-wordmark.png
 */
export const AerchainWordmark = ({ className, height = 22, inverted = false }: Props) => {
  const [imgFailed, setImgFailed] = useState(false);
  const letterColor = inverted ? "#FFFFFF" : "#1A1A1A";

  if (!imgFailed) {
    return (
      <img
        src="/logos/aerchain-wordmark.png"
        alt="Aerchain"
        height={height}
        style={{ height, width: "auto", display: "block", ...(inverted ? { filter: "brightness(0) invert(1)" } : {}) }}
        className={cn("shrink-0", className)}
        onError={() => setImgFailed(true)}
      />
    );
  }

  // ── Fallback: SVG-drawn wordmark ─────────────────────────────────────────
  const glyphH = height * 1.05;
  const glyphW = glyphH * (68 / 80);

  return (
    <span
      className={cn("inline-flex items-center select-none", className)}
      style={{
        fontFamily: "'Plus Jakarta Sans','Futura','Century Gothic','Arial Black',sans-serif",
        fontWeight: 800,
        fontSize: height,
        letterSpacing: "-0.01em",
        lineHeight: 1,
        color: letterColor,
      }}
    >
      <span style={{ color: letterColor }}>AERCH</span>

      {/* Orange Ai glyph */}
      <svg
        width={glyphW}
        height={glyphH}
        viewBox="0 0 68 80"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: "inline-block", verticalAlign: "middle", margin: "0 1px" }}
        aria-hidden
      >
        <path
          d="M 9 72 C 4 68 3 58 7 46 L 18 16 C 22 5 31 1 40 4 C 49 7 53 17 50 30 L 40 64 C 38 70 33 76 26 74"
          stroke="#E8431C" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" fill="none"
        />
        <line x1="13" y1="46" x2="48" y2="46" stroke="#E8431C" strokeWidth="9" strokeLinecap="round" />
        <circle cx="62" cy="10" r="7" fill="#E8431C" />
      </svg>

      <span style={{ color: letterColor }}>N</span>
    </span>
  );
};
