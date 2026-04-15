# BatchDistributor 静态网页工具

这是一个基于 `Vite + ethers + WalletConnect` 的静态网页，用来在 **BNB Smart Chain** 上：

- 用手机钱包扫码连接
- 对 ERC20 执行 `approve(合约地址, MaxUint256)`
- 按权重对象计算每个地址应得数量
- 调用你的 `BatchDistributor.batchTransfer(token, recipients, amounts)`

## 你的合约

- 合约地址: `0x501Ac36B6BbDB1e54D5A070C11DDE08D19f63274`（前端写死，不可编辑，可点击跳转 BscScan）
- 默认 RPC: `https://bsc-mainnet.public.blastapi.io`
- 默认链: `BNB Smart Chain` (`chainId = 56`)

## 分配逻辑

页面会读取“已连接钱包”的指定 token 余额，然后按下面公式计算：

`floor(balance * 单个地址权重 / 总权重)`

也就是：

1. `obj` 的 value 全部相加得到总权重
2. 每个地址拿 `balance * 自己权重 / 总权重`
3. 向下取整
4. 余数不会自动补给任何地址，会保留在钱包里

## 使用

1. 安装依赖

```bash
npm install
```

2. 启动开发服务器

```bash
npm run dev
```

3. 配置环境变量，创建 `.env.local`

```bash
VITE_REOWN_PROJECT_ID=你的_reown_project_id
```

4. 打开页面后填写：

- `Token 地址`
- `权重对象 JSON`

如果没有配置 `VITE_REOWN_PROJECT_ID`，也可以在页面里手动填写 `WalletConnect Project ID`。

5. 点击“连接钱包”，手机扫码
   如果钱包提示二维码过期，可以点“刷新二维码”
6. 点击“Approve 无限额度”，在手机钱包确认
7. 点击“预览分配”检查结果
8. 点击“执行 BatchTransfer”，在手机钱包确认

## Project ID

WalletConnect v2 现在需要你自己的 Reown Project ID：

- 控制台: <https://dashboard.reown.com>

## 会话保存

- 表单配置保存在浏览器 `localStorage`
- WalletConnect 会尝试复用已有会话
- 但如果钱包端主动断开，或会话过期，还是需要重新扫码
- 页面会在二维码生成约 90 秒后提示你刷新，避免继续扫旧二维码

## 关于“不盲签名”

网页会发起明确的合约调用，不会请求你导入私钥，也不会让本地代签。

但要注意：

- `approve` 一般钱包能直接识别
- `batchTransfer` 是否能在钱包里完整解码显示，取决于钱包自身支持，以及你的合约是否被对应钱包识别
- 所以这里能保证的是“正常的合约交易请求”，不能保证“所有钱包都用人类可读方式展示”
