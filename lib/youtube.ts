const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

function validVideoId(value: string | null | undefined): string | null {
  const candidate = value?.trim() ?? "";
  return YOUTUBE_VIDEO_ID_PATTERN.test(candidate) ? candidate : null;
}

export function getYouTubeVideoId(value: string): string | null {
  const input = value.trim();

  if (!input) {
    return null;
  }

  let parsed: URL;

  try {
    parsed = new URL(input);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return null;
  }

  const host = parsed.hostname.toLowerCase();

  if (host === "youtu.be" || host === "www.youtu.be") {
    return validVideoId(parsed.pathname.split("/").filter(Boolean)[0]);
  }

  if (!YOUTUBE_HOSTS.has(host)) {
    return null;
  }

  if (parsed.pathname === "/watch") {
    return validVideoId(parsed.searchParams.get("v"));
  }

  const [kind, id] = parsed.pathname.split("/").filter(Boolean);

  if (["embed", "shorts", "live"].includes(kind)) {
    return validVideoId(id);
  }

  return null;
}

export function normalizeYouTubeUrl(value: string): string | null {
  const videoId = getYouTubeVideoId(value);
  return videoId ? `https://www.youtube.com/watch?v=${videoId}` : null;
}

export function getYouTubeEmbedUrl(value: string): string | null {
  const videoId = getYouTubeVideoId(value);

  if (!videoId) {
    return null;
  }

  const params = new URLSearchParams({
    autoplay: "1",
    mute: "1",
    playsinline: "1",
    rel: "0",
  });

  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}
