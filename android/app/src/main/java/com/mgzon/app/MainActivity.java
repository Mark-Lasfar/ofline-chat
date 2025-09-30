package com.mgzon.app;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.webkit.WebView;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Enable WebView debugging
        WebView.setWebContentsDebuggingEnabled(true);
        // Ensure JavaScript is enabled
        getBridge().getWebView().getSettings().setJavaScriptEnabled(true);
        // Allow file access for ONNX models
        getBridge().getWebView().getSettings().setAllowFileAccess(true);
        // Allow content access
        getBridge().getWebView().getSettings().setAllowContentAccess(true);
    }
}