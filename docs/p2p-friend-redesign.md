# BongoCat 好友系统改造计划

## 概述

砍掉中继服务器（`server/` 目录），将好友系统简化为 EasyTier 配置界面。每个 BongoCat 客户端既当客户端也当服务器，通过 EasyTier 虚拟网络直接通信。

---

## 当前架构（改造前）

```
NAS (Docker)
┌─────────────────────────────────────┐
│  relay server (server.js)           │
│  - 端口 3721                        │
│  - /api/v1/register                 │
│  - /api/v1/heartbeat                │
│  - /api/v1/relay                    │
│  - /api/v1/poll                     │
│  - /api/v1/leave                    │
└─────────────────────────────────────┘
          ↑ 5秒轮询 HTTP
          │ via EasyTier port-forward
          │ 127.0.0.1:3721 → 10.0.0.1:3721
          │
┌──────────────────────┐   ┌──────────────────────┐
│ Client A 10.0.0.2    │   │ Client B 10.0.0.3    │
│                      │   │                      │
│ easytier-core (client)│   │ easytier-core (client)│
│                      │   │                      │
│ 只发 HTTP 请求        │   │ 只发 HTTP 请求        │
│ 不监听任何端口         │   │ 不监听任何端口         │
└──────────────────────┘   └──────────────────────┘
```

**问题**：EasyTier 已经打通了虚拟网络，节点间可以直连，但应用层还是走中心化轮询，增加了一个不必要的部署依赖。

---

## 目标架构（改造后）

```
┌──────────────────────────┐   ┌──────────────────────────┐
│ Client A 10.0.0.2        │   │ Client B 10.0.0.3        │
│                          │   │                          │
│ easytier-core            │   │ easytier-core            │
│   network_name: bongocat │   │   network_name: bongocat │
│   network_secret: ****   │   │   network_secret: ****   │
│   peer: wss://...        │   │   peer: wss://...        │
│                          │   │                          │
│ HTTP 服务端 :3722         │←──→ HTTP 服务端 :3722        │
│  POST /api/push          │   │  POST /api/push          │
│  GET  /api/hello         │   │  GET  /api/hello         │
│                          │   │                          │
│ EasyTier RPC 查询 peer   │   │ EasyTier RPC 查询 peer   │
│ → 发现 10.0.0.3 在线     │   │ → 发现 10.0.0.2 在线     │
│ → 推送数据给对方          │   │ → 推送数据给对方          │
└──────────────────────────┘   └──────────────────────────┘
```

**核心变化**：

- 删除 `server/` 整个目录（Docker、relay server、easytier-core 二进制）
- 每个客户端内嵌 HTTP 服务端（端口 3722，监听在虚拟 IP 上）
- 数据直接 P2P 推送，不再轮询
- 服务发现通过 EasyTier RPC 接口获取在线 peer 列表
- 房间 = EasyTier 网络名称，不需要 relay server 维护

---

## 配置映射

好友设置页面改造为 EasyTier 配置页面：

| 界面字段       | →   | EasyTier 配置项  | 说明                        |
| -------------- | --- | ---------------- | --------------------------- |
| 房间号         | →   | `network_name`   | 同一个网络名称 = 同一个房间 |
| 网络密码       | →   | `network_secret` | 组网认证密码                |
| 中转服务器地址 | →   | `[[peer]] uri`   | EasyTier 公共协调服务器     |
| 昵称           | →   | `hostname`       | 设备名称，也作为好友昵称    |

用户只需填入这 4 项，就能完成组网和好友连接。

**删除的配置项**：~~服务器地址~~（relay server 不存在了）

---

## 数据流（改造后）

### 连接流程

```
1. 用户填入：房间号、密码、中转服务器地址、昵称
   ↓
2. BongoCat 生成 EasyTier TOML 配置
   ↓
3. 启动 easytier-core 加入虚拟网络
   ↓
4. 获取本机虚拟 IP（EasyTier DHCP 分配，如 10.0.0.2）
   ↓
5. 在本机 0.0.0.0:3722 启动 HTTP 服务端
   ↓
6. 通过 EasyTier RPC 查询在线 peer
   ↓
7. 向每个 peer 的 10.0.0.x:3722/hello 发送请求，获取对方昵称和房间信息
   ↓
8. 匹配则加入好友列表
```

