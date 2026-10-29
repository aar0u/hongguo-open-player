package org.hongguo.tv;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.FrameLayout;

import java.io.IOException;

public class MainActivity extends Activity {
    private static final String PREFS = "hongguo";
    private static final String KEY_URL = "server_url";

    // Makes the web UI usable with a D-pad: cards become focusable, OK clicks them or toggles playback.
    private static final String TV_JS =
        "(function(){if(window.__tv)return;window.__tv=1;"
        + "var s=document.createElement('style');"
        + "s.textContent='.drama-card:focus,.actor-card:focus,button:focus{outline:3px solid #ffb300!important;outline-offset:2px}';"
        + "document.head.appendChild(s);"
        + "function mark(){document.querySelectorAll('.drama-card,.actor-card').forEach(function(e){e.tabIndex=0;});}"
        + "new MutationObserver(mark).observe(document.body,{childList:true,subtree:true});mark();"
        + "window.addEventListener('keydown',function(e){"
        + "if(e.key!=='Enter')return;var t=e.target;"
        + "if(t&&t.matches&&t.matches('.drama-card,.actor-card')){t.click();e.preventDefault();return;}"
        + "var v=document.querySelector('.theater-view video');"
        + "if(v&&!(t&&t.matches&&t.matches('button,a,input,select'))){v.paused?v.play():v.pause();e.preventDefault();}"
        + "},true);})();";

    // Returns true when the page has an inner view (theater, fullscreen, actor modal) that Back should close first.
    private static final String BACK_JS =
        "(function(){var inner=!!(document.fullscreenElement||document.querySelector('.theater-view,.actor-modal-overlay'));"
        + "if(inner)window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true}));"
        + "return inner;})()";

    private WebView web;
    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private FrameLayout root;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        root = new FrameLayout(this);
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

        WebView.setWebContentsDebuggingEnabled(true);
        WebSettings st = web.getSettings();
        st.setJavaScriptEnabled(true);
        st.setDomStorageEnabled(true);
        st.setMediaPlaybackRequiresUserGesture(false);

        web.setWebViewClient(new WebViewClient() {
            // The TV's system WebView (Chrome 66 on Android 9) cannot parse the client's modern syntax,
            // so serve the esbuild-transpiled copy that CI bundles into assets/.
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                if (!"/js/app.js".equals(req.getUrl().getPath())) return null;
                try {
                    return new WebResourceResponse("application/javascript", "utf-8", getAssets().open("app.js"));
                } catch (IOException e) {
                    return null;
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                view.evaluateJavascript(TV_JS, null);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                if (!req.isForMainFrame()) return;
                String url = serverUrl();
                view.loadDataWithBaseURL(null,
                    "<body style='background:#111;color:#eee;font:28px sans-serif;padding:60px'>"
                    + "<p>无法连接 " + url + "</p><p>确认手机上的服务已启动。按遥控器菜单键可修改地址。</p>"
                    + "<p><a href='" + url + "' style='color:#ffb300'>重试</a></p></body>",
                    "text/html", "utf-8", null);
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onShowCustomView(View view, CustomViewCallback cb) {
                if (customView != null) {
                    cb.onCustomViewHidden();
                    return;
                }
                customView = view;
                customViewCallback = cb;
                root.addView(view, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                web.setVisibility(View.GONE);
            }

            @Override
            public void onHideCustomView() {
                if (customView == null) return;
                root.removeView(customView);
                customView = null;
                customViewCallback.onCustomViewHidden();
                web.setVisibility(View.VISIBLE);
            }
        });

        web.loadUrl(serverUrl());
    }

    private String serverUrl() {
        return getSharedPreferences(PREFS, MODE_PRIVATE).getString(KEY_URL, BuildConfig.SERVER_URL);
    }

    private void promptServerUrl() {
        final EditText input = new EditText(this);
        input.setText(serverUrl());
        new AlertDialog.Builder(this)
            .setTitle("服务地址")
            .setView(input)
            .setPositiveButton("保存", (d, w) -> {
                String url = input.getText().toString().trim();
                if (url.isEmpty()) return;
                getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(KEY_URL, url).apply();
                web.loadUrl(url);
            })
            .setNegativeButton("取消", null)
            .show();
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        switch (keyCode) {
            case KeyEvent.KEYCODE_MENU:
                promptServerUrl();
                return true;
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
            case KeyEvent.KEYCODE_MEDIA_PLAY:
            case KeyEvent.KEYCODE_MEDIA_PAUSE:
                web.evaluateJavascript(
                    "(function(){var v=document.querySelector('video');if(v){v.paused?v.play():v.pause();}})()", null);
                return true;
            default:
                return super.onKeyDown(keyCode, event);
        }
    }

    @Override
    public void onBackPressed() {
        if (customView != null) {
            web.getWebChromeClient().onHideCustomView();
            return;
        }
        web.evaluateJavascript(BACK_JS, handled -> {
            if (!"true".equals(handled)) finish();
        });
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onDestroy() {
        web.destroy();
        super.onDestroy();
    }
}
