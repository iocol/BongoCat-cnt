![BongoCat-cnt](https://socialify.git.ci/iocol/BongoCat-cnt/image?description=1&font=Source+Code+Pro&forks=1&issues=1&logo=https%3A%2F%2Fgithub.com%2Fayangweb%2FBongoCat%2Fblob%2Fmaster%2Fsrc-tauri%2Fassets%2Flogo-mac.png%3Fraw%3Dtrue&name=1&owner=1&pattern=Floating+Cogs&pulls=1&stargazers=1&theme=Auto)

<div align="center">
  <div>
    <a href="https://github.com/ayangweb/BongoCat/releases"><img alt="Windows" src="https://img.shields.io/badge/-Windows-blue?style=flat-square&logo=data:image/svg+xml;base64,PHN2ZyB0PSIxNzI2MzA1OTcxMDA2IiBjbGFzcz0iaWNvbiIgdmlld0JveD0iMCAwIDEwMjQgMTAyNCIgdmVyc2lvbj0iMS4xIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHAtaWQ9IjE1NDgiIHdpZHRoPSIxMjgiIGhlaWdodD0iMTI4Ij48cGF0aCBkPSJNNTI3LjI3NTU1MTYxIDk2Ljk3MTAzMDEzdjM3My45OTIxMDY2N2g0OTQuNTEzNjE5NzVWMTUuMDI2NzU3NTN6TTUyNy4yNzU1NTE2MSA5MjguMzIzNTA4MTVsNDk0LjUxMzYxOTc1IDgwLjUyMDI4MDQ5di00NTUuNjc3NDcxNjFoLTQ5NC41MTM2MTk3NXpNNC42NzA0NTEzNiA0NzAuODMzNjgyOTdINDIyLjY3Njg1OTI1VjExMC41NjM2ODE5N2wtNDE4LjAwNjQwNzg5IDY5LjI1Nzc5NzUzek00LjY3MDQ1MTM2IDg0Ni43Njc1OTcwM0w0MjIuNjc2ODU5MjUgOTE0Ljg2MDMxMDEzVjU1My4xNjYzMTcwM0g0LjY3MDQ1MTM2eiIgcC1pZD0iMTU0OSIgZmlsbD0iI2ZmZmZmZiI+PC9wYXRoPjwvc3ZnPg==" /></a>
    <a href="https://github.com/ayangweb/BongoCat/releases"><img alt="MacOS" src="https://img.shields.io/badge/-MacOS-black?style=flat-square&logo=apple&logoColor=white" /></a>
    <a href="https://github.com/ayangweb/BongoCat/releases"><img alt="Linux" src="https://img.shields.io/badge/-Linux-yellow?style=flat-square&logo=linux&logoColor=white" /></a>
  </div>

  <p>
    <a href="./LICENSE"><img src="https://img.shields.io/github/license/iocol/BongoCat-cnt?style=flat-square" /></a>
    <a href="https://github.com/iocol/BongoCat-cnt/releases/latest"><img src="https://img.shields.io/github/package-json/v/iocol/BongoCat-cnt?style=flat-square"/></a>
  </p>
</div>

## 开发背景

本项目的灵感来源于 [ayangweb](https://github.com/ayangweb) 大佬开发的 [BongoCat](https://github.com/ayangweb/BongoCat)。这是一款基于 Tauri 的跨平台互动桌宠，但原版缺少一些我想要的数据统计功能，于是 Fork 并添加了以下功能。

## 新增功能（与原版对比）

### 📊 统计面板

在猫咪窗口上实时显示键盘按键和鼠标点击的统计数据。

- **实时统计**：⌨️ 按键次数 + 🖱️ 点击次数
- **活跃计时**：自动记录今日活跃时间（5秒无操作自动暂停）
- **历史归档**：跨日自动归档，保留「上次记录」的按键/点击数据
- **右键展开**：右键点击统计面板，展开查看详细数据
- **自定义位置**：支持 4 个角位置（左上/右上/左下/右下）
- **开关控制**：可在设置中开启/关闭统计面板
- **重置统计**：一键重置所有统计数据
- **时区适配**：基于北京时间（UTC+8）自动切换日期
- **多语言支持**：中文、英文、葡萄牙文、越南文

### 🖥️ 原版已有功能

- 适配 macOS、Windows 和 Linux(x11)
- 根据键盘、鼠标或手柄的操作，同步对应的动作
- 支持导入自定义模型，自由打造专属猫咪形象
- 完全开源，代码公开透明，绝不收集任何用户数据
- 支持离线运行，无需联网，保护用户隐私

## 下载

请前往 [GitHub Releases](https://github.com/ayangweb/BongoCat/releases) 下载原版安装包。

## 模型转换

如果你想将 Bongo-Cat-Mver 应用中的模型转换为兼容 BongoCat 的格式，可以使用以下工具：

🔗 [在线转换](https://bongocat.vteamer.cc)

## 更多模型

你可以在这个仓库中探索、下载更多猫咪模型，或提交你的创作，与大家一起分享：

📦 [Awesome-BongoCat](https://github.com/ayangweb/Awesome-BongoCat)

## 许可

本项目基于 [MIT License](./LICENSE) 开源，遵循原项目 [ayangweb/BongoCat](https://github.com/ayangweb/BongoCat) 的许可协议。
