// SPDX-License-Identifier: GPL-3.0-only
const { createApp, ref, computed, onMounted, onUnmounted, nextTick } = Vue;

createApp({
  setup() {
    // 视图模式与导航状态
    const viewMode = ref('catalog'); // 'catalog' | 'theater'
    const currentTab = ref('hot-drama'); // 'hot-drama' | 'real-drama' | 'comic-drama' | 'ai-drama' | 'history' | 'favorites'
    const searchKeyword = ref('');
    const hotTags = ref(['离婚', '战神', '重生', '逆袭', '神医', '千金', '豪门', '甜宠']);

    // 目录与短剧列表
    const currentDramas = ref([]);
    const currentPage = ref(1);
    const loadingCatalog = ref(false);

    // 剧场模式与播放器
    const videoEl = ref(null);
    const activeSeries = ref(null);
    const activeEpisodes = ref([]);
    const activeEpisodeIndex = ref(1);
    const isFavorited = ref(false);
    const isPlaying = ref(false);
    const isBuffering = ref(false);
    const videoErrorMessage = ref('');
    const currentTime = ref(0);
    const duration = ref(0);
    const bufferedPercent = ref(0);
    const playbackRate = ref('1.0');
    const volume = ref(1.0);
    const isMuted = ref(false);
    const watchedMap = ref(new Map()); // seriesId -> Set(epIndexes)
    let progressTimer = null;
    let pendingResumeSec = 0;

    // 当前选集分组
    const currentGroup = ref({ start: 1, end: 30 });

    // 当前播放直链 (通过本地边下边解代理)
    const currentStreamUrl = computed(() => {
      const ep = activeEpisodes.value.find(e => e.vid_index === activeEpisodeIndex.value);
      if (!ep || !ep.vid) return '';
      // 计算下一集的 vid 便于代理服务无感预加载
      const nextEp = activeEpisodes.value.find(e => e.vid_index === activeEpisodeIndex.value + 1);
      const nextParam = nextEp?.vid ? `?next_vid=${nextEp.vid}` : '';
      return `/api/stream/${ep.vid}${nextParam}`;
    });

    const playedPercent = computed(() => {
      if (!duration.value || duration.value <= 0) return 0;
      return Math.min(100, (currentTime.value / duration.value) * 100);
    });

    // 分集按 30 集一组分组
    const episodeGroups = computed(() => {
      const total = activeEpisodes.value.length;
      if (total === 0) return [];
      const groups = [];
      const size = 30;
      for (let i = 1; i <= total; i += size) {
        groups.push({
          start: i,
          end: Math.min(i + size - 1, total)
        });
      }
      return groups;
    });

    // 当前分组下的集数列表
    const currentGroupEpisodes = computed(() => {
      const { start, end } = currentGroup.value;
      return activeEpisodes.value.filter(e => e.vid_index >= start && e.vid_index <= end);
    });

    // ================= 目录与数据获取 =================

    async function loadCatalog() {
      loadingCatalog.value = true;
      try {
        if (currentTab.value === 'history') {
          const res = await fetch('/api/history').then(r => r.json());
          currentDramas.value = (res || []).map(h => ({
            series_id: h.series_id,
            series_title: h.series_title,
            cover: h.cover,
            episode_count: 0,
            watched_index: h.episode_index
          }));
        } else if (currentTab.value === 'favorites') {
          const res = await fetch('/api/favorites').then(r => r.json());
          currentDramas.value = (res || []).map(f => ({
            series_id: f.series_id,
            series_title: f.series_title,
            cover: f.cover,
            episode_count: f.episode_count
          }));
        } else {
          const res = await fetch(`/api/catalog?category=${currentTab.value}&page=${currentPage.value}`).then(r => r.json());
          currentDramas.value = res.results || [];
        }
      } catch (err) {
        console.error('加载短剧列表失败:', err);
        currentDramas.value = [];
      } finally {
        loadingCatalog.value = false;
      }
    }

    async function handleSearch() {
      if (!searchKeyword.value.trim()) return;
      loadingCatalog.value = true;
      viewMode.value = 'catalog';
      try {
        const res = await fetch(`/api/search?keyword=${encodeURIComponent(searchKeyword.value.trim())}`).then(r => r.json());
        currentDramas.value = res.results || [];
      } catch (err) {
        console.error('搜索短剧失败:', err);
      } finally {
        loadingCatalog.value = false;
      }
    }

    function quickSearch(tag) {
      searchKeyword.value = tag;
      handleSearch();
    }

    function switchTab(tab) {
      currentTab.value = tab;
      currentPage.value = 1;
      viewMode.value = 'catalog';
      searchKeyword.value = '';
      loadCatalog();
    }

    function changePage(delta) {
      currentPage.value = Math.max(1, currentPage.value + delta);
      loadCatalog();
    }

    function goHome() {
      switchTab('hot-drama');
    }

    // ================= 沉浸式剧场与播放逻辑 =================

    async function openTheater(drama) {
      videoErrorMessage.value = '';
      isBuffering.value = true;
      try {
        const detail = await fetch(`/api/series/${drama.series_id}`).then(r => r.json());
        if (!detail || !detail.episodes || detail.episodes.length === 0) {
          alert('获取该短剧分集失败，请重试');
          return;
        }

        activeSeries.value = detail;
        activeEpisodes.value = detail.episodes;
        isFavorited.value = !!detail.is_favorite;

        // 计算初始选集分组
        const groups = episodeGroups.value;
        currentGroup.value = groups[0] || { start: 1, end: 30 };

        // 默认恢复上次观看进度或第一集
        let targetIndex = 1;
        let resumeSec = 0;
        if (detail.saved_progress) {
          targetIndex = Number(detail.saved_progress.episode_index) || 1;
          resumeSec = Number(detail.saved_progress.position_sec) || 0;
        }

        activeEpisodeIndex.value = targetIndex;
        // 定位所属分组
        const matchedGroup = groups.find(g => targetIndex >= g.start && targetIndex <= g.end);
        if (matchedGroup) currentGroup.value = matchedGroup;

        pendingResumeSec = resumeSec;
        viewMode.value = 'theater';

        await nextTick();
        if (videoEl.value) {
          videoEl.value.play().catch(e => {
            console.log('自动播放需要用户交互唤醒:', e.message);
            isBuffering.value = false;
          });
        }
      } catch (err) {
        console.error('打开剧场失败:', err);
        alert('加载剧集失败: ' + err.message);
      } finally {
        isBuffering.value = false;
      }
    }

    function closeTheater() {
      saveProgressNow();
      if (videoEl.value) {
        videoEl.value.pause();
      }
      viewMode.value = 'catalog';
      loadCatalog();
    }

    function switchEpisode(ep) {
      if (activeEpisodeIndex.value === ep.vid_index) return;
      saveProgressNow();
      videoErrorMessage.value = '';
      isBuffering.value = true;
      activeEpisodeIndex.value = ep.vid_index;
      currentTime.value = 0;

      markWatched(ep.vid_index);

      nextTick(() => {
        if (videoEl.value) {
          videoEl.value.currentTime = 0;
          videoEl.value.play().catch(e => {
            console.log('播放被策略拦截，等待用户交互:', e.message);
            isBuffering.value = false;
          });
        }
      });
    }

    function playPrevEpisode() {
      if (activeEpisodeIndex.value <= 1) return;
      const prev = activeEpisodes.value.find(e => e.vid_index === activeEpisodeIndex.value - 1);
      if (prev) {
        // 同步分组
        const group = episodeGroups.value.find(g => prev.vid_index >= g.start && prev.vid_index <= g.end);
        if (group) currentGroup.value = group;
        switchEpisode(prev);
      }
    }

    function playNextEpisode() {
      if (activeEpisodeIndex.value >= activeEpisodes.value.length) return;
      const next = activeEpisodes.value.find(e => e.vid_index === activeEpisodeIndex.value + 1);
      if (next) {
        // 同步分组
        const group = episodeGroups.value.find(g => next.vid_index >= g.start && next.vid_index <= g.end);
        if (group) currentGroup.value = group;
        switchEpisode(next);
      }
    }

    function togglePlay() {
      if (!videoEl.value) return;
      if (videoEl.value.paused) {
        videoEl.value.play().catch(console.error);
      } else {
        videoEl.value.pause();
      }
    }

    function seekByClick(e) {
      if (!videoEl.value || !duration.value) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const targetPercent = Math.max(0, Math.min(1, clickX / rect.width));
      videoEl.value.currentTime = targetPercent * duration.value;
    }

    function changeSpeed() {
      if (videoEl.value) {
        videoEl.value.playbackRate = parseFloat(playbackRate.value);
      }
    }

    function changeVolume() {
      if (videoEl.value) {
        videoEl.value.volume = parseFloat(volume.value);
        isMuted.value = (videoEl.value.volume === 0);
      }
    }

    function toggleMute() {
      if (!videoEl.value) return;
      isMuted.value = !isMuted.value;
      videoEl.value.muted = isMuted.value;
    }

    function toggleFullscreen() {
      if (!videoEl.value) return;
      if (!document.fullscreenElement) {
        videoEl.value.requestFullscreen().catch(err => {
          alert('全屏模式调用失败: ' + err.message);
        });
      } else {
        document.exitFullscreen().catch(console.error);
      }
    }

    async function toggleFavCurrent() {
      if (!activeSeries.value) return;
      try {
        const res = await fetch('/api/favorites/toggle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(activeSeries.value)
        }).then(r => r.json());
        isFavorited.value = !!res.is_favorite;
      } catch (err) {
        console.error('收藏切换失败:', err);
      }
    }

    // ================= 播放器事件回调 =================

    function onPlay() {
      isPlaying.value = true;
      isBuffering.value = false;
    }

    function onCanPlay() {
      isBuffering.value = false;
      if (videoEl.value && videoEl.value.paused) {
        videoEl.value.play().catch(e => {
          console.log('[Player] 自动播放需交互:', e.message);
          isBuffering.value = false;
        });
      }
    }

    function onPause() {
      isPlaying.value = false;
      saveProgressNow();
    }

    function onLoadedMetadata() {
      if (videoEl.value) {
        duration.value = videoEl.value.duration || 0;
        videoEl.value.playbackRate = parseFloat(playbackRate.value);
        if (pendingResumeSec > 0 && pendingResumeSec < duration.value) {
          try {
            videoEl.value.currentTime = pendingResumeSec;
          } catch (e) {
            console.warn('恢复历史播放位置失败:', e);
          }
          pendingResumeSec = 0;
        }
      }
    }

    function onTimeUpdate() {
      if (videoEl.value) {
        currentTime.value = videoEl.value.currentTime || 0;
        // 计算缓冲进度
        if (videoEl.value.buffered.length > 0 && duration.value > 0) {
          const bufferedEnd = videoEl.value.buffered.end(videoEl.value.buffered.length - 1);
          bufferedPercent.value = Math.min(100, (bufferedEnd / duration.value) * 100);
        }
      }
    }

    function onEnded() {
      console.log('[Player] 本集播放完成，正在无感自动切入下一集...');
      playNextEpisode();
    }

    function onVideoError(e) {
      console.error('[Player] 视频播放器报错:', e);
      isBuffering.value = false;
      videoErrorMessage.value = '视频解密或解码失败，请点击重试';
    }

    function retryCurrentEpisode() {
      videoErrorMessage.value = '';
      if (videoEl.value) {
        videoEl.value.load();
        videoEl.value.play().catch(console.error);
      }
    }

    // ================= 辅助工具方法 =================

    function formatTime(seconds) {
      const s = Math.floor(seconds || 0);
      const m = Math.floor(s / 60);
      const rem = s % 60;
      return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
    }

    function markWatched(index) {
      if (!activeSeries.value) return;
      const sid = activeSeries.value.series_id;
      if (!watchedMap.value.has(sid)) {
        watchedMap.value.set(sid, new Set());
      }
      watchedMap.value.get(sid).add(index);
    }

    function isEpisodeWatched(index) {
      if (!activeSeries.value) return false;
      const set = watchedMap.value.get(activeSeries.value.series_id);
      return set ? set.has(index) : false;
    }

    function saveProgressNow() {
      if (!activeSeries.value || !currentTime.value) return;
      const curEp = activeEpisodes.value.find(e => e.vid_index === activeEpisodeIndex.value);
      fetch('/api/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          series_id: activeSeries.value.series_id,
          series_title: activeSeries.value.series_title,
          cover: activeSeries.value.cover,
          episode_index: activeEpisodeIndex.value,
          vid: curEp?.vid || '',
          position_sec: currentTime.value,
          duration_sec: duration.value
        })
      }).catch(err => console.warn('同步进度失败:', err));
    }

    function onImageError(e) {
      e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400"><rect fill="%23222" width="100%" height="100%"/><text fill="%23777" font-size="20" font-family="sans-serif" x="50%" y="50%" text-anchor="middle">暂无封面</text></svg>';
    }

    // ================= 键盘快捷键监听 =================

    function handleKeyDown(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (viewMode.value === 'theater') {
        if (e.code === 'Space' || e.key === 'k') {
          e.preventDefault();
          togglePlay();
        } else if (e.code === 'ArrowUp') {
          e.preventDefault();
          playPrevEpisode();
        } else if (e.code === 'ArrowDown') {
          e.preventDefault();
          playNextEpisode();
        } else if (e.code === 'ArrowLeft') {
          e.preventDefault();
          if (videoEl.value) videoEl.value.currentTime = Math.max(0, videoEl.value.currentTime - 5);
        } else if (e.code === 'ArrowRight') {
          e.preventDefault();
          if (videoEl.value) videoEl.value.currentTime = Math.min(duration.value, videoEl.value.currentTime + 5);
        } else if (e.key === 'f' || e.key === 'F') {
          e.preventDefault();
          toggleFullscreen();
        } else if (e.code === 'Escape') {
          closeTheater();
        }
      }
    }

    onMounted(() => {
      loadCatalog();
      window.addEventListener('keydown', handleKeyDown);
      // 定时每 4 秒静默上报进度
      progressTimer = setInterval(() => {
        if (viewMode.value === 'theater' && isPlaying.value) {
          saveProgressNow();
        }
      }, 4000);
    });

    onUnmounted(() => {
      window.removeEventListener('keydown', handleKeyDown);
      if (progressTimer) clearInterval(progressTimer);
    });

    return {
      viewMode,
      currentTab,
      searchKeyword,
      hotTags,
      currentDramas,
      currentPage,
      loadingCatalog,
      videoEl,
      activeSeries,
      activeEpisodes,
      activeEpisodeIndex,
      isFavorited,
      isPlaying,
      isBuffering,
      videoErrorMessage,
      currentTime,
      duration,
      bufferedPercent,
      playedPercent,
      playbackRate,
      volume,
      isMuted,
      currentGroup,
      currentStreamUrl,
      episodeGroups,
      currentGroupEpisodes,
      loadCatalog,
      handleSearch,
      quickSearch,
      switchTab,
      changePage,
      goHome,
      openTheater,
      closeTheater,
      switchEpisode,
      playPrevEpisode,
      playNextEpisode,
      togglePlay,
      seekByClick,
      changeSpeed,
      changeVolume,
      toggleMute,
      toggleFullscreen,
      toggleFavCurrent,
      onPlay,
      onPause,
      onCanPlay,
      onLoadedMetadata,
      onTimeUpdate,
      onEnded,
      onVideoError,
      retryCurrentEpisode,
      formatTime,
      isEpisodeWatched,
      onImageError
    };
  }
}).mount('#app');
