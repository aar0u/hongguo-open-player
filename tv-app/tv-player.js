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
    + '.theater-view{top:84px!important;height:calc(100vh - 84px)!important}'
    // Emulated fullscreen (see legacy-banner.js): the page's own .is-fullscreen rules size the player.
    + 'html.np-fs-on .app-header{display:none!important}'
    + 'html.np-fs-on .theater-view{top:0!important;height:100vh!important}'
    + 'html.np-fs-on .theater-sidebar{display:none!important}'
    + '#tv-menu{position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483600;display:flex;align-items:center;'
    + 'justify-content:center;background:rgba(0,0,0,.6)}'
    + '#tv-menu .box{background:#141821;border:1px solid #2a3040;border-radius:16px;padding:18px;min-width:380px}'
    // Chrome 66 ignores `gap` on flex containers, so the control bar items touch and overlap.
    + '.controls-left>*+*,.controls-right>*+*{margin-left:14px!important}'
    + '#tv-menu button{display:block;width:100%;text-align:left;font-size:21px;padding:11px 20px;margin:4px 0;'
    + 'color:#eee;background:#1d2230;border:3px solid transparent;border-radius:10px}'
    + '#tv-menu button:focus{outline:none!important;border-color:#ffb300;background:#3a3320!important}';
  document.head.appendChild(css);

  // ---- Menu key panel: reaches controls the arrow keys cannot (they seek and switch episodes) ----
  // Areas the user enters from the Menu panel and navigates with the arrow keys.
  var FOCUS_ZONES = '#tv-menu, #episode-sidebar, .app-header';

  // The page calls .player-container.focus() on every play, click and episode change. Ignore that while the
  // focus is in one of those areas; leaving them (Back) blurs the element first, so focus() works again.
  var nativeFocus = HTMLElement.prototype.focus;
  HTMLElement.prototype.focus = function (opts) {
    var a = document.activeElement;
    if (this.classList.contains('player-container') && a && a.closest && a.closest(FOCUS_ZONES)) return;
    return nativeFocus.call(this, opts);
  };

  // In the theater the page blurs any focused button and pulls focus back to the player, which would make
  // the panel and the episode list unusable with a D-pad. Hide those focus events from the page.
  document.addEventListener('focusin', function (e) {
    if (e.target.closest && e.target.closest(FOCUS_ZONES)) e.stopImmediatePropagation();
  }, true);

  function menuClose() {
    var m = document.getElementById('tv-menu');
    if (!m) return false;
    m.remove();
    var pc = document.querySelector('.player-container');
    if (pc) pc.focus();
    return true;
  }

  function clickSel(sel) {
    var b = document.querySelector(sel);
    if (b) b.click();
  }

  function menuItems() {
    var items = [];
    if (document.querySelector('.theater-view')) {
      var vol = document.querySelector('.volume-btn');
      var fit = document.querySelector('.fit-btn');
      var side = document.querySelector('[aria-controls="episode-sidebar"]');
      var sel = document.querySelector('.speed-selector select');
      var sideOpen = document.getElementById('episode-sidebar') && document.getElementById('episode-sidebar').style.display !== 'none';
      items.push({ text: document.fullscreenElement ? '退出全屏' : '全屏', run: function () { clickSel('button[title^="全屏"]'); } });
      items.push({
        text: '选集',
        run: function () {
          if (!sideOpen && side) side.click();
          setTimeout(function () {
            var b = document.querySelector('.episode-btn.active') || document.querySelector('.episode-btn');
            if (b) b.focus();
          }, 80);
        }
      });
      items.push({
        text: '顶部菜单',
        run: function () {
          // After the click handlers: the page returns focus to the player on every button click.
          setTimeout(function () {
            var n = document.querySelector('.app-header .nav-item.active') || document.querySelector('.app-header .nav-item');
            if (n) n.focus();
          }, 80);
        }
      });
      if (side) items.push({ text: sideOpen ? '收起选集栏' : '展开选集栏', run: function () { side.click(); } });
      if (vol) items.push({ text: vol.textContent.indexOf('🔇') >= 0 ? '取消静音' : '静音', run: function () { vol.click(); } });
      if (fit) items.push({ text: '画面：' + fit.textContent.trim(), run: function () { fit.click(); } });
      if (sel) {
        items.push({
          text: '倍速：' + sel.options[sel.selectedIndex].text,
          keepOpen: true,
          run: function (btn) {
            sel.selectedIndex = (sel.selectedIndex + 1) % sel.options.length;
            sel.dispatchEvent(new Event('change'));
            btn.textContent = '倍速：' + sel.options[sel.selectedIndex].text;
          }
        });
      }
    }
    items.push({ text: '服务地址…', run: function () { window.TV && window.TV.address(); } });
    return items;
  }

  window.__tvMenu = function () {
    if (menuClose()) return true;
    var m = document.createElement('div');
    m.id = 'tv-menu';
    var box = document.createElement('div');
    box.className = 'box';
    menuItems().forEach(function (it) {
      var b = document.createElement('button');
      b.textContent = it.text;
      b.addEventListener('click', function () {
        if (!it.keepOpen) menuClose();
        it.run(b);
        // The page's change handlers move focus back to the player; keep it on the panel item.
        if (it.keepOpen) setTimeout(function () { b.focus(); }, 0);
      });
      box.appendChild(b);
    });
    m.appendChild(box);
    document.body.appendChild(m);
    box.firstChild.focus();
    return true;
  };

  // Back key: close the panel, or leave the episode list and return focus to the player.
  window.__tvBack = function () {
    if (menuClose()) return true;
    var a = document.activeElement;
    if (a && a.closest && a.closest('#episode-sidebar, .app-header') && document.querySelector('.theater-view')) {
      a.blur();
      var pc = document.querySelector('.player-container');
      if (pc) pc.focus();
      return true;
    }
    return false;
  };

  // While the panel or the episode list has focus, the arrow keys move focus instead of reaching the
  // page's seek / episode shortcuts.
  window.addEventListener('keydown', function (e) {
    var menu = document.getElementById('tv-menu');
    var a = document.activeElement;
    var inList = a && a.closest && a.closest('#episode-sidebar, .app-header') && document.querySelector('.theater-view');
    if (!menu && !inList) return;
    var arrows = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    if (menu && arrows.indexOf(e.key) >= 0) {
      var btns = Array.prototype.slice.call(menu.querySelectorAll('button'));
      var i = btns.indexOf(a);
      var next = e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? i - 1 : i + 1;
      btns[(next + btns.length) % btns.length].focus();
      e.preventDefault();
    }
    e.stopImmediatePropagation();
  }, true);

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
