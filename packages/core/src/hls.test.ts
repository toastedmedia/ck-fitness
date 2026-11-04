import { describe, expect, it } from "vitest";
import {
  hlsPrefix,
  needsRendition,
  playlistUris,
  rewritePlaylist,
  safeHlsFile,
  variantOf,
} from "./hls";

const master = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=5500000,RESOLUTION=1920x1080
v0/index.m3u8

#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360
v1/index.m3u8
`;

const media = `#EXTM3U
#EXT-X-TARGETDURATION:6
#EXT-X-PLAYLIST-TYPE:VOD
#EXT-X-MAP:URI="init.mp4"
#EXTINF:6.000000,
seg_00000.ts
#EXTINF:6.000000,
seg_00001.ts
#EXT-X-ENDLIST
`;

describe("hls playlists", () => {
  it("finds every file a playlist names", () => {
    expect(playlistUris(master)).toEqual(["v0/index.m3u8", "v1/index.m3u8"]);
    expect(playlistUris(media)).toEqual(["init.mp4", "seg_00000.ts", "seg_00001.ts"]);
  });

  it("swaps file names for links and keeps everything else", () => {
    const out = rewritePlaylist(media, (u) => `https://x/${u}?sig=1`);
    expect(out).toContain('#EXT-X-MAP:URI="https://x/init.mp4?sig=1"');
    expect(out).toContain("https://x/seg_00001.ts?sig=1");
    expect(out).toContain("#EXT-X-ENDLIST");
    expect(out).toContain("#EXTINF:6.000000,");
    expect(rewritePlaylist(master, (u) => `/api/hls/l/${variantOf(u)}.m3u8`)).toContain(
      "/api/hls/l/v1.m3u8",
    );
  });

  it("only serves files from the video's own folder", () => {
    expect(safeHlsFile("master.m3u8")).toBe("master.m3u8");
    expect(safeHlsFile("v2/index.m3u8")).toBe("v2/index.m3u8");
    expect(safeHlsFile("v0/seg_00012.ts")).toBe("v0/seg_00012.ts");
    expect(safeHlsFile("../lessons/x.mp4")).toBeNull();
    expect(safeHlsFile("v0/../../secret.ts")).toBeNull();
    expect(variantOf("v3/index.m3u8")).toBe("v3");
    expect(variantOf("v3/seg_00001.ts")).toBeNull();
    expect(hlsPrefix("lessons/a/1-b.mp4")).toBe("hls/lessons/a/1-b.mp4");
  });

  it("knows which videos still need streaming versions", () => {
    const now = Date.parse("2026-11-04T12:00:00Z");
    const at = (h: number) => new Date(now - h * 3600_000).toISOString();
    expect(needsRendition(undefined, now)).toBe(true);
    expect(needsRendition({ status: "failed", updated_at: at(0) }, now)).toBe(true);
    expect(needsRendition({ status: "ready", updated_at: at(100) }, now)).toBe(false);
    expect(needsRendition({ status: "processing", updated_at: at(1) }, now)).toBe(false);
    expect(needsRendition({ status: "queued", updated_at: at(7) }, now)).toBe(true);
  });
});
