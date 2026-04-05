# Replace-Solo (リプレイス・ソロ)

![version](https://img.shields.io/badge/version-0.4.0-blue)

〜データがブラウザの外に出ない、自分専用の固有名詞・一括置換ツール〜

## プロジェクト概要
Replace-Soloは、プライバシーを最優先に設計されたブラウザ完結型のテキスト置換ツールです。Microsoft LoopやGoogle Docsなどのリッチエディタ上で、議事録の固有名詞や特定の口癖を抽出し、一括置換することを目的としています。

## 特徴
- **完全ローカル実行**: 形態素解析（kuromoji.js）を含め、すべての処理をブラウザ内で行います。データが外部サーバーに送信されることはありません。
- **Material 3 デザイン**: Google Material 3 (M3) をベースとした、清潔感のある直感的なUI。
- **2つの置換モード**:
  - 入力エミュレーション (`document.execCommand('insertText')`)
  - DOM直接書き換え
- **辞書管理**: 独自の置換辞書をローカルに保存し、JSON形式でインポート/エクスポートが可能。

## インストール方法
1. このリポジトリをダウンロードまたはクローンします。
2. Chromeの拡張機能管理ページ (`chrome://extensions/`) を開きます。
3. 「デベロッパーモード」をONにします。
4. 「パッケージ化されていない拡張機能を読み込む」をクリックし、本プロジェクトのフォルダを選択します。

## 使い方
1. 置換を行いたいページ（Microsoft Loop等）を開きます。
2. 拡張機能アイコンをクリックしてサイドパネルを開きます。
3. 「解析実行」ボタンを押すと、ページ内の名詞が抽出されます。
4. 置換候補を入力し、「適用」にチェックを入れて「一括置換」または行ごとの「実行」ボタンを押します。

## 技術スタック
- Chrome Extension Manifest V3
- [kuromoji.js](https://github.com/takuyaa/kuromoji.js) (形態素解析)
- Vanilla JavaScript / HTML / CSS (Material 3 準拠)

## ライセンス
MIT License. 詳細は [LICENSE](LICENSE) を参照してください。
