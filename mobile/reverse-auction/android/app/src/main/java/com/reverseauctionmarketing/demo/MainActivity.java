package com.reverseauctionmarketing.demo;

import android.graphics.Color;
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

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
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
}
