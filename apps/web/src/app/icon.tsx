import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

/** App icon for browser tabs and the installed app. Edit the colours in theme.css terms if the brand changes. */
export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#1b1b36",
        color: "#c8a84b",
        fontSize: 230,
        fontWeight: 800,
        letterSpacing: -8,
      }}
    >
      CK
    </div>,
    size,
  );
}
