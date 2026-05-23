const CFG = window.SKILUXE_CONFIG || {};

function embedQuery(autoplay) {
  const params = new URLSearchParams({
    playsinline: "1",
    rel: "0",
    modestbranding: "1",
    enablejsapi: "1",
    origin: window.location.origin,
  });
  if (autoplay) {
    params.set("autoplay", "1");
    params.set("mute", "1");
  }
  return params.toString();
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
  if (!CFG.apiBase) return { live: null, videoId: null, checked: false };
  try {
    const res = await fetch(`${CFG.apiBase}/api/youtube/live`);
    if (!res.ok) return { live: null, videoId: null, checked: false };
    const data = await res.json();
    return {
      live: !!data.live,
      videoId: data.videoId || null,
      checked: true,
    };
  } catch (_) {
    return { live: null, videoId: null, checked: false };
  }
}

async function initLiveCamera() {
  const mount = document.getElementById("live-camera-embed");
  if (!mount) return;

  const channelId = mount.dataset.channelId;
  if (!channelId) return;

  const { live, videoId, checked } = await fetchLiveStatus();
  let src;
  let shouldAutoplay = false;

  if (videoId) {
    src = `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?${embedQuery(true)}`;
    shouldAutoplay = true;
  } else if (checked && !live) {
    src = `https://www.youtube.com/embed/live_stream?channel=${encodeURIComponent(channelId)}&${embedQuery(false)}`;
    shouldAutoplay = false;
  } else {
    src = `https://www.youtube.com/embed/live_stream?channel=${encodeURIComponent(channelId)}&${embedQuery(true)}`;
    shouldAutoplay = true;
  }

  const iframe = document.createElement("iframe");
  iframe.id = "live-camera-player";
  iframe.src = src;
  iframe.title = mount.dataset.title || "Live stream";
  iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
  iframe.allowFullscreen = true;
  mount.replaceChildren(iframe);

  if (!shouldAutoplay) return;

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
    // autoplay query params still apply if the API fails to load
  }
}

initLiveCamera();