### 数据同步

```
每个定时周期（如 5 秒）：

  1. 更新本机统计数据
  2. 向所有在线 peer 的 /api/push 发送 POST
     → body: { nickname, today: { key_presses, mouse_clicks, active_sec } }
  3. 接收对方回复，更新好友列表
```

**相比现在的改进**：

- 数据是推的，不是拉的（不需要 poll）
- 对方不在线不会丢数据——既然没有 relay 存消息，不在线就等下次上线再推
- 好友上下线通过 RPC 和 push 超时检测

### 断开流程

```
1. 用户点击断开
2. 停止 HTTP 服务端
3. 杀死 easytier-core 进程
4. 清空好友列表
```

---

## 需要改动的文件

### 删除

| 文件                                    | 原因                                         |
| --------------------------------------- | -------------------------------------------- |
| `server/` 整个目录                      | 不再需要 Docker 部署的 relay server          |
| `server/Dockerfile`                     |                                              |
| `server/docker-compose.yml`             |                                              |
| `server/server.js`                      |                                              |
| `server/.env` / `.env.example`          |                                              |
| `server/start.sh`                       |                                              |
| `server/easytier-core`                  | 二进制随客户端打包，不需要单独放在 server 里 |
| `server/package.json` / `node_modules/` |                                              |

### 修改 Rust 后端（`src-tauri/src/core/buddy.rs`）

| 逻辑                                       | 改为什么                                                            |
| ------------------------------------------ | ------------------------------------------------------------------- |
| `register()` → HTTP POST 到 relay server   | ❌ 删除                                                             |
| `heartbeat()` → HTTP POST 到 relay server  | ❌ 删除                                                             |
| `relay()` → HTTP POST 到 relay server      | ❌ 删除                                                             |
| `poll()` → HTTP GET 从 relay server 拉消息 | ❌ 删除                                                             |
| `start_easytier()`                         | 保留，去掉 `--port-forward` 参数（不再需要转发到 relay server）     |
| 轮询循环 `tick()`                          | 改为 P2P 推送循环                                                   |
| 无                                         | **新增** `start_http_server()` → 在虚拟 IP 上监听 `:3722`           |
| 无                                         | **新增** `discover_peers()` → 通过 EasyTier RPC 获取在线 peer       |
| 无                                         | **新增** `push_to_peer()` → 直接 POST 数据到 peer 的 `/api/push`    |
| `BuddyConfig`                              | 删除 `server_url` 字段                                              |
| `BuddyInfo`                                | 保持不变（user_id、nickname、virtual_ip、online、today、last_seen） |

### 修改前端

| 文件                                              | 改动                                         |
| ------------------------------------------------- | -------------------------------------------- |
| `src/stores/buddy.ts`                             | 移除 `serverUrl` 配置                        |
| `src/pages/preference/components/buddy/index.vue` | 界面改为 EasyTier 配置布局（见下方 UI 示意） |

### UI 改动示意（好友设置页）

```
┌─────────────────────────────┐
│  🖧 网络连接                │
│                             │
│  房间号      [___________]  │
│  网络密码    [___________] 👁 │
│  中转服务器  [___________]  │
│  昵称        [___________]  │
│                             │
│  状态: ● 已连接              │
│  [断开连接]                  │
├─────────────────────────────┤
│  👥 好友列表 (3)             │
│                             │
│  1. 张三  ●在线              │
│     ⌨️12,543 🖱️3,891 ⏱️2h20m │
│                             │
│  2. 李四  ○离线 上次 5分钟前   │
│     ⌨️8,201 🖱️2,104 ⏱️1h15m │
│                             │
│  3. 王五  ●在线              │
│     ⌨️15,002 🖱️4,503 ⏱️3h10m │
└─────────────────────────────┘
```

