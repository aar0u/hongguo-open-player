package org.hongguo.tv;

import android.content.Context;
import android.graphics.Color;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.FrameLayout;

import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.PlaybackParameters;
import androidx.media3.common.Player;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.ProgressiveMediaSource;
import androidx.media3.ui.AspectRatioFrameLayout;
import androidx.media3.ui.PlayerView;

import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Collections;
import java.util.List;

/**
 * Plays the page's &lt;video&gt; with the TV's hardware decoder. The system WebView (Chrome 66) cannot
 * decode HEVC, which every stream here uses. The video surface sits under the transparent WebView
 * and is sized to the page's video element; tv-player.js mirrors the element's state to this class.
 */
final class NativePlayer {
    private static final long TICK_MS = 250;

    private final Context context;
    private final FrameLayout root;
    private final WebView web;
    private final Handler main = new Handler(Looper.getMainLooper());

    private PlayerView view;
    private ExoPlayer player;
    private volatile int generation;
    private boolean readyReported;
    private float volume = 1f;
    // The page reports the video area before the player exists, so keep the last one for start().
    private float[] lastRect;
    private boolean lastCover;

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            if (player == null) return;
            emit("t", player.getCurrentPosition(), Math.max(player.getDuration(), 0), player.getBufferedPosition());
            main.postDelayed(this, TICK_MS);
        }
    };

    NativePlayer(Context context, FrameLayout root, WebView web) {
        this.context = context;
        this.root = root;
        this.web = web;
    }

    @JavascriptInterface
    public void load(String url) {
        int id = ++generation;
        main.post(this::stop);
        new Thread(() -> {
            String cookie = fetchSessionCookie(url);
            main.post(() -> {
                if (id == generation) start(url, cookie);
            });
        }).start();
    }

    /**
     * CookieManager hides the session cookie (HttpOnly + SameSite=Strict) from per-URL reads, so ask
     * the server for it the same way the page does: the player's home page sets it for any client.
     */
    private static String fetchSessionCookie(String streamUrl) {
        HttpURLConnection conn = null;
        try {
            URL u = new URL(streamUrl);
            conn = (HttpURLConnection) new URL(u.getProtocol(), u.getHost(), u.getPort(), "/").openConnection();
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(5000);
            conn.getResponseCode();
            StringBuilder sb = new StringBuilder();
            List<String> headers = conn.getHeaderFields().get("Set-Cookie");
            if (headers != null) {
                for (String h : headers) {
                    if (sb.length() > 0) sb.append("; ");
                    sb.append(h.split(";", 2)[0]);
                }
            }
            return sb.toString();
        } catch (IOException e) {
            return "";
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    @JavascriptInterface
    public void play() {
        main.post(() -> { if (player != null) player.play(); });
    }

    @JavascriptInterface
    public void pause() {
        main.post(() -> { if (player != null) player.pause(); });
    }

    @JavascriptInterface
    public void seek(long ms) {
        main.post(() -> { if (player != null) player.seekTo(ms); });
    }

    @JavascriptInterface
    public void volume(float v) {
        main.post(() -> {
            volume = v;
            if (player != null) player.setVolume(v);
        });
    }

    @JavascriptInterface
    public void rate(float r) {
        main.post(() -> { if (player != null) player.setPlaybackParameters(new PlaybackParameters(r)); });
    }

    /** CSS-pixel rectangle of the page's video element; innerWidth converts CSS pixels to device pixels. */
    @JavascriptInterface
    public void rect(float left, float top, float width, float height, float innerWidth, boolean cover) {
        main.post(() -> {
            lastRect = new float[] {left, top, width, height, innerWidth};
            lastCover = cover;
            applyRect();
        });
    }

    private void applyRect() {
        if (view == null || lastRect == null || lastRect[4] <= 0) return;
        float scale = web.getWidth() / lastRect[4];
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(Math.round(lastRect[2] * scale), Math.round(lastRect[3] * scale));
        lp.gravity = Gravity.TOP | Gravity.START;
        lp.leftMargin = Math.round(lastRect[0] * scale);
        lp.topMargin = Math.round(lastRect[1] * scale);
        view.setLayoutParams(lp);
        view.setResizeMode(lastCover ? AspectRatioFrameLayout.RESIZE_MODE_ZOOM : AspectRatioFrameLayout.RESIZE_MODE_FIT);
    }

    @JavascriptInterface
    public void release() {
        generation++;
        main.post(this::stop);
    }

    void onPause() {
        if (player != null) player.pause();
    }

    void destroy() {
        stop();
    }

    private void start(String url, String cookie) {
        view = new PlayerView(context);
        view.setUseController(false);
        view.setShutterBackgroundColor(Color.TRANSPARENT);
        // The page's video stage is black; letterbox bars come from this view, not the page.
        view.setBackgroundColor(Color.BLACK);
        root.addView(view, 0, new FrameLayout.LayoutParams(1, 1));
        applyRect();

        DefaultHttpDataSource.Factory http = new DefaultHttpDataSource.Factory()
            .setUserAgent(web.getSettings().getUserAgentString())
            .setAllowCrossProtocolRedirects(true);
        if (!cookie.isEmpty()) http.setDefaultRequestProperties(Collections.singletonMap("Cookie", cookie));

        player = new ExoPlayer.Builder(context, new DefaultRenderersFactory(context).setEnableDecoderFallback(true)).build();
        player.addListener(new Player.Listener() {
            @Override
            public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_READY && !readyReported) {
                    readyReported = true;
                    emit("ready", player.getDuration(), 0, 0);
                }
                if (state == Player.STATE_BUFFERING) emit("waiting", 0, 0, 0);
                if (state == Player.STATE_ENDED) emit("ended", 0, 0, 0);
            }

            @Override
            public void onIsPlayingChanged(boolean playing) {
                // Without a WebView <video> nothing tells the system the user is watching, so the screensaver would start.
                root.setKeepScreenOn(playing);
                emit(playing ? "playing" : "paused", 0, 0, 0);
            }

            @Override
            public void onPlayerError(PlaybackException e) {
                web.evaluateJavascript("window.__np&&window.__np.on('error',"
                    + e.errorCode + "," + org.json.JSONObject.quote(String.valueOf(e.getErrorCodeName())) + ",0)", null);
            }
        });
        view.setPlayer(player);
        player.setVolume(volume);
        player.setMediaSource(new ProgressiveMediaSource.Factory(http).createMediaSource(MediaItem.fromUri(url)));
        player.setPlayWhenReady(true);
        player.prepare();
        readyReported = false;
        main.postDelayed(tick, TICK_MS);
    }

    private void stop() {
        root.setKeepScreenOn(false);
        main.removeCallbacks(tick);
        if (player != null) {
            player.release();
            player = null;
        }
        if (view != null) {
            root.removeView(view);
            view = null;
        }
    }

    private void emit(String event, long a, long b, long c) {
        web.evaluateJavascript("window.__np&&window.__np.on('" + event + "'," + a + "," + b + "," + c + ")", null);
    }
}
