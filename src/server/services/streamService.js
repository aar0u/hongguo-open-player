// SPDX-License-Identifier: GPL-3.0-only
const axios = require('axios');
const appSource = require('../native/app-source');
const { decryptMp4Buffer } = require('../native/hongguo');

class StreamService {
  constructor() {
    // 内存 LRU 缓存：vid -> { buffer, size, timestamp }
    this.cache = new Map();
    this.maxCacheCount = 15; // 保持最近播放的 15 集，约 100MB 内存占用
    // 正在下载解密中的 Promise 映射，避免并发 Range 请求重复下载
    this.inFlight = new Map();
  }

  /**
   * 并发分片加速拉取：突破字节 CDN 单连接 256KB/s 限速，多连接跑满本地带宽 (1~1.5秒拉取整集)
   */
  async downloadWithParallelRanges(url, userAgent, timeoutMs = 20000, signal = null) {
    const headers = {
      'User-Agent': userAgent || 'com.phoenix.read/71532 (Linux; U; Android 9; SM-N9860; Build/PQ3A.190705.10241111;tt-ok/3.12.13.20)',
      'Accept-Encoding': 'identity'
    };

    try {
      // 探测文件大小
      const probe = await axios.get(url, {
        headers: { ...headers, Range: 'bytes=0-0' },
        timeout: 4000,
        responseType: 'arraybuffer',
        signal
      });

      const rangeHeader = probe.headers['content-range'];
      if (!rangeHeader) {
        if (probe.status === 200) return Buffer.from(probe.data);
        throw new Error('Invalid range probe');
      }

      const total = parseInt(rangeHeader.split('/')[1], 10);
      if (isNaN(total) || total <= 0) {
        if (probe.status === 200) return Buffer.from(probe.data);
        throw new Error('Invalid range probe');
      }

      // 并发 6~8 个连接分段下载
      const concurrency = Math.min(total, 8, Math.max(4, Math.ceil(total / (1024 * 1024))));
      const chunkSize = Math.ceil(total / concurrency);
      const tasks = [];

      for (let i = 0; i < concurrency; i++) {
        const start = i * chunkSize;
        const end = Math.min((i + 1) * chunkSize - 1, total - 1);
        tasks.push(
          axios.get(url, {
            responseType: 'arraybuffer',
            headers: { ...headers, Range: `bytes=${start}-${end}` },
            timeout: timeoutMs,
            signal
          }).then(r => {
            const chunk = Buffer.from(r.data);
            if (r.status !== 206 || r.headers['content-range'] !== `bytes ${start}-${end}/${total}` || chunk.length !== end - start + 1) {
              throw new Error('Invalid media range response');
            }
            return chunk;
          })
        );
      }

      const chunks = await Promise.all(tasks);
      return Buffer.concat(chunks);
    } catch (e) {
      if (signal && signal.aborted) throw e;
      // 兜底降级为普通全量下载
      const fallback = await axios.get(url, { responseType: 'arraybuffer', headers, timeout: timeoutMs, signal });
      return Buffer.from(fallback.data);
    }
  }

  /**
   * 智能下载：排序边缘 CDN 节点并支持 1.5s 备用节点竞速，解决个别主域名 (如 v9-reading-video) 限速 30 秒卡顿问题
   */
  async downloadFastestMedia(variants, defaultVariant, timeoutMs = 25000) {
    const list = Array.isArray(variants) && variants.length > 0 ? variants : [defaultVariant];
    // 智能排序：优先排除受限速的主节点，优先选择边缘高速 CDN
    const sorted = [...list].sort((a, b) => {
      const aBad = a.url.includes('v9-reading-video') ? 1 : 0;
      const bBad = b.url.includes('v9-reading-video') ? 1 : 0;
      return aBad - bBad;
    });

    const abortControllers = sorted.map(() => new AbortController());

    const fetchOne = async (variant, index) => {
      const controller = abortControllers[index];
      const host = new URL(variant.url).hostname;
      const t0 = Date.now();
      const buffer = await this.downloadWithParallelRanges(variant.url, variant.userAgent, timeoutMs, controller.signal);
      console.log(`[StreamService] ⚡ 并发分片加速从 [${host}] 下载完毕: ${buffer.length} 字节，耗时 ${Date.now() - t0}ms`);
      return { buffer, variant };
    };

    if (sorted.length === 1) {
      return await fetchOne(sorted[0], 0);
    }

    return await new Promise((resolve, reject) => {
      let resolved = false;
      let finishedCount = 0;
      let lastErr = null;

      const run = (idx) => {
        fetchOne(sorted[idx], idx).then(result => {
          if (!resolved) {
            resolved = true;
            // 中止其他并发连接
            abortControllers.forEach((c, i) => { if (i !== idx) try { c.abort(); } catch (e) {} });
            resolve(result);
          }
        }).catch(err => {
          lastErr = err;
          finishedCount++;
          if (finishedCount === sorted.length && !resolved) {
            reject(lastErr || new Error('所有视频源拉取均失败'));
          }
        });
      };

      // 启动首选节点
      run(0);

      // 若 1.2 秒内首选未返回，启动备用源并发竞速
      setTimeout(() => {
        if (!resolved && sorted.length > 1) {
          console.log(`[StreamService] 首选视频源拉取耗时超 1.2s，启动备用源并发竞速: ${new URL(sorted[1].url).hostname}`);
          run(1);
        }
      }, 1200);
    });
  }

