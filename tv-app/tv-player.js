// Appended to app.js for the TV shell. Hands the page's <video> to the Android player (window.NP),
// because the system WebView cannot decode the HEVC streams. No-op outside the shell.
(function () {
  var NP = window.NP;
  if (!NP) return;

  var cur = null;
  var lastRect = '';
  var html = document.documentElement;
  var density = window.devicePixelRatio || 1;
  var headerScale = 2 / density;
  var catalogScale = 1.5 / density;

  // The native surface sits under the WebView, so the page must stop painting over the video area.
  var css = document.createElement('style');
  // The desktop header is 60px tall with 12-15px text; enlarge it for reading from the sofa. The theater
  // view is positioned below the header, so it must follow the new height.
  css.textContent = 'html.np-on,html.np-on body,html.np-on .theater-view,html.np-on .player-container,'
    + 'html.np-on .video-stage,html.np-on .video-element{background:transparent!important}'
    // Newer WebViews paint a grey default poster with a big play icon on a <video> that has no frame; the
    // native surface underneath is the real picture, so keep the element itself invisible.
    + 'html.np-on .video-element{opacity:0!important}'
    + '.app-header,.chips-bar{zoom:' + headerScale + '}'
    + '.catalog-container,.actor-modal .drama-grid{zoom:' + catalogScale + '}'
    // Chrome 66 ignores aspect-ratio, so reserve a fixed 3:4 cover using padding.
    + '.card-cover-wrapper{aspect-ratio:auto!important;height:0;padding-top:133.3333%;flex:none}'
    + '.card-cover-wrapper .card-cover,.card-cover-wrapper .cover-overlay{position:absolute;top:0;right:0;bottom:0;left:0}'
    + '.app-header{height:84px!important;padding:0 28px!important;gap:20px!important}'
    + '.header-left{gap:0!important}.header-left .nav-tabs{margin-left:12px!important}'
    + '.brand-icon{width:40px!important;height:40px!important}'
    + '.brand-name{display:none!important}'
    + '.nav-item{font-size:17px!important;padding:8px 10px!important}'
    + '.app-header .brand:focus{outline:none;background:#262c3a;border-radius:16px}'
    + '.search-box{padding:6px 8px 6px 16px!important;width:150px!important;min-width:150px!important}'
    + '.search-box input{font-size:18px!important}'
    + '.chips-bar{gap:0!important}.chips-bar>*+*{margin-left:10px!important}'
    + '.theater-view{top:' + (84 * headerScale) + 'px!important;height:calc(100vh - ' + (84 * headerScale) + 'px)!important}'
    // Emulated fullscreen (see legacy-banner.js): the page's own .is-fullscreen rules size the player.
    + 'html.np-fs-on .app-header{display:none!important}'
    + 'html.np-fs-on .theater-view{top:0!important;height:100vh!important}'
    + 'html.np-fs-on .theater-sidebar{display:none!important}'
    + '#tv-menu{position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483600;display:flex;align-items:center;'
    + 'justify-content:center;background:rgba(0,0,0,.6)}'
    + '#tv-menu .box{background:#141821;border:1px solid #2a3040;border-radius:16px;padding:18px;min-width:380px}'
    // Chrome 66 ignores `gap` on flex containers, so the control bar items touch and overlap.
    + '.controls-left>*+*,.controls-right>*+*{margin-left:14px!important}'
    + '.volume-box{display:none!important}'
    // .ctrl-btn fixes 32x32px, so the text of the aspect button overflowed it and its highlight covered only the middle.
    + '.fit-btn.ctrl-btn{width:auto!important;height:32px!important;padding:0 12px!important}'
    + '.player-controls .ctrl-btn:focus,.player-controls select:focus{outline:none!important;'
    + 'background:#515968!important;box-shadow:none!important}'
    + '.progress-bar-container:focus{outline:none!important;background:#515968!important}'
    + '.player-header{display:none!important}'
    + 'html:not(.np-fs-on) .player-container:focus{outline:2px solid #ff3355!important;outline-offset:-2px!important}'
    + '#tv-menu button{display:block;width:100%;text-align:left;font-size:21px;padding:11px 20px;margin:4px 0;'
    + 'color:#eee;background:#1d2230;border:2px solid transparent;border-radius:10px}'
    + '#tv-menu button:focus{outline:none!important;background:#515968!important}';
  document.head.appendChild(css);

  // ---- Menu key panel: reaches controls the arrow keys cannot (they seek and switch episodes) ----
  // Areas the user enters from the Menu panel and navigates with the arrow keys.
  var FOCUS_ZONES = '#tv-menu, #episode-sidebar, .app-header, .player-controls';

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

  // The desktop's window click handler blurs buttons after their own click handlers run.
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest(FOCUS_ZONES)) e.stopPropagation();
  });

  var catalogIndex = 0;
  var wasTheater = false;
  document.addEventListener('focusin', function (e) {
    if (!e.target.matches || !e.target.matches('.drama-card') || document.querySelector('.actor-modal-overlay')) return;
    catalogIndex = Array.prototype.indexOf.call(document.querySelectorAll('.drama-card'), e.target);
  }, true);
  new MutationObserver(function () {
    var theater = !!document.querySelector('.theater-view');
    if (wasTheater && !theater) {
      setTimeout(function () {
        if (document.querySelector('.theater-view')) return;
        var cards = document.querySelectorAll('.drama-card');
        var card = cards[Math.max(0, Math.min(catalogIndex, cards.length - 1))];
        if (card) card.focus();
      }, 0);
    }
    wasTheater = theater;
  }).observe(document.body, { childList: true, subtree: true });

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

  function focusHeaderItem(target) {
    if (target.matches('.brand')) target.tabIndex = 0;
    target.focus();
    var nav = target.closest('.nav-tabs');
    if (!nav) return;
    var bounds = nav.getBoundingClientRect();
    var itemBounds = target.getBoundingClientRect();
    if (itemBounds.right > bounds.right) nav.scrollLeft += itemBounds.right - bounds.right + 2;
    else if (itemBounds.left < bounds.left) nav.scrollLeft -= bounds.left - itemBounds.left + 2;
  }

  function focusTopMenu() {
    var n = document.querySelector('.app-header .nav-item.active') || document.querySelector('.app-header .nav-item');
    if (n) focusHeaderItem(n);
  }

  function menuItems() {
    var items = [];
    if (document.querySelector('.theater-view')) {
      var fullscreen = !!document.fullscreenElement;
      if (!fullscreen) items.push({ text: '全屏', run: function () { clickSel('button[title^="全屏"]'); } });
      // The episode list and the header are hidden in fullscreen, so those entries only make sense outside it.
      if (!fullscreen) {
        items.push({
          text: '选集',
          run: function () {
            var b = document.querySelector('.episode-btn.active') || document.querySelector('.episode-btn');
            if (b) b.focus();
          }
        });
        items.push({ text: '顶部菜单', run: focusTopMenu });
      }
      var speed = document.querySelector('.player-controls .speed-selector select');
      if (speed && speed.options.length) {
        items.push({ text: '播放速度：' + speed.options[speed.selectedIndex].text, keepOpen: true, run: function (b) {
          cycleSelect(speed, false);
          b.textContent = '播放速度：' + speed.options[speed.selectedIndex].text;
        } });
      }
      items.push({
        text: '退出播放',
        run: function () {
          if (document.fullscreenElement) document.exitFullscreen();
          clickSel('.player-header .back-btn');
        }
      });
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

  // ---- Control bar: Down brings up the bar at the bottom of the player, Left/Right pick, OK triggers ----
  var barIndex = 0;

  function barControls() {
    return Array.prototype.slice.call(document.querySelectorAll('.player-controls .ctrl-btn, .player-controls select'))
      .filter(function (el) { return !el.disabled && el.offsetParent !== null; });
  }

  function enterBar() {
    var pc = document.querySelector('.player-container');
    var ctl = document.querySelector('.player-controls');
    var list = barControls();
    if (!pc || !ctl || list.length === 0) return;
    // The page shows the bar on pointer activity and keeps it while the pointer is over it.
    pc.dispatchEvent(new Event('pointermove'));
    ctl.dispatchEvent(new Event('pointerenter'));
    list[Math.min(barIndex, list.length - 1)].focus();
  }

  function leaveBar() {
    var a = document.activeElement;
    var ctl = document.querySelector('.player-controls');
    var pc = document.querySelector('.player-container');
    if (a) a.blur();
    if (ctl) ctl.dispatchEvent(new Event('pointerleave')); // the page hides the bar after its idle timeout
    if (pc) pc.focus();
  }

  // A native select would open a popup the remote cannot drive; step through the options instead.
  function cycleSelect(sel, restoreFocus) {
    sel.selectedIndex = (sel.selectedIndex + 1) % sel.options.length;
    sel.dispatchEvent(new Event('change'));
    if (restoreFocus !== false) setTimeout(function () { sel.focus(); }, 0);
  }

  function barKey(e, a) {
    var list = barControls();
    var i = list.indexOf(a);
    if (i < 0 && e.key.indexOf('Arrow') === 0) {
      enterBar();
      e.preventDefault();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      var next = Math.max(0, Math.min(list.length - 1, i + (e.key === 'ArrowLeft' ? -1 : 1)));
      barIndex = next;
      list[next].focus();
      e.preventDefault();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      leaveBar();
      e.preventDefault();
    } else if (e.key === 'Enter' && a.tagName === 'SELECT') {
      cycleSelect(a);
      e.preventDefault();
    }
    e.stopImmediatePropagation();
  }

  // Clicking a bar button makes the page blur it and focus the player; take the focus back so the bar stays usable.
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.player-controls .ctrl-btn');
    if (!b || document.activeElement !== b) return;
    setTimeout(function () {
      if (!document.getElementById('tv-menu') && !b.disabled) b.focus();
    }, 0);
  }, true);

  // Back key: close the panel, leave the control bar, or leave the episode list / top menu and return to the player.
  window.__tvBack = function () {
    if (menuClose()) return true;
    var a = document.activeElement;
    if (a && a.closest && a.closest('.player-controls')) {
      leaveBar();
      return true;
    }
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
    if (!menu && !document.fullscreenElement && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      var brand = document.querySelector('.app-header .brand');
      var tabs = Array.prototype.slice.call(document.querySelectorAll('.app-header .nav-item'));
      var search = document.querySelector('.app-header .search-box input');
      var tabIndex = tabs.indexOf(a);
      var target = null;
      if (tabs.length && (!a || a === document.body) && !document.querySelector('.theater-view')) {
        target = document.querySelector('.app-header .nav-item.active') || tabs[0];
      } else if (a === brand && e.key === 'ArrowRight') {
        target = tabs[0];
      } else if (tabIndex >= 0) {
        target = e.key === 'ArrowRight' ? (tabs[tabIndex + 1] || search) : (tabs[tabIndex - 1] || brand);
      } else if (a === search && e.key === 'ArrowLeft' && a.selectionStart === 0 && a.selectionEnd === 0) {
        target = tabs[tabs.length - 1];
      }
      if (target) {
        focusHeaderItem(target);
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
    }
    if (!menu && e.key === 'Enter' && a && a.matches && a.matches('.app-header .brand')) {
      a.click();
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    if (document.querySelector('.theater-view') && !menu) {
      if (a && a.closest && a.closest('.player-controls')) { barKey(e, a); return; }
      var onPlayer = !a || a === document.body || a.tagName === 'VIDEO' || a.classList.contains('player-container');
      var inZone = a && a.closest && a.closest(FOCUS_ZONES);
      if ((onPlayer || (document.fullscreenElement && !inZone)) && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        if (e.key === 'ArrowUp') {
          if (!e.repeat) window.__tvMenu();
        } else enterBar();
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      if (!document.fullscreenElement) {
        if (e.key === 'ArrowDown' && a && a.closest && a.closest('.app-header .nav-tabs, .app-header .brand')) {
          a.blur();
          document.querySelector('.player-container').focus();
          e.preventDefault();
          e.stopImmediatePropagation();
          return;
        }
        if (e.key === 'ArrowRight' && (!a || a === document.body || a.classList.contains('player-container'))) {
          // The browser would pick the nearest control inside the player; the episode list is where Right should go.
          var ep = document.querySelector('.episode-btn.active') || document.querySelector('.episode-btn');
          if (ep && ep.offsetParent !== null) {
            ep.focus();
            e.preventDefault();
            e.stopImmediatePropagation();
            return;
          }
        }
        if (e.key === 'ArrowLeft' && a && a.classList.contains('episode-btn')) {
          var rect = a.getBoundingClientRect();
          var previous = Array.prototype.some.call(document.querySelectorAll('.episode-btn'), function (el) {
            var r = el.getBoundingClientRect();
            return r.right <= rect.left && r.top < rect.bottom && r.bottom > rect.top;
          });
          if (!previous) {
            var player = document.querySelector('.player-container');
            if (player) {
              a.blur();
              player.focus();
              e.preventDefault();
              e.stopImmediatePropagation();
              return;
            }
          }
        }
        if (e.key.indexOf('Arrow') === 0) { e.stopImmediatePropagation(); return; }
        if (e.key === 'Enter') {
          if (a && a.tagName === 'SELECT') {
            cycleSelect(a);
            e.preventDefault();
            e.stopImmediatePropagation();
            return;
          }
          if (onPlayer) {
            clickSel('button[title^="全屏"]');
            e.preventDefault();
            e.stopImmediatePropagation();
            return;
          }
        }
      }
    }
    var inList = a && a.closest && a.closest('#episode-sidebar, .app-header') && document.querySelector('.theater-view');
    if (!menu && !inList) return;
    var arrows = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    if (menu && arrows.indexOf(e.key) >= 0) {
      var btns = Array.prototype.slice.call(menu.querySelectorAll('button'));
      var i = btns.indexOf(a);
      var next = i + (e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0);
      btns[Math.max(0, Math.min(btns.length - 1, next))].focus();
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
        // ExoPlayer IO error codes are 2000-2999. The page maps 2 to "network" and 4 to "bad source"; only code 4
        // makes it probe the stream URL and show the backend's reason, so a bad HTTP status (2004) must be 4.
        var badStatus = a === 2004; // ERROR_CODE_IO_BAD_HTTP_STATUS
        st.err = { code: a >= 2000 && a < 3000 && !badStatus ? 2 : 4, message: String(b) };
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
    // A range input traps D-pad navigation; disabling the seek slider keeps it out of spatial navigation.
    document.querySelectorAll('.seek-input').forEach(function (el) {
      if (!el.disabled) el.disabled = true;
    });
    var v = document.querySelector('video.video-element');
    if (!v) { detach(); return; }
    if (v === cur) return;
    detach();
    attach(v);
  }

  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
  scan();
})();
