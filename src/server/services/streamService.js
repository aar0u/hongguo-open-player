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
   * 获取或解密得到指定 vid 的明文 MP4 Buffer
   */
  async getDecryptedBuffer(vid, quality = '1080p') {
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
        const playInfo = await appSource.fetchAppPlayUrl(key, { quality });
        if (!playInfo || !playInfo.url) {
          throw new Error('未获取到有效的视频流链接');
        }

        console.log(`[StreamService] 正在拉取加密媒体流 (${playInfo.codec}, ${playInfo.quality}): ${playInfo.url.slice(0, 80)}...`);
        const mediaRes = await axios.get(playInfo.url, {
          responseType: 'arraybuffer',
          timeout: 45000,
          headers: {
            'User-Agent': playInfo.userAgent || 'com.phoenix.read/71532 (Linux; U; Android 9; SM-N9860; Build/PQ3A.190705.10241111;tt-ok/3.12.13.20)',
            'Accept-Encoding': 'identity'
          }
        });

        const encryptedBuf = Buffer.from(mediaRes.data);
        console.log(`[StreamService] 下载完成 (${encryptedBuf.length} bytes)，正在解密 MP4 CENC 样本...`);

        // 密钥派生与解密
        const contentKey = playInfo.contentKey;
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
