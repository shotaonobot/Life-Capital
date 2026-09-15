# Life Capital iOS

Webの画面を同梱してオフラインで動くiOSプロジェクト。公開Siteへ接続するWebビューではない。共有コードの `dist/platform.js` を、ビルド時にネイティブ版へ置き換える。

## 機能

- Preferencesによる端末内保存。WebのlocalStorageとは別の保存領域。
- LocalNotificationsによる毎日の繰り返し通知。最大47枠で64件以内。許可は利用者が設定を保存した時だけ要求する。
- Appによる復帰検知、ShareとFilesystemによる週の数字・バックアップの持ち出し。
- データの送信、トラッキングSDK、アカウント登録なし。

## 開発

Node.js 22以上。Macでは[Capacitor公式要件](https://capacitorjs.com/docs/ios)に適合するXcodeを使う（確認時点ではXcode 26以上）。

```sh
cd native
npm ci
npm run sync
npm run open
```

Xcodeで所有者のTeamを設定する。Bundle ID `com.shotaono.lifecapital` は仮設定で、Appleに登録したものではない。登録済みのIDがある場合はcapacitor.config.jsonとXcodeの両方へ反映する。

生成済みのXcodeプロジェクトとPrivacy Manifestを追跡する。www、iOSのpublic、生成設定、node_modules、署名、証明書、プロビジョニングは追跡しない。クローン後は必ずnpm run syncを実行する。

## App Store向けドラフト

- 名前：Life Capital
- サブタイトル：大切な時間を取り戻す習慣
- カテゴリ案：仕事効率化
- 説明案：日々の時間を、まとめて簡単に記録。一週間168時間の使い方を振り返り、大切にしたいことへ少しずつ時間を使おう。タイマーは必要なときだけ。通知の間隔と時間帯も自分で選べます。ログイン不要、端末内保存、バックアップ対応。
- キーワード案：時間管理,習慣,振り返り,勉強,集中,睡眠,記録,タイマー
- サポート：既存GitHubのIssues（公開窓口）。ストア申請前に本人が受け取れる連絡先も確認する。
- Privacy Manifest：UserDefaults CA92.1、FileTimestamp C617.1。依存プラグインも含めて最終アーカイブのPrivacy Reportを確認する。

## 未完了の公開手順

1. Mac/Xcodeで実機ビルドし、通知の許可・拒否・ロック中・集中モード・時差変更を検証。
2. データ復元、画面の回転、文字拡大200%、VoiceOver、キーボード、低容量時を実機検証。
3. アイコン・起動画面・アニメーションを咲太と最終調整。現段階の資産を最終デザインと扱わない。
4. Apple Developer登録、Bundle ID、App Store Connectのアプリ作成と署名。アカウント登録や支払いは本人が行う。
5. App Store用スクリーンショット、年齢区分、サポート連絡先、プライバシー申告、輸出コンプライアンスを実際の配布ビルドに合わせて確定。
6. TestFlightで初回の外部ベータ審査、利用者テスト、修正後にApp Reviewへ提出。

参考：[Apple登録](https://developer.apple.com/programs/enroll/)、[TestFlight](https://developer.apple.com/testflight/)、[審査ガイドライン](https://developer.apple.com/app-store/review/guidelines/)、[通知](https://capacitorjs.com/docs/apis/local-notifications)、[保存](https://capacitorjs.com/docs/apis/preferences)。
