// Appended to app.js for the TV shell. Hands the page's <video> to the Android player (window.NP),
// because the system WebView cannot decode the HEVC streams. No-op outside the shell.
(function () {
  var NP = window.NP;
  if (!NP) return;

  var cur = null;
  var lastRect = '';
  var html = document.documentElement;

  // The native surface sits under the WebView, so the page must stop painting over the video area.
  var css = document.createElement('style');
  // The desktop header is 60px tall with 12-15px text; enlarge it for reading from the sofa. The theater
  // view is positioned below the header, so it must follow the new height.
  css.textContent = 'html.np-on,html.np-on body,html.np-on .theater-view,html.np-on .player-container,'
    + 'html.np-on .video-stage,html.np-on .video-element{background:transparent!important}'
    + '.app-header{height:84px!important;padding:0 28px!important;gap:20px!important}'
    + '.brand-icon{width:40px!important;height:40px!important}'
    + '.brand-name{font-size:19px!important}'
    + '.nav-item{font-size:17px!important;padding:8px 10px!important}'
    + '.search-box{padding:6px 8px 6px 16px!important;width:clamp(150px,14vw,200px)!important;min-width:150px!important}'
    + '.search-box input{font-size:18px!important}'
    + '.theater-view{top:84px!important;height:calc(100vh - 84px)!important}';
  document.head.appendChild(css);

  // The engine may already have queued an error for the HEVC stream before attach() removes the src.
  // Drop engine errors on shimmed elements; only the ones fire() dispatches reach the page.
  document.addEventListener('error', function (e) {
    if (e.target && e.target.__np && !e.synthetic) e.stopImmediatePropagation();
  }, true);

  function fire(v, type) {
    var e = new Event(type);
    e.synthetic = true;
    v.dispatchEvent(e);
  }

  function attach(v) {
    var src = v.getAttribute('src');
    if (!src) return;
    var url = new URL(src, location.href).href;
    var origLoad = v.load.bind(v);
    var st = { t: 0, d: NaN, paused: true, ended: false, ready: false, vol: 1, muted: false, rate: 1, buf: 0, err: null };

    // Stop the engine from fetching a stream it cannot decode.
    v.removeAttribute('src');
    origLoad();

    function def(name, get, set) {
      Object.defineProperty(v, name, { configurable: true, get: get, set: set });
    }
    function applyVolume() { NP.volume(st.muted ? 0 : st.vol); }

    def('currentTime', function () { return st.t; }, function (x) {
      st.t = +x || 0;
      st.ended = false;
      NP.seek(Math.round(st.t * 1000));
    });
    def('duration', function () { return st.d; });
    def('paused', function () { return st.paused; });
    def('ended', function () { return st.ended; });
    def('readyState', function () { return st.ready ? 4 : 0; });
    def('error', function () { return st.err; });
    def('buffered', function () {
      return { length: st.buf > 0 ? 1 : 0, start: function () { return 0; }, end: function () { return st.buf; } };
    });
    def('volume', function () { return st.vol; }, function (x) { st.vol = +x; applyVolume(); });
    def('muted', function () { return st.muted; }, function (x) { st.muted = !!x; applyVolume(); });
    def('playbackRate', function () { return st.rate; }, function (x) { st.rate = +x; NP.rate(st.rate); });

    // State flips immediately so callers that read `paused` right after play()/pause() see the new value.
    v.play = function () {
      if (st.paused) { st.paused = false; fire(v, 'play'); }
      NP.play();
      return Promise.resolve();
    };
    v.pause = function () {
      if (!st.paused) { st.paused = true; fire(v, 'pause'); }
      NP.pause();
    };
    v.load = function () {
      st.ready = false;
      st.err = null;
      st.paused = false;
      NP.load(url);
    };

    v.__np = function (event, a, b, c) {
      if (event === 'ready') {
        st.d = a / 1000;
        st.ready = true;
        fire(v, 'loadedmetadata');
        fire(v, 'loadeddata');
        fire(v, 'canplay');
      } else if (event === 'playing') {
        if (st.paused) { st.paused = false; fire(v, 'play'); }
        fire(v, 'playing');
      } else if (event === 'paused') {
        if (!st.paused && !st.ended) { st.paused = true; fire(v, 'pause'); }
      } else if (event === 'waiting') {
        fire(v, 'waiting');
      } else if (event === 'ended') {
        st.ended = true;
        st.paused = true;
        fire(v, 'ended');
      } else if (event === 'error') {
        // ExoPlayer IO error codes are 2000-2999; the page maps 2 to "network" and 4 to "cannot decode".
        st.err = { code: a >= 2000 && a < 3000 ? 2 : 4, message: String(b) };
        fire(v, 'error');
      } else if (event === 't') {
        st.t = a / 1000;
        if (b > 0) st.d = b / 1000;
        st.buf = c / 1000;
        fire(v, 'timeupdate');
      }
    };

    cur = v;
    lastRect = '';
    html.classList.add('np-on');
    NP.load(url);
    syncRect();
  }

  function detach() {
    if (!cur) return;
    cur = null;
    html.classList.remove('np-on');
    NP.release();
  }

  function syncRect() {
    if (!cur) return;
    var r = cur.getBoundingClientRect();
    var cover = getComputedStyle(cur).objectFit === 'cover';
    var key = [r.left, r.top, r.width, r.height, innerWidth, cover].join();
    if (key !== lastRect) {
      lastRect = key;
      NP.rect(r.left, r.top, r.width, r.height, innerWidth, cover);
    }
    requestAnimationFrame(syncRect);
  }

  window.__np = {
    on: function (event, a, b, c) {
      if (cur && cur.__np) cur.__np(event, a, b, c);
    }
  };

  function scan() {
    var v = document.querySelector('video.video-element');
    if (!v) { detach(); return; }
    if (v === cur) return;
    detach();
    attach(v);
  }

  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
  scan();
})();
