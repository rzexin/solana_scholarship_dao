<div align="center">

# 🎓 Scholarship DAO

**一个建立在 Solana 上、由社区治理的链上奖学金协议。**

捐赠 SOL → 成为成员 → 发起提案 → 投票 → 自动执行。所有状态转移均可链上验证，所有奖学金均由程序派生金库确定性地拨付 —— 无需管理员私钥。

<p>
  <img alt="Solana" src="https://img.shields.io/badge/Solana-Devnet-14F195?style=flat-square&logo=solana&logoColor=white" />
  <img alt="Anchor" src="https://img.shields.io/badge/Anchor-0.32.1-512BD4?style=flat-square" />
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js" />
  <img alt="React" src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white" />
  <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind-4-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white" />
  <img alt="License" src="https://img.shields.io/badge/License-MIT-green?style=flat-square" />
</p>

[English](./README.md) · **简体中文**

[特性](#-核心特性) · [架构](#-项目架构) · [快速开始](#-快速开始) · [合约 API](#-合约-api) · [路线图](#-路线图)

![Scholarship DAO](./og-image.png)

</div>

---

## 📖 项目简介

**Scholarship DAO** 是一套面向社区资助型奖学金的生产级治理协议。捐赠者将 SOL 转入一个由程序派生（PDA）的金库，自动获得投票成员身份，并共同决定哪些申请人可以获得资助。提案在投票期结束时**确定性地**完成：若同时满足法定人数（quorum）、赞成阈值（threshold）且赞成票多于反对票，资金将在同一笔交易中自动从金库转出至受益人账户 —— 无需多签、无管理员后门，除了链上可审计的程序本身外，不需要信任任何第三方。

本项目由两部分构成：

- 一个**可审计**的 Anchor 合约（约 700 行 Rust）；
- 一个**现代化**的 Next.js 前端，基于 [`@solana/kit`](https://github.com/anza-xyz/kit) 技术栈与 [Codama](https://github.com/codama-idl/codama) 自动生成的类型安全客户端。

---

## ✨ 核心特性

### 链上治理

- 🏛️ **无许可的 DAO 创建** —— 任何钱包都可以创建一个拥有独立金库、独立投票规则、独立元数据的 DAO。
- 💰 **捐赠即入会** —— 通过 `init_if_needed` 一步完成会员 PDA 创建，并累计记录每位成员的历史捐赠总额。
- 📝 **结构化提案** —— 包含金额、受益人、理由以及 IPFS 链下证明 `proof_cid`。
- 🗳️ **逐会员的赞成 / 反对投票** —— 每个成员对每个提案只能投一次票，由 `VoteRecord` PDA 强制保证。
- ⏱️ **基于截止时间的终态** —— 拒绝提前执行：提案只能在投票期结束**之后**执行。
- ✅ **确定性执行规则**（由链上合约强制）：
  ```
  votes_for > votes_against
  votes_for ≥ vote_threshold
  (votes_for + votes_against) ≥ quorum
  → 金库 → 受益人（原子级 SOL 转账）
  ```
- 🏦 **PDA 所有制金库** —— 资金由 `SystemAccount` 类型的 PDA 持有，仅合约可签名，按 DAO 隔离。
- 🔒 **管理员权限的元数据修改** —— 名称 / 描述 / 图标的编辑由 `has_one` 约束，仅 DAO admin 可操作。
- 🚫 **可取消的提案** —— 提案发起人或 DAO 管理员可以取消一个 Pending 状态的申请。
- 📣 **完整的事件日志** —— `DaoInitialized`、`Donated`、`ApplicationCreated`、`Voted`、`ApplicationExecuted`、`ApplicationCancelled`、`DaoMetadataUpdated`。

### 前端体验

- ⚡ **Next.js 16 App Router + React 19**，支持 Server Components 与流式渲染。
- 🔌 **Wallet Standard 集成** —— 自动识别全部符合 Wallet Standard 的钱包（Phantom、Solflare、Backpack……）。
- 🎨 **现代化、无障碍的 UI** —— Tailwind CSS v4、自定义设计 tokens、极光背景、键盘快捷键。
- 📊 **实时数据分析** —— 金库历史曲线、捐赠者排行榜、活动流、单提案投票进度。
- 🔄 **自动刷新** —— 基于 SWR，链上数据每 30 秒轮询一次。
- 📎 **IPFS 证明上传** —— 提案可通过服务端 Pinata 代理附加链下材料（10 MB 上限，MIME 白名单）。
- 🧩 **类型安全的客户端** —— 由 Codama 从 Anchor IDL 自动生成指令构造器、账户解码器、PDA 查找器。
- 🌐 **多集群感知** —— 一键切换 Devnet / Mainnet-Beta / 自定义 RPC。

---

## 🏗️ 项目架构

```
┌──────────────────────────────────────────────────────────────────────────┐
│                            Next.js 前端                                  │
│  app/                                                                    │
│  ├── page.tsx             首页 · DAO 列表 · 实时统计                     │
│  ├── dao/[address]/       DAO 工作台（总览 / 提案 / 金库 / 成员 / ...）  │
│  ├── me/                  "我的工作台" —— 我参与 / 创建的 DAO            │
│  ├── api/ipfs-upload/     服务端 Pinata 代理（Node runtime）             │
│  ├── components/          UI · 图表 · 布局 · DAO 业务组件                │
│  ├── lib/                                                                │
│  │   ├── wallet/          Wallet Standard 适配层 + Signer                │
│  │   ├── hooks/           SWR 数据 hooks                                 │
│  │   ├── dao/             PDA helpers · 字符串编解码 · 状态工具          │
│  │   └── ipfs.ts          CID 校验与网关 URL 构造                        │
│  └── generated/           ← Codama 生成的指令与解码器                    │
└─────────────────────────────────┬────────────────────────────────────────┘
                                  │  @solana/kit (RPC + 交易签名)
                                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                  Anchor 合约 (scholarship_dao)                           │
│  anchor/programs/scholarship_dao/src/                                    │
│  ├── lib.rs                                                              │
│  │   ├── initialize_dao        → Dao PDA                                 │
│  │   ├── donate                → Member PDA + Treasury PDA               │
│  │   ├── create_application    → Application PDA                         │
│  │   ├── vote                  → VoteRecord PDA                          │
│  │   ├── execute               → 从金库向受益人转账                      │
│  │   ├── cancel_application                                              │
│  │   └── update_dao_metadata                                             │
│  └── tests.rs                  基于 LiteSVM 的单元测试                   │
└──────────────────────────────────────────────────────────────────────────┘
```

### 链上账户

| PDA | Seeds | 作用 |
| --- | --- | --- |
| `Dao` | `["dao", creator, dao_id]` | 治理参数与计数器 |
| `Treasury` | `["treasury", dao]` | PDA 所有的 `SystemAccount`，持有 SOL |
| `Member` | `["member", dao, donor]` | 会员记录 + 累计捐赠总额 |
| `Application` | `["app", dao, app_id]` | 提案（金额、受益人、理由、证明 CID、票数、状态） |
| `VoteRecord` | `["vote", application, member]` | 保证每个成员对每个提案只能投一次票 |

---

## 📦 技术栈

| 层 | 技术 |
| --- | --- |
| 智能合约 | **Rust** · **Anchor 0.32.1** · **LiteSVM**（测试） |
| 客户端 SDK | **`@solana/kit` 6** · **Codama**（IDL → TS 代码生成） |
| 前端 | **Next.js 16** · **React 19** · **TypeScript 5** · **Tailwind CSS v4** |
| 数据 | **SWR** · **Recharts** · **Sonner**（Toast） |
| 钱包 | **Wallet Standard** |
| 存储 | **IPFS（Pinata）** |
| 工具链 | **pnpm** · **ESLint 9** · **Prettier 3** |

---

## 🚀 快速开始

### 环境要求

- **Node.js** ≥ 20
- **pnpm** ≥ 9（`npm i -g pnpm`）
- **Rust**（stable 工具链）
- **Solana CLI** ≥ 1.18 ([安装](https://docs.solana.com/cli/install-solana-cli-tools))
- **Anchor CLI** 0.32.1（`avm install 0.32.1 && avm use 0.32.1`）

### 1. 克隆与安装

```bash
git clone https://github.com/rzexin/solana_scholarship_dao.git
cd solana_scholarship_dao
pnpm install
```

### 2. 配置环境变量

在项目根目录创建 `.env.local`：

```bash
# 仅服务端使用 —— /api/ipfs-upload 依赖
PINATA_JWT=your_pinata_jwt_here

# 可选：浏览器读取 IPFS 内容的自定义网关
NEXT_PUBLIC_IPFS_GATEWAY=https://gateway.pinata.cloud/ipfs/
```

> 可在 <https://app.pinata.cloud/developers/api-keys> 免费获取 Pinata JWT。

### 3. 构建 Anchor 合约并生成客户端

```bash
# 一键构建合约 + 从 IDL 重新生成 TypeScript 客户端
pnpm run setup
```

等价于：

```bash
pnpm run anchor-build   # cd anchor && anchor build
pnpm run codama:js      # codama run js  (IDL → app/generated/scholarship_dao)
```

### 4.（可选）部署到 Devnet

```bash
solana config set --url https://api.devnet.solana.com
solana airdrop 2
cd anchor
anchor deploy
```

若使用自有地址重新部署，请同时更新 `anchor/programs/scholarship_dao/src/lib.rs` 中的 `declare_id!` 以及 `anchor/Anchor.toml` 中的 `[programs.devnet]`，然后重新执行 `pnpm run setup` 以刷新生成的客户端代码。

### 5. 启动前端

```bash
pnpm dev
# → http://localhost:3000
```

### 6. 运行链上测试

```bash
pnpm run anchor-test
```

测试运行在 [LiteSVM](https://github.com/LiteSVM/litesvm) 上 —— 无需启动 validator，毫秒级反馈。

---

## 📚 合约 API

全部指令定义在 [`anchor/programs/scholarship_dao/src/lib.rs`](./anchor/programs/scholarship_dao/src/lib.rs)。

| 指令 | 签名者 | 说明 |
| --- | --- | --- |
| `initialize_dao` | creator | 创建 DAO PDA，参数包括 `vote_threshold`、`quorum`、`voting_period`（≥ 60 秒）、`min_donation`，以及 32 / 128 / 96 字节的定长 name / description / icon_uri。 |
| `donate` | donor | 向金库转入 SOL；首次捐赠时自动创建 `Member` PDA。 |
| `create_application` | proposer | 提交奖学金申请（金额、受益人、理由 ≤ 200 字符，proof_cid ≤ 64 字符）。**提案人无需是成员。** |
| `vote` | member | 投下赞成 / 反对票。由 `VoteRecord` PDA 强制"一人一票"，必须在 `voting_ends_at` 之前完成。 |
| `execute` | 任意 | 投票期结束后，若满足 **赞成票 > 反对票**、**赞成票 ≥ 阈值**、**总票数 ≥ 法定人数**，则在同一笔交易中从金库向受益人转账 `amount` lamports，并将申请标记为 `Executed`。 |
| `cancel_application` | 提案人或 admin | 取消一个 `Pending` 状态的申请。 |
| `update_dao_metadata` | admin | 修改 name / description / icon_uri 中的任意一项（均可选）。由 `has_one = admin` 强制。 |

### 错误码

`InvalidGovernanceParams` · `DonationTooSmall` · `NotAMember` · `ReasonTooLong` · `ProofCidTooLong` · `AmountMustBePositive` · `ApplicationNotPending` · `ThresholdNotMet` · `QuorumNotMet` · `VoteAgainstWins` · `VotingEnded` · `VotingNotEnded` · `InsufficientTreasury` · `RecipientMismatch` · `NotProposerOrAdmin` · `AmountOverflow`

---

## 🧪 常用脚本

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 启动 Next.js 开发服务器 |
| `pnpm build` | 生产环境构建 |
| `pnpm start` | 启动生产服务器 |
| `pnpm lint` | 运行 ESLint |
| `pnpm format` / `pnpm format:check` | 使用 Prettier 格式化代码 |
| `pnpm run anchor-build` | 构建 Anchor 合约 |
| `pnpm run anchor-test` | 运行 LiteSVM 测试 |
| `pnpm run codama:js` | 从 IDL 重新生成 TypeScript 客户端 |
| `pnpm run setup` | `anchor-build` + `codama:js` |
| `pnpm run ci` | `build` + `lint` + `format:check` |

---

## 📁 目录结构

```
solana_scholarship_dao/
├── anchor/                              # Anchor 工作区
│   ├── programs/scholarship_dao/
│   │   ├── src/
│   │   │   ├── lib.rs                   # 合约逻辑、账户、事件、错误码
│   │   │   └── tests.rs                 # LiteSVM 单元测试
│   │   └── Cargo.toml
│   ├── Anchor.toml
│   └── Cargo.toml
├── app/                                 # Next.js App Router
│   ├── page.tsx                         # 首页 / DAO 列表
│   ├── layout.tsx                       # 根布局（字体、Provider、Footer）
│   ├── dao/[address]/                   # 单个 DAO 工作台
│   │   ├── overview-tab.tsx
│   │   ├── proposals/                   # 列表 · 详情 · 新建
│   │   ├── treasury/                    # 金库余额曲线 + 捐赠者排行
│   │   ├── members/                     # 会员列表
│   │   ├── activity/                    # 事件流
│   │   └── settings/                    # 管理员元数据编辑
│   ├── me/                              # "我的工作台"
│   ├── api/ipfs-upload/route.ts         # Pinata 代理（Node runtime）
│   ├── components/                      # UI、图表、布局、DAO 业务组件
│   ├── lib/
│   │   ├── wallet/                      # Wallet Standard 集成
│   │   ├── hooks/                       # SWR 数据 hooks
│   │   ├── dao/                         # PDA 工具、字符串编解码、状态工具
│   │   ├── ipfs.ts                      # CID 校验 + 网关
│   │   └── solana-client.ts             # @solana/kit RPC 配置
│   └── generated/scholarship_dao/       # Codama 生成（请勿手动修改）
├── codama.json                          # IDL → TS 代码生成配置
├── next.config.ts
├── package.json
└── tsconfig.json
```

---

## 🛣️ 路线图

- [ ] 除原生 SOL 外，支持 SPL-Token（USDC）金库
- [ ] 基于捐赠历史的二次 / 加权投票
- [ ] 投票委托
- [ ] 提案评论 / 讨论串（链下，存 IPFS）
- [ ] Squads 多签对接管理员操作
- [ ] Mainnet-Beta 部署

---

## 🤝 参与贡献

欢迎任何形式的贡献！请遵循以下流程：

1. Fork 本仓库并创建特性分支：`git checkout -b feat/your-feature`。
2. 提交前运行 `pnpm run ci` —— 所有 commit 必须通过 `build` + `lint` + `format:check`。
3. 任何链上改动必须在 `anchor/programs/scholarship_dao/src/tests.rs` 中补充或更新测试。
4. 提交 PR 时请清晰说明动机与变更范围。

对于非平凡的改动，请先开 Issue 讨论设计。

---

## 📄 许可证

本项目以 **MIT 协议**发布，详见 [LICENSE](./LICENSE)。

---

## 🙏 致谢

- [Solana Labs](https://solana.com/) · [Anza](https://www.anza.xyz/) —— 运行时、RPC、`@solana/kit`
- [Coral-xyz / Anchor](https://www.anchor-lang.com/) —— 本合约的底层框架
- [Codama](https://github.com/codama-idl/codama) —— 基于 IDL 的 TypeScript 代码生成
- [LiteSVM](https://github.com/LiteSVM/litesvm) —— 快速、无头的测试运行时
- [Pinata](https://www.pinata.cloud/) —— IPFS 固定服务
- Built for **Solana Frontier**

---

<div align="center">

**Built with ❤️ on Solana**

[⬆ 回到顶部](#-scholarship-dao)

</div>
