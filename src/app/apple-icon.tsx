import { ImageResponse } from "next/og";

/**
 * iOS home-screen icon.
 *
 * Generated rather than committed as a binary: iOS ignores SVG favicons, and
 * rasterising `icon.svg` with the tooling available on macOS dropped the
 * gradient. Next.js renders this at build time, so the PNG can never drift
 * out of step with the SVG.
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const GRADIENT = "linear-gradient(135deg, #12B5CB 0%, #5FD3E0 55%, #F97316 100%)";

function bar(top: number, left: number, width: number, height: number) {
  return (
    <div
      style={{
        position: "absolute",
        top,
        left,
        width,
        height,
        borderRadius: height / 2,
        backgroundImage: GRADIENT,
      }}
    />
  );
}

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: "#0F1720",
        }}
      >
        {/* Spine */}
        {bar(40, 40, 25, 100)}
        {/* Arms, ascending in length so the letter also reads as a ranking */}
        {bar(40, 40, 73, 25)}
        {bar(78, 40, 59, 25)}
        {bar(115, 40, 90, 25)}
      </div>
    ),
    size,
  );
}
