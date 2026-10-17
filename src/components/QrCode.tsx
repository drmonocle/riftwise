/** A QR code for a short text (a one-time sign-in link), drawn as SVG: black on white so every phone camera reads it. */
import React, { useMemo } from "react";
import qrcode from "qrcode-generator";

export const QrCode: React.FC<{ text: string; size?: number; label?: string }> = ({ text, size = 200, label }) => {
  const { n, path } = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    const count = qr.getModuleCount();
    let d = "";
    for (let r = 0; r < count; r++)
      for (let c = 0; c < count; c++) if (qr.isDark(r, c)) d += `M${c + 4},${r + 4}h1v1h-1z`;
    return { n: count + 8, path: d }; // 4 modules of white border all round (the quiet zone scanners need)
  }, [text]);
  return (
    <svg viewBox={`0 0 ${n} ${n}`} width={size} height={size} role="img" aria-label={label} shapeRendering="crispEdges" className="rounded-lg">
      <rect width={n} height={n} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  );
};
