# MarkDock 书签坞隐私政策

**适用范围：** Chrome 扩展及随附的本地网页模式
**生效日期：** 2026-10-19

## 开发者与联系信息

开发者名称：**thevipsong**  
隐私联系邮箱：**thevipsong@gmail.com**  

请在提交 Chrome 应用商店前填写以上信息，并将本政策发布到无需登录即可访问的公开 HTTPS 页面，再把页面地址填入 Chrome 应用商店开发者后台。

## 处理的数据

MarkDock 会在用户设备上读取 Chrome 书签的标题、网址、文件夹和排序信息，用于显示、搜索、分类、编辑、移动、删除、导入和导出书签。用户主动使用快捷键或右键菜单快速保存当前页面时，扩展会读取当前标签页的标题和网址来创建书签。用户在 MarkDock 创建或导入的本地书签保存在本机。收藏状态、图标覆盖、外观设置和其他本地工作台偏好也保存在浏览器本地存储中。自定义壁纸经过压缩后保存在本机 IndexedDB。

MarkDock 不会把书签库发送给开发者，也不运行开发者自有的分析、广告或书签中转服务。Chrome 可能根据用户自己的浏览器设置同步 Chrome 书签。

## Chrome Sync

如果 Chrome Sync 可用，扩展会使用 `chrome.storage.sync` 同步以下界面偏好：导航树展开状态、网格或列表视图、排序方式、卡片密度和侧栏折叠状态。为在其他设备还原导航树，展开状态中会包含对应的 Chrome 书签文件夹 ID。书签标题、网址、文件夹名称、搜索内容和自定义壁纸不会写入 Chrome Sync。

## 网络请求

- **高清站点图标：** 显示书签卡片时，扩展会自动尝试从书签对应网站读取常见图标地址，以提供高清图标。请求不携带页面 Referer；网站仍可看到网络连接并按其规则记录请求。
- **失效链接检查：** 仅当用户主动启动检查后，扩展才请求相应书签网址。扩展会先向 Chrome 申请所需网站权限，使用不携带 Cookie 的请求，不跟随重定向到的其他主机。目标网站会收到连接请求，并可能记录 IP 地址、请求时间和网址。
- **本地网页模式：** 本地 Python 服务只绑定 `127.0.0.1`。图标和链接检查请求由用户设备直接发出，不经过开发者服务器。

## 数据保留与控制

本地创建或导入的书签、收藏状态、图标缓存和外观设置会保存在当前浏览器配置中，直到用户清除扩展数据或移除扩展。Chrome 原生书签仍由 Chrome 管理；Chrome Sync 偏好由 Chrome 账号同步功能管理。用户可在扩展管理页面撤销可选网站权限，关闭对应网络功能，或移除扩展。由目标网站记录的网络日志受其各自隐私政策约束。

## 儿童隐私

MarkDock 不是面向儿童的产品，不会有意收集儿童的个人信息。

## Chrome Web Store Limited Use 声明

The use of information received from Google APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements. MarkDock uses bookmark data only to provide bookmark management features requested by the user. It may send individual favicon or link requests directly to the corresponding sites to provide those features, but it does not upload or share the complete bookmark library with the developer or other parties. MarkDock does not sell user data or use it for advertising.

## 联系方式

隐私相关问题请联系：**thevipsong@gmail.com**。
