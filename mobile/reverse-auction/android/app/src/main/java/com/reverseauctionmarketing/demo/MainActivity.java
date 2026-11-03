package com.reverseauctionmarketing.demo;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

/**
 * Draws the demo edge to edge and reports the status and navigation bars as
 * CSS variables. The page pads with those variables, so controls stay clear of
 * Android's system buttons.
 */
public class MainActivity extends BridgeActivity {
    private Insets lastBars = Insets.NONE;
    private boolean openerAttached;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        attachExternalOpener();
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        View decor = getWindow().getDecorView();
        WindowInsetsControllerCompat controller = new WindowInsetsControllerCompat(getWindow(), decor);
        controller.setAppearanceLightStatusBars(true);
        controller.setAppearanceLightNavigationBars(true);
        ViewCompat.setOnApplyWindowInsetsListener(decor, (view, windowInsets) -> {
            lastBars = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
            );
            applyInsets();
            return windowInsets;
        });
        ViewCompat.requestApplyInsets(decor);
        if (getBridge() != null) {
            getBridge().addWebViewListener(new WebViewListener() {
                @Override
                public void onPageLoaded(WebView webView) {
                    attachExternalOpener();
                    applyInsets();
                }
            });
        }
    }

    private void applyInsets() {
        if (getBridge() == null || getBridge().getWebView() == null || lastBars == null) return;
        WebView web = getBridge().getWebView();
        web.setBackgroundColor(Color.parseColor("#E5DFD3"));
        float density = getResources().getDisplayMetrics().density;
        if (density <= 0f) density = 1f;
        String js = "document.documentElement.style.setProperty('--sat','" + px(lastBars.top, density) + "');"
            + "document.documentElement.style.setProperty('--sab','" + px(lastBars.bottom, density) + "');"
            + "document.documentElement.style.setProperty('--sal','" + px(lastBars.left, density) + "');"
            + "document.documentElement.style.setProperty('--sar','" + px(lastBars.right, density) + "');";
        web.post(() -> web.evaluateJavascript(js, null));
    }

    private String px(int pixels, float density) {
        return (pixels / density) + "px";
    }

    private void attachExternalOpener() {
        if (openerAttached || getBridge() == null || getBridge().getWebView() == null) return;
        getBridge().getWebView().addJavascriptInterface(new ExternalSite(), "RamAndroid");
        openerAttached = true;
    }

    /**
     * Opens https://rangeroadtech.com/ in the phone's browser. The WebView does not load it.
     */
    private class ExternalSite {
        @android.webkit.JavascriptInterface
        public void openExternal(String url) {
            if (url == null) return;
            Uri parsed = Uri.parse(url);
            String host = parsed.getHost();
            if (!"https".equalsIgnoreCase(String.valueOf(parsed.getScheme())) || host == null || !host.equalsIgnoreCase("rangeroadtech.com")) {
                return;
            }
            Intent intent = new Intent(Intent.ACTION_VIEW, parsed);
            runOnUiThread(() -> {
                try {
                    startActivity(intent);
                } catch (ActivityNotFoundException ignored) {
                    /* no browser on this device */
                }
            });
        }
    }
}