  /**
   * 获取或解密得到指定 vid 的明文 MP4 Buffer
   */
  async getDecryptedBuffer(vid, quality = 'auto') {
    const key = String(vid);
    // 1. 命中内存缓存
    if (this.cache.has(key)) {
      const entry = this.cache.get(key);
      entry.timestamp = Date.now();
      return entry.buffer;
    }

    // 2. 避免并发请求重叠下载
    if (this.inFlight.has(key)) {
      return await this.inFlight.get(key);
    }

    const task = (async () => {
      try {
        console.log(`[StreamService] 正在解析视频播放地址 vid: ${key}`);
        const playInfo = await appSource.fetchAppPlayUrl(key, { quality, allowLowerQuality: true });
        if (!playInfo || !playInfo.url) {
          throw new Error('未获取到有效的视频流链接');
        }

        console.log(`[StreamService] 正在多源极速拉取媒体流 (${playInfo.codec}, ${playInfo.quality})...`);
        const { buffer: encryptedBuf, variant: chosenVariant } = await this.downloadFastestMedia(playInfo.variants, playInfo);

        console.log(`[StreamService] 正在解密 MP4 CENC 样本 (${encryptedBuf.length} bytes)...`);

        // 密钥派生与解密
        const contentKey = chosenVariant.contentKey || playInfo.contentKey;
        const keyBuf = Buffer.isBuffer(contentKey) ? contentKey : Buffer.from(String(contentKey), 'hex');
        const decryptedBuf = decryptMp4Buffer(encryptedBuf, keyBuf);
        console.log(`[StreamService] 解密完成 (${decryptedBuf.length} bytes)，已写入流式缓存`);

        // 存入 LRU 缓存
        this.cache.set(key, {
          buffer: decryptedBuf,
          size: decryptedBuf.length,
          timestamp: Date.now()
        });
        this.pruneCache();

        return decryptedBuf;
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, task);
    return await task;
  }

  /**
   * 预加载下一集 (Prefetch)
   */
  prefetch(vid, quality = '1080p') {
    if (!vid) return;
    const key = String(vid);
    if (this.cache.has(key) || this.inFlight.has(key)) return;
    this.getDecryptedBuffer(key, quality).catch(err => {
      console.warn(`[StreamService] 预加载分集 ${key} 失败:`, err.message);
    });
  }

  /**
   * LRU 缓存修剪
   */
  pruneCache() {
    if (this.cache.size <= this.maxCacheCount) return;
    let oldestKey = null;
    let oldestTime = Infinity;
    for (const [k, v] of this.cache.entries()) {
      if (v.timestamp < oldestTime) {
        oldestTime = v.timestamp;
        oldestKey = k;
      }
    }
    if (oldestKey) {
      console.log(`[StreamService] LRU 释放旧分集缓存: ${oldestKey}`);
      this.cache.delete(oldestKey);
    }
  }

  /**
   * 处理 HTTP Range 播放请求 (边下边解边播的核心接口)
   */
  async handleStream(req, res, vid) {
    try {
      const buffer = await this.getDecryptedBuffer(vid);
      const total = buffer.length;
      const range = req.headers.range;

      if (!range) {
        // 无 Range 头，直接返回完整流
        res.writeHead(200, {
          'Content-Length': total,
          'Content-Type': 'video/mp4',
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=3600'
        });
        if (req.method === 'HEAD') return res.end();
        return res.end(buffer);
      }

      // 解析 Range 头，例如 "bytes=0-1048575"
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      let end = parts[1] ? parseInt(parts[1], 10) : total - 1;

      if (isNaN(start) || isNaN(end) || start > end || start >= total) {
        res.writeHead(416, {
          'Content-Range': `bytes */${total}`
        });
        return res.end();
      }

      end = Math.min(end, total - 1);
      const chunkSize = (end - start) + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${total}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': 'video/mp4',
        'Cache-Control': 'public, max-age=3600'
      });

      if (req.method === 'HEAD') return res.end();
      res.end(buffer.subarray(start, end + 1));
    } catch (err) {
      console.error(`[StreamService] 播放流服务异常 vid: ${vid}`, err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    }
  }
}

module.exports = new StreamService();
