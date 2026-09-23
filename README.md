# Replace-Solo - Microsoft Loop対応 テキスト一括検索・置換

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/iblfnonogpkajjfjfljngdaclhdinlfb?logo=google-chrome&logoColor=white&label=Chrome%20Web%20Store)](https://chromewebstore.google.com/detail/replace-solo/iblfnonogpkajjfjfljngdaclhdinlfb)
[![version](https://img.shields.io/badge/version-1.2.3-blue)](projects/app/manifest.json)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Privacy: 100% Local](https://img.shields.io/badge/Privacy-100%25%20Local-brightgreen)](#-privacy--security)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-orange)](projects/app/manifest.json)
[![Tests](https://img.shields.io/github/actions/workflow/status/masanori-satake/Replace-Solo/code-quality.yml?branch=main&label=Tests)](https://github.com/masanori-satake/Replace-Solo/actions/workflows/code-quality.yml)
[![Pure Vanilla JS](https://img.shields.io/badge/Pure%20Vanilla%20JS-Zero%20Dependencies-informational?logo=javascript&logoColor=white)](#-privacy--security)
[![pre-commit.ci status](https://results.pre-commit.ci/badge/github/masanori-satake/Replace-Solo/main.svg)](https://results.pre-commit.ci/latest/github/masanori-satake/Replace-Solo/main)

〜ブラウザ内で処理が完結するMicrosoft Loop専用の置換ツール〜

## プロジェクト概要

Replace-Solo は、Microsoft Loop（`microsoft-loop`）上でテキストの一括置換（`text-replace`）を実現するプライバシー重視の Chrome 拡張機能（`chrome-extension`）です。標準機能では文字置換が行えない Microsoft Loop ページの議事録やドキュメント作成において、特定単語の更新作業を効率化し、生産性向上を支援するプロダクティビティツール（`productivity-tools`）です。

## 主な機能 (Key Features)

- **Microsoft Loop（`microsoft-loop`）専用設計**: 標準機能でテキスト置換が提供されていない Microsoft Loop に完全対応し、ワンクリックで一括置換（`text-replace`）を行います。
- **完全ローカル処理で安全**: 形態素解析を含め、すべてのテキスト処理をブラウザ内で完結。外部サーバーへデータが送信される心配がありません。
- **軽量かつ高精度な置換**: キー入力エミュレーション技術により、Microsoft Loop エディタの内部状態や取り消し履歴を壊さずに安全に文字を置き換えます。
- **柔軟な辞書・単語管理**: カスタム置換辞書をローカルに保持し、JSON 形式でのインポート/エクスポートに対応。
- **Copilot 連携プロンプト生成**: 登録された辞書データを活用し、Microsoft 365 Copilot に文字起こしの誤り修正を指示するためのプロンプトをワンクリック生成します。
- **Material 3 デザイン**: 直感的で洗練された Google Material 3 (M3) 準拠のサイドパネル UI。

## 🔒 Privacy & Security

Replace-Solo は、企業の機密情報や個人情報を扱う業務ドキュメントでも安心して利用できるよう、セキュリティとプライバシーを最優先に開発された Chrome 拡張機能（`chrome-extension`）です。

- **完全ローカル実行**: 形態素解析やテキスト検索・置換を含む全処理は、すべてユーザーのブラウザ（ローカル）上で実行されます。外部 API や外部サーバーとの通信は一切ありません。
- **外部通信なし（同梱ライブラリでローカル完結）**: 追跡スクリプトや外部通信を排除し、同梱の kuromoji.js を含むすべての処理をブラウザ内で完結させています。
- **ユーザーデータの収集ゼロ**: 閲覧履歴、入力テキスト、辞書データなどのユーザーデータを収集・追跡・送信することは一切ありません。

## インストール方法

1. [Chrome Web Store](https://chromewebstore.google.com/detail/replace-solo/iblfnonogpkajjfjfljngdaclhdinlfb?authuser=0&hl=ja) からインストールするか、本リポジトリからリリースパッケージをダウンロード/クローンして手動読み込みを行います。
2. リリースパッケージを手動読み込みする場合:
   1. Chromeの拡張機能管理ページ (`chrome://extensions/`) を開きます。
   2. 「デベロッパーモード」をONにします。
   3. 「パッケージ化されていない拡張機能を読み込む」をクリックし、ZIP 展開後に `manifest.json` が直接存在するフォルダを選択します。

## 使い方

1. 置換を行いたい Microsoft Loop ページ（`/p/` パス等）を開きます。
2. 拡張機能アイコンをクリックしてサイドパネルを開きます。
3. 「対象抽出」ボタンを押すと、ページ内の単語が抽出されます。
4. 置換文字列を入力し、「選択」にチェックを入れて「選択項目を一括置換」または行ごとの「置換」ボタンを押します。

## 技術スタック

- Chrome Extension Manifest V3
- [kuromoji.js](https://github.com/takuyaa/kuromoji.js) (形態素解析)
- Vanilla JavaScript / HTML / CSS (Material 3 準拠)

## ライセンス

MIT License. 詳細は [LICENSE](LICENSE) を参照してください。
