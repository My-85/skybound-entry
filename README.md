# SKYBOUND · 通用机动飞行实验室

这是飞行实验室的 GitHub Pages 访问入口，默认打开山谷巡检场景。

入口会跳转到现有实验室，保留场景编辑、学生与教师飞行回放、计算队列及 Tacview 导出功能。它沿用原站的访问权限，不会绕过登录，也不会公开计算后台密钥。

## 发布

在仓库 Settings → Pages 中，将发布来源设为 `main` 分支的根目录。访问发布地址时，可以使用 `?scene=valley-inspection` 等原站支持的场景参数。

## 源码与后台

此仓库只保存入口页面。完整实验室包含 Cloudflare Workers、D1、R2 和受保护的计算服务，不能直接作为静态网站部署到 GitHub Pages。