---

## EasyTier 配置生成示例

用户填写：

```
房间号:        bongocat
网络密码:      my-secret-123
中转服务器:    wss://speedtest.333304.xyz:11012/
昵称:         Doubleyang
```

生成的 TOML：

```toml
hostname = "Doubleyang"
instance_name = "bongocat"
dhcp = true
listeners = []
rpc_portal = "127.0.0.1:15880"

[network_identity]
network_name = "bongocat"
network_secret = "my-secret-123"

[[peer]]
uri = "wss://speedtest.333304.xyz:11012/"
```

关键变化：

- 去掉 `--port-forward`（不再需要把本机端口转发到 relay server）
- 设置 `rpc_portal = "127.0.0.1:15880"`（固定端口，供客户端查询 peer 列表）

---

## 需要关注的问题

### 1. EasyTier RPC 查询 peer 列表

通过 EasyTier 的 JSON RPC 接口（`rpc_portal`）可以获取在线 peer 信息。需要确认具体命令格式和返回数据是否包含虚拟 IP。

备选方案：如果 RPC 不可用或不稳定，可以用 `--port-forward` 的变体——每个客户端通过 EasyTier 的端口转发暴露自己的 `/api/hello`，然后在同一网络内广播发现。

### 2. 虚拟 IP 端口可达性

`--no-tun --use-smoltcp` 模式下，EasyTier 创建的是用户态 TCP/IP 栈。客户端 HTTP 服务端监听 `0.0.0.0:3722`，其他 peer 通过虚拟 IP（如 `10.0.0.3:3722`）访问。
需要验证 smoltcp 模式下虚拟 IP 的端口监听是否正常工作。

### 3. 多个客户端同时在线

每个客户端既是 server 又是 client：

- `0.0.0.0:3722` 作为服务端接收别人的数据
- 同时也作为客户端向别人推送自己的数据
- Tauri Rust 后端用 tokio 同时处理这两个角色

### 4. 离线处理

没有 relay server 存离线消息。好友上线后才开始接收数据。这对 BongoCat 的"今日统计"场景来说是合理的——你上线我就同步给你，离线期间的数据你上来后自然会看到。

### 5. EasyTier 二进制打包

`server/easytier-core` 删除后，二进制需放入 `src-tauri/resources/` 并在 `tauri.conf.json` 的 `bundle.resources` 中声明，否则打包后运行时找不到。

### 6. 重连后虚拟 IP 变化

EasyTier DHCP 分配的 IP 不是固定的。断开重连后 IP 可能变化，之前缓存的 peer IP 失效。每次推送前应重新走 RPC 发现，不缓存 IP。

### 7. HTTP 客户端选型

之前 reqwest 已删除，需重新引入轻量 HTTP 库。服务端用 `tiny_http`（零依赖），客户端用 `ureq`（阻塞式同步，不引入 tokio 运行时复杂度）。避免重量级依赖。

---

## 实现顺序

1. **Rust 后端**：实现嵌入式 HTTP 服务端 + P2P 推送 + EasyTier RPC 发现
2. **配置简化**：去掉 server_url，改名为 Easytier 配置项
3. **前端 UI**：调整好友页面的表单项
4. **删除 server 目录**：清理不再需要的文件
5. **验证**：两台机器跨网络测试

---

## 改造前后对比

| 维度       | 改造前                           | 改造后                |
| ---------- | -------------------------------- | --------------------- |
| 需要服务器 | ✅ 需要 NAS 跑 Docker            | ❌ 不需要             |
| 部署复杂度 | 高（Docker、端口映射、签名问题） | 低（用户填 4 个字段） |
| 数据路径   | 客户端 → relay → 客户端          | 客户端 ⬌ 客户端       |
| 消息延迟   | 5 秒轮询                         | 即时推送              |
| 离线消息   | relay 暂存                       | 上线后同步            |
| 系统依赖   | relay server + EasyTier          | 只有 EasyTier         |
