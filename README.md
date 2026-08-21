# Elaina QQBot Web

Elaina QQBot 的独立 Web 前端源码仓库。

## 开发

执行 npm install 后运行 npm run dev。开发服务器会把 /api 和 /ws 代理到 http://localhost:5201。

## 构建

直接运行 npm run build，默认输出到本仓库的 dist/。

需要直接发布到后端项目的 web/dist/ 时，将 ELAINA_QQBOT_BACKEND_DIR 设置为后端项目目录后再运行构建。后端也支持通过 ELAINA_QQBOT_WEB_DIST 直接加载本仓库构建出来的 dist/，无需复制文件。
