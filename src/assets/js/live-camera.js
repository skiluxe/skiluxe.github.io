const CFG = window.SKILUXE_CONFIG || {};

function playerVars() {
  return {
    autoplay: 1,
    mute: 1,
    playsinline: 1,
    rel: 0,
    modestbranding: 1,
    enablejsapi: 1,
    origin: window.location.origin,
  };
}

function loadYouTubeIframeApi() {
  return new Promise((resolve) => {
    if (window.YT?.Player) return resolve(window.YT);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prev === "function") prev();
      resolve(window.YT);
    };
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(script);
    }
  });
}

async function fetchLiveStatus() {
  if (!CFG.apiBase) return { videoId: null };
  try {
    const res = await fetch(`${CFG.apiBase}/api/youtube/live`);
    if (!res.ok) return { videoId: null };
    const data = await res.json();
    return { videoId: data.live && data.videoId ? data.videoId : null };
  } catch (_) {
    return { videoId: null };
  }
}

function channelEmbedSrc(channelId) {
  const params = new URLSearchParams({
    autoplay: "1",
    mute: "1",
    playsinline: "1",
    rel: "0",
    modestbranding: "1",
    enablejsapi: "1",
    origin: window.location.origin,
  });
  return `https://www.youtube.com/embed/live_stream?channel=${encodeURIComponent(channelId)}&${params}`;
}

async function initLiveCamera() {
  const mount = document.getElementById("live-camera-embed");
  if (!mount) return;

  const channelId = mount.dataset.channelId;
  if (!channelId) return;

  const { videoId } = await fetchLiveStatus();
  const title = mount.dataset.title || "Live stream";

  try {
    const YT = await loadYouTubeIframeApi();
    mount.replaceChildren();

    if (videoId) {
      const holder = document.createElement("div");
      holder.id = "live-camera-player";
      holder.style.width = "100%";
      holder.style.height = "100%";
      mount.appendChild(holder);

      new YT.Player(holder, {
        videoId,
        width: "100%",
        height: "100%",
        playerVars: playerVars(),
        events: {
          onReady: (event) => {
            event.target.playVideo();
          },
        },
      });
      return;
    }
  } catch (_) {
    // fall through to iframe embed
  }

  const iframe = document.createElement("iframe");
  iframe.id = "live-camera-player";
  iframe.src = channelEmbedSrc(channelId);
  iframe.title = title;
  iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
  iframe.allowFullscreen = true;
  mount.replaceChildren(iframe);

  try {
    const YT = await loadYouTubeIframeApi();
    new YT.Player(iframe, {
      events: {
        onReady: (event) => {
          event.target.playVideo();
        },
      },
    });
  } catch (_) {
    // autoplay query params on iframe src still apply
  }
}

initLiveCamera();
