# 合拍修理铺部署说明

项目需要一个支持 Node.js 长连接的服务。Express 同时提供 Vite 构建产物、HTTP API 和 Socket.IO；GitHub 用于保存源码与触发构建，GitHub Pages 单独不能承载双人服务。

本页是部署配置说明，不表示已上线。访问链接和 PPT 二维码应在实际公网地址验收后生成。

## 运行边界

- Node.js 24，或满足项目要求的兼容版本。`npm run build` 编译前端和后端，`npm start` 使用编译后的 JavaScript，不依赖生产环境安装 `tsx`。
- 同一个域名根路径提供前后端，不需要额外配置浏览器跨域地址。反向代理需转发 `/socket.io/` 的 WebSocket 升级与 HTTP 长轮询，不能只代理页面。
- 只运行一个实例和一个 Node.js 进程。当前状态保存在内存与 `DATA_DIR/state.json`，不能启动多个副本共享文件，也不能开启 PM2 cluster。
- 将 `DATA_DIR` 指向持久卷；重新部署和重启后保留同一卷。它包含私有房间数据，不得提交 GitHub 或作为静态目录公开。
- 单实例更新期间连接会短暂中断，原标签页会尝试重连。部署安排在试玩前，避免在活动进行中更新。

## 环境变量

| 变量 | 设置 |
| --- | --- |
| `PORT` | 平台分配端口；默认 3001，监听 `0.0.0.0` |
| `DATA_DIR` | 持久存储绝对路径，例如 `/var/lib/hepai/data` |
| `SHARE_BASE_URL` | 实际外部来源，例如 `https://实际域名`，不带路径、参数或凭证 |
| `ALLOWED_ORIGINS` | 可选的精确来源列表，逗号分隔；不填写时只允许 `SHARE_BASE_URL` 对应的浏览器来源 |

Render 自动提供的 `RENDER_EXTERNAL_URL` 在未明确设置 `SHARE_BASE_URL` 时作为备用来源。添加自定义域名后，应将实际展示的域名设为 `SHARE_BASE_URL`；如果仍要同时允许平台域名，需把两个来源都加入 `ALLOWED_ORIGINS`。

生产地址使用 HTTPS。服务器不通过访客提供的 `Host`、`X-Forwarded-Host` 或 `X-Forwarded-Proto` 判断可信来源，也不设置通配 CORS。HTTPS 在托管平台或反向代理处终止，容器内部 HTTP 不影响二维码和分享链接；这些链接使用明确配置的 HTTPS 外部来源。

`.env.example` 仅供填写参考；程序不自动加载 `.env`，应在平台环境变量或进程环境中配置。不要提交实际密钥。

## 普通 Node.js 主机

工作目录设为仓库根目录，构建命令 `npm ci --include=dev && npm run build`，启动命令 `npm start`，健康检查 `/api/health`。运行阶段可以使用 `npm prune --omit=dev` 移除开发依赖，编译后的服务继续工作。

反向代理把同域全部路径转到本服务的 `PORT`，并支持 WebSocket。对 `/socket.io/` 关闭响应缓冲、保留 Upgrade/Connection 头；代理的读取超时建议至少 60 秒。

## Docker 主机

```sh
docker build -t hepai-repair .
docker volume create hepai-data
docker run -d --name hepai-repair --restart unless-stopped \
  -p 127.0.0.1:3001:3001 \
  -v hepai-data:/var/lib/hepai \
  -e SHARE_BASE_URL=https://实际域名 \
  hepai-repair
```

此示例等待主机上的 HTTPS 反向代理转发到 3001。容器以普通 `node` 用户运行；如果使用绑定宿主目录而非 Docker 命名卷，应先给该目录匹配的写入权限。不要用删除数据卷的方式更新镜像。

Dockerfile 为多阶段构建，仅将运行依赖、前端和编译后端带入最终镜像，提供 `/api/health` 容器健康检查。`.dockerignore` 排除真实数据、环境文件、个人报告和演示材料。

## Render 配置示例

`deploy/render.persistent.yaml.example` 提供 Docker 单实例与 1 GB 持久盘示例。该示例的 `starter` 计算实例和磁盘涉及费用，必须由账号所有者确认平台当前费用后再应用；目前没有创建服务或触发收费资源。

Render 免费实例会在空闲后休眠，运行文件在重启、重新部署或休眠后丢失，且不能挂载持久盘，因此不能把它描述为可长期保存作品的完整部署。不要为了免费上线而悄悄改变作品保存承诺。

确认方案后，在 Render 使用正确 GitHub 仓库创建 Docker Web Service，指定该示例文件为 Blueprint 配置或复制为 `render.yaml`。确认只有一个实例，挂载 `/var/lib/hepai`，数据目录设为 `/var/lib/hepai/data`。实际 URL 由创建后的平台结果决定，不能预先猜测。

来源：[Render 默认环境变量](https://render.com/docs/environment-variables)、[持久磁盘](https://render.com/docs/disks)、[免费实例限制](https://render.com/docs/free)、[Blueprint 配置](https://render.com/docs/blueprint-spec)、[Node.js 版本](https://render.com/docs/node-version)。核对日期：2026年11月11日。

## GitHub 提交范围

提交 `src/`、`server/`、`shared/`、`tests/`、必要构建和部署配置、`package-lock.json` 与项目说明。`.gitignore` 已排除 `data/`、`.env*`（参考文件除外）、构建缓存、`output/`、PPT、Word、PDF 和测试产物，避免把纸签、恢复信息、个人报告及本机研究材料上传。上传前仍应核对暂存列表。

## 上线验收

1. 从公网访问首页和 `/api/health`，确认实际域名与 `/api/config` 的分享基址一致。
2. 两个独立浏览器或两部设备从相同 HTTPS 地址加入同一房间，验证准备、安装、换工具、共同试听、确认失效、双方启动与纸签收发。
3. 保留标签页，重启实例后使用同一数据卷，确认原房间恢复和作品保存；不要在活动进行时做此项。
4. 手机移动网络扫码打开实际首页和房间链接，检查声音需分别允许、纵向布局和 3D 操作。
5. 再生成首页二维码写入 PPT。首页二维码适合长期课堂展示；具体房间码有有效期，扫码桌牌应在现场工位等待页生成。

本机部署回归：`npm run test:deployment`。它验证编译生产入口、页面回退、准确 Origin、拒绝转发头伪造和同一数据目录的房间重启恢复；不等于公网或实体手机验收。
