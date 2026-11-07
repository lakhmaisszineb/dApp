import { useEffect, useRef } from "react";
import EncouragementMessage from "./EncouragementMessage.jsx";

/**
 * Personnage SVG original.
 * Les pupilles suivent le pointeur avec un déplacement limité.
 * L'animation est désactivée sur écran tactile et en mode
 * « réduction des animations ».
 */
export default function TiwiziCompanion() {
  const svgRef = useRef(null);
  const eyesRef = useRef(null);

  useEffect(() => {
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    );

    const finePointer = window.matchMedia("(pointer: fine)");

    let frame = 0;
    let pointer = { x: 0, y: 0 };

    function reset() {
      eyesRef.current?.setAttribute("transform", "translate(0 0)");
    }

    function update() {
      frame = 0;

      const svg = svgRef.current;

      if (!svg || !eyesRef.current) return;

      const rect = svg.getBoundingClientRect();

      const dx = pointer.x - (rect.left + rect.width / 2);
      const dy = pointer.y - (rect.top + rect.height / 2);

      const distance = Math.hypot(dx, dy) || 1;
      const movement = Math.min(distance / 35, 7);

      const x = (dx / distance) * movement;
      const y = (dy / distance) * movement;

      eyesRef.current.setAttribute(
        "transform",
        `translate(${x} ${y})`
      );
    }

    function move(event) {
      if (reducedMotion.matches || !finePointer.matches) {
        reset();
        return;
      }

      pointer = { x: event.clientX, y: event.clientY };

      if (!frame) {
        frame = window.requestAnimationFrame(update);
      }
    }

    window.addEventListener("pointermove", move, { passive: true });
    document.documentElement.addEventListener("pointerleave", reset);
    reducedMotion.addEventListener("change", reset);
    finePointer.addEventListener("change", reset);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", reset);
      reducedMotion.removeEventListener("change", reset);
      finePointer.removeEventListener("change", reset);
    };
  }, []);

  return (
    <div className="taa-zur-companion" aria-hidden="true">
      <svg
        ref={svgRef}
        viewBox="0 0 420 420"
        fill="none"
        focusable="false"
      >
        {/* Motif circulaire en arrière-plan */}
        <circle cx="210" cy="210" r="174" fill="#EEF3FF" />
        <circle
          cx="210"
          cy="210"
          r="149"
          stroke="#CCD9FA"
          strokeDasharray="4 10"
        />

        {/* Éléments qui entourent le personnage */}
        <rect
          x="49"
          y="103"
          width="47"
          height="47"
          rx="13"
          fill="#FFD43B"
          transform="rotate(-15 49 103)"
        />

        <circle cx="344" cy="258" r="22" fill="#F45100" />

        <path
          d="M320 86v28M306 100h28"
          stroke="#0755E9"
          strokeWidth="8"
          strokeLinecap="round"
        />

        <path
          d="M77 293l13 13-13 13-13-13 13-13Z"
          fill="#0755E9"
        />

        {/* Ombre */}
        <ellipse
          cx="213"
          cy="334"
          rx="98"
          ry="14"
          fill="#D9E3F8"
        />

        {/* Corps inspiré de bandes entrelacées */}
        <rect
          x="116"
          y="128"
          width="192"
          height="184"
          rx="50"
          fill="#0755E9"
        />

        <path
          d="M139 144l145 144"
          stroke="#FFD43B"
          strokeWidth="30"
        />

        <path
          d="M284 144L139 288"
          stroke="#F45100"
          strokeWidth="30"
        />

        {/* Visage */}
        <rect
          x="143"
          y="180"
          width="138"
          height="75"
          rx="32"
          fill="#FFFFFF"
        />

        <g ref={eyesRef}>
          <circle cx="184" cy="215" r="10" fill="#172033" />
          <circle cx="240" cy="215" r="10" fill="#172033" />
          <circle cx="187" cy="212" r="3" fill="#FFFFFF" />
          <circle cx="243" cy="212" r="3" fill="#FFFFFF" />
        </g>

        {/* Petits pieds */}
        <path
          d="M165 312v15M259 312v15"
          stroke="#172033"
          strokeWidth="13"
          strokeLinecap="round"
        />
      </svg>

      <div className="companion-caption">
        <span className="companion-caption-mark" />
        <EncouragementMessage />
      </div>
    </div>
  );
}