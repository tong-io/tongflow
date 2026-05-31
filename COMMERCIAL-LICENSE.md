# Commercial License / 商业授权

> English below · 中文在前

---

## 中文

TongFlow 采用 **双授权(dual-licensing)** 模式发布:

| 授权 | 适用对象 | 费用 |
|---|---|---|
| **AGPL-3.0** | 个人、研究、开源项目,以及愿意遵守 AGPL 全部义务的使用者 | 免费 |
| **商业授权(本协议)** | 不愿/不能遵守 AGPL 的商业用户 | 来函洽询 |

### 你什么时候需要商业授权?

平台部分(`sdk/` 目录除外的全部代码)以 **AGPL-3.0** 开源。AGPL 第 13 条规定:
**任何人通过网络向用户提供经修改的 TongFlow 服务(包括 SaaS / 内部平台),都必须向这些用户公开其完整源代码,包括你自己的修改和集成代码。**

如果出现以下任一情况,你需要购买商业授权:

- 你要把 TongFlow(或其修改版)作为 **SaaS / 网络服务** 对外或对内提供,但**不希望公开**你的源代码;
- 你要把 TongFlow 集成进 **闭源产品** 并分发;
- 你的法务 / 合规政策**禁止使用 AGPL** 软件;
- 你需要 AGPL 不提供的**保证、赔偿条款或技术支持**。

> 注:`sdk/` 目录(发布到 PyPI 的 `tongflow` 包)单独以 **Apache-2.0** 授权,
> 编写第三方插件时无需商业授权。详见 [`sdk/LICENSE`](sdk/LICENSE)。

### 商业授权包含

- 在**专有 / 闭源**条件下使用、修改、部署 TongFlow 平台的权利,**无 AGPL 的源码公开义务**;
- **平台部分**的技术支持(见下方范围说明);
- 商业使用的法律确定性。

### 价格

价格按部署规模 / 团队规模 / 支持等级面议,最终以双方签署的书面授权合同为准。
请来函 **business@tongflow.com** 获取报价。

### 技术支持范围(仅平台部分)

**包含:**
- TongFlow 平台核心(`src/`、`config/`、构建与部署脚本)的缺陷修复与使用答疑;
- ABI 契约、节点系统、工作流导出器相关问题;
- 平台版本升级指导。

**不包含(除非另行约定):**
- 第三方插件(`plugins/` 目录)的开发与维护;
- 第三方模型 / API(如各模型供应商、Modal 等)本身的问题;
- 定制功能开发、私有部署实施、二次开发外包;
- 7×24 值班或特定 SLA(可单独商定)。

### 联系方式

商业授权咨询、报价与合同:**business@tongflow.com**

---

## English

TongFlow is released under a **dual-licensing** model:

| License | For | Cost |
|---|---|---|
| **AGPL-3.0** | Individuals, research, open-source projects, and anyone willing to comply with all AGPL obligations | Free |
| **Commercial License (this document)** | Commercial users who cannot or do not wish to comply with the AGPL | Contact us |

### When do you need a commercial license?

The platform (all code **except** the `sdk/` directory) is open-sourced under
**AGPL-3.0**. Under AGPL Section 13: **anyone who offers a modified TongFlow over
a network (including SaaS or an internal platform) must make the complete
corresponding source code available to those users — including your own
modifications and integration code.**

You need a commercial license if any of the following applies:

- You want to offer TongFlow (or a modified version) as a **SaaS / network
  service** without **disclosing your source code**;
- You want to integrate TongFlow into a **closed-source product** and distribute it;
- Your legal / compliance policy **prohibits AGPL** software;
- You need **warranties, indemnification, or support** that the AGPL does not provide.

> Note: the `sdk/` directory (the `tongflow` package published to PyPI) is
> separately licensed under **Apache-2.0**. Writing third-party plugins does
> **not** require a commercial license. See [`sdk/LICENSE`](sdk/LICENSE).

### What the commercial license includes

- The right to use, modify, and deploy the TongFlow platform under
  **proprietary / closed-source** terms, **without AGPL's source-disclosure
  obligation**;
- Technical support for the **platform** (scope below);
- Legal certainty for commercial use.

### Pricing

Pricing is quoted based on deployment / team size and support tier, and is set in
the signed written license agreement. Contact **business@tongflow.com** for a quote.

### Support scope (platform only)

**Included:**
- Bug fixes and usage guidance for the TongFlow platform core (`src/`, `config/`,
  build & deploy scripts);
- Questions about the ABI contract, node system, and workflow exporter;
- Guidance on platform version upgrades.

**Not included (unless separately agreed):**
- Development / maintenance of third-party plugins (`plugins/` directory);
- Issues in third-party models / APIs (model providers, Modal, etc.) themselves;
- Custom feature development, on-prem deployment implementation, or outsourced
  development;
- 24/7 on-call or specific SLAs (can be arranged separately).

### Contact

For commercial licensing inquiries, quotes, and contracts: **business@tongflow.com**
