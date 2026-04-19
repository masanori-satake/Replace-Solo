# Security Policy / セキュリティポリシー (SECURITY.md)

## Supported Versions / サポート対象バージョン

現在、以下のバージョンについてセキュリティアップデートをサポートしています。

| Version | Supported |
| :------ | :-------- |
| Latest  | ✅        |
| < 0.1.0 | ❌        |

---

## Reporting a Vulnerability / 脆弱性の報告方法

セキュリティ上の脆弱性を発見された場合は、**GitHubのプライベート報告機能（Private Vulnerability Reporting）**を使用して報告してください。

### How to report / 報告手順:

1. GitHub.comで、リポジトリのメインページに移動します。
2. リポジトリ名の下にある「Security」をクリックします。
3. 左側のサイドバーで「Vulnerability reporting」をクリックします。
4. 「Report a vulnerability」をクリックします。
5. 詳細を記入し、「Submit report」をクリックします。

---

## Our Security Philosophy / セキュリティに関する設計指針

本プロジェクトでは、ユーザーのプライバシーとセキュリティを最優先し、以下の設計指針を採用しています。

### 1. Local-Only Architecture / 完全ローカル動作

Replace-Solo はブラウザ内で完結して動作します。すべてのデータはデバイス上の `chrome.storage.local` に保存され、外部サーバーへの通信は一切行われません。

### 2. Vanilla JS (Zero Dependencies) / Vanilla JS の採用

`kuromoji.js` を除く外部のフレームワークやライブラリに依存しないことで、依存関係の脆弱性やサプライチェーン攻撃のリスクを排除しています。コードの透明性が高く、セキュリティ監査も容易です。

### 3. Minimal Permissions / 最小限の権限

拡張機能の動作に必要な最小限の権限（`sidePanel`, `storage`, `scripting`, `activeTab`）のみを要求します。

---

## Disclaimer / 免責事項

詳細な免責事項については、README.md および LICENSE を参照してください。

本ソフトウェアは個人によるオープンソースプロジェクトであり、現状のまま（AS IS）提供されます。本ソフトウェアの使用によって生じた損害（データ消失、業務中断等）について、開発者は一切の責任を負いません。MITライセンスに基づき、自己責任でご利用ください。
