// Program-only allowlist. Recipient profiles and credentials are never build inputs.
module.exports={
  "appId": "local.xiaoxiao.video.studio.share",
  "productName": "晓晓视频创作台",
  "directories": {
    "output": "dist-video-share"
  },
  "extraMetadata": {
    "name": "xiaoxiao-video-studio-share",
    "version": "1.0.2",
    "main": "video-share-v2-main.cjs",
    "dependencies": {}
  },
  "files": [
    "video-share-v2-main.cjs",
    "video-share-preload.cjs",
    "video-share-storage.cjs",
    "workbench-storage.js",
    "workbench-window.js",
    "startup-preload.js",
    "startup.html",
    "startup.js",
    "managed-runtime.js",
    "runtime-supervisor.cjs",
    "infinite-canvas-service.js",
    "pippit-service.js",
    "dreamina-service.js",
    "dreamina-canvas-service.js",
    "dreamina-reference-cache.js",
    "pippit-canvas-service.js",
    "pippit-canvas-generation.js",
    "pippit-canvas-broker.js",
    "video-studio-files.js",
    "local-asset-links.js",
    "project-library.js",
    "asset-store.js",
    "project-assets.js",
    "!node_modules/**"
  ],
  "extraResources": [
    {
      "from": "video-studio-web",
      "to": "video-studio-web",
      "filter": [
        "**/*",
        "!**/*.map",
        "!**/*.log",
        "!**/.env*"
      ]
    },
    {
      "from": "infinite-canvas-runtime",
      "to": "infinite-canvas-runtime",
      "filter": [
        "infinite-canvas-server.exe",
        "LICENSE",
        "ORIGIN.json",
        "NOTICE.md"
      ]
    },
    {
      "from": "pippit-runtime",
      "to": "pippit-runtime",
      "filter": [
        "pippit-tool-cli.exe",
        "LICENSE",
        "ORIGIN.json"
      ]
    },
    {
      "from": "dreamina-runtime",
      "to": "dreamina-runtime",
      "filter": [
        "dreamina.exe",
        "ORIGIN.json"
      ]
    },
    {
      "from": "dreamina-canvas-runtime",
      "to": "dreamina-canvas-runtime",
      "filter": [
        "dreamina-canvas.exe",
        "ORIGIN.json"
      ]
    },
    {
      "from": "pippit-canvas-runtime",
      "to": "pippit-canvas-runtime",
      "filter": [
        "run.cjs",
        "dist/**",
        "scripts/**",
        "LICENSE",
        "ORIGIN.json"
      ]
    },
    {
      "from": "assets",
      "to": "assets",
      "filter": [
        "typetale-workbench.ico"
      ]
    }
  ],
  "win": {
    "target": [
      "dir"
    ],
    "icon": "assets/typetale-workbench.ico",
    "artifactName": "晓晓视频创作台-分享版-${version}.${ext}"
  }
};
