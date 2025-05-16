# コーディング規約とReact Nativeプロジェクト構造

本ドキュメントでは、TimekeeperアプリケーションのReact Native開発におけるコーディング規約、プロジェクトのディレクトリ構造、およびその他の開発標準について定めます。
AIに開発を委任する際も、本ドキュメントに準拠するよう指示してください。

## 1. ディレクトリ構造 (案)

プロジェクトルート (`TimekeeperApp/`) 直下に以下の様な構造を推奨します。

```
TimekeeperApp/
├── android/                # Androidネイティブプロジェクト
├── ios/                    # iOSネイティブプロジェクト (今回は対象外だが標準で生成される)
├── src/
│   ├── assets/             # 画像、フォントなどの静的リソース
│   │   ├── images/
│   │   └── fonts/
│   ├── components/           # 再利用可能な共通UIコンポーネント
│   │   ├── common/           # アプリ全体で汎用的なコンポーネント (Button, Inputなど)
│   │   └── layout/           # レイアウト用コンポーネント (Container, Spacerなど)
│   ├── config/               # Firebase設定、環境変数などアプリ全体の設定
│   │   └── firebase.ts       # Firebase初期化処理
│   ├── contexts/             # React Context APIを使用する場合の状態管理ロジック
│   ├── hooks/                # カスタムReact Hooks
│   ├── navigation/           # React Navigationによる画面遷移定義
│   │   ├── AppNavigator.tsx
│   │   └── types.ts          # ナビゲーションの型定義
│   ├── screens/              # 各画面に対応するコンポーネント
│   │   ├── AuthLoadingScreen.tsx
│   │   ├── LoginScreen.tsx
│   │   ├── DepositScreen.tsx
│   │   ├── MainScreen.tsx
│   │   └── ... (その他画面)
│   ├── services/             # API連携、Firebaseとのやり取りなど外部サービスロジック
│   │   ├── authService.ts
│   │   ├── userService.ts
│   │   └── depositService.ts
│   ├── store/                # 状態管理ライブラリ(Zustand, Redux Toolkit)を使用する場合
│   │   ├── index.ts
│   │   └── slices/ (Redux Toolkitの場合)
│   ├── styles/               # 共通スタイル、テーマ定義
│   │   ├── theme.ts
│   │   └── globalStyles.ts
│   ├── utils/                # ヘルパー関数、ユーティリティ関数
│   │   └── validators.ts
│   └── App.tsx               # アプリケーションのルートコンポーネント
├── test/                   # Jestによる単体テスト、結合テスト
│   └── components/
│       └── Button.test.tsx
├── .env                    # 環境変数ファイル (Git管理外)
├── .eslintrc.js            # ESLint設定ファイル
├── .prettierrc.js          # Prettier設定ファイル
├── tsconfig.json           # TypeScript設定ファイル
├── babel.config.js         # Babel設定ファイル
├── Gemfile                 # (iOS CocoaPods用)
├── index.js                # React Nativeエントリーポイント
└── package.json
```

## 2. コーディング規約

*   **言語**: TypeScriptを全面的に採用します。型安全性を高め、AIによるコード生成・理解を助けます。
*   **フォーマット**: Prettierを導入し、コードフォーマットを自動化します。設定はプロジェクトルートの `.prettierrc.js` に記述します。
    *   例: `semi: true`, `singleQuote: true`, `tabWidth: 2`, `trailingComma: "all"` など。
*   **リンティング**: ESLintを導入し、コーディングスタイルと潜在的なバグを静的解析します。React NativeおよびTypeScript向けの推奨プラグイン（`eslint-plugin-react`, `eslint-plugin-react-hooks`, `@typescript-eslint/eslint-plugin`など）を利用します。
    *   設定はプロジェクトルートの `.eslintrc.js` に記述します。
*   **命名規則**:
    *   ファイル名: パスカルケース (`MyComponent.tsx`) またはキャメルケース (`myService.ts`)。コンポーネントはパスカルケースを推奨。
    *   コンポーネント名: パスカルケース (`MyComponent`)
    *   変数・関数名: キャメルケース (`myVariable`, `myFunction`)
    *   型・インターフェース名: パスカルケース (`MyType`, `IMyInterface` または `MyInterfaceProps`)
    *   定数名: 大文字スネークケース (`MAX_USERS`)
*   **コンポーネント設計**:
    *   Functional ComponentsとHooksを基本とします。
    *   コンポーネントは単一責任の原則を意識し、小さく保ちます。
    *   Propsは明確に型定義し、不要なPropsは渡しません。
    *   ロジックとUIは可能な範囲で分離します (カスタムフックの活用など)。
*   **コメント**: 複雑なロジックや、なぜそのような実装にしたのかという理由を説明するコメントを適切に残します。自明なコードに対するコメントは不要です。
*   **エラーハンドリング**: `try...catch`構文やPromiseの`.catch()`を適切に使用し、エラー発生時のユーザー体験を考慮した処理を実装します（エラーメッセージ表示、フォールバック処理など）。Firebaseのエラーコードも適切に処理します。

## 3. 状態管理

*   **ローカルな状態**: `useState` フックを使用します。
*   **コンポーネント間で共有される状態**:
    *   小規模な場合やprops drillingが少ない場合: React Context API。
    *   より複雑な状態管理が必要な場合: Zustand (シンプルで軽量) または Redux Toolkit (多機能、大規模向け)。
*   選択した状態管理ライブラリのベストプラクティスに従います。

## 4. ナビゲーション

*   React Navigationライブラリを使用します。
*   ナビゲーター（Stack, Tab, Drawerなど）を適切に組み合わせ、画面遷移を定義します。
*   画面遷移時のパラメータ渡しや、型安全性を高めるための型定義 (`src/navigation/types.ts`) を行います。

## 5. Firebase連携

*   Firebaseの初期化処理は `src/config/firebase.ts` に集約します。
*   各Firebaseサービス (Auth, Firestore, Functionsなど) とのやり取りは `src/services/` ディレクトリ内の対応するサービスファイルに分離します。
    *   例: `authService.ts` は認証関連の関数（ログイン、ログアウト、ユーザー登録など）を提供します。
*   非同期処理 (`async/await`) を適切に使用し、ローディング状態の管理やエラーハンドリングを行います。
*   Firestoreのデータアクセスでは、セキュリティルールを意識し、必要なクエリのみを発行します。

## 6. テスト

*   Jest と React Native Testing Library を用いた単体テスト・結合テストを記述します。
*   主要なコンポーネントのレンダリングテスト、インタラクションテストを行います。
*   カスタムフックやサービスクラスのロジックもテスト対象とします。
*   テストカバレッジを意識し、主要な機能がテストでカバーされるようにします。

## 7. Gitブランチ戦略 (例: Git Flowベース)

*   `main` (または `master`): リリース可能な安定バージョン。
*   `develop`: 次期リリースのための開発ブランチ。フィーチャーブランチのマージ先。
*   `feature/xxx`: 各機能開発のためのブランチ (`develop`から分岐)。
*   `release/vx.x.x`: リリース準備のためのブランチ (`develop`から分岐)。バグ修正のみ。
*   `hotfix/xxx`: 緊急のバグ修正のためのブランチ (`main`から分岐)。

## 8. コミットメッセージ規約 (例: Conventional Commits)

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```
*   **type**: `feat` (新機能), `fix` (バグ修正), `docs` (ドキュメント変更), `style` (コードスタイル変更), `refactor` (リファクタリング), `test` (テスト追加・修正), `chore` (ビルドプロセスや補助ツールの変更) など。
*   **例**:
    *   `feat: add user login screen`
    *   `fix(auth): correct password reset email link`
    *   `docs: update README with setup instructions`

## 9. その他

*   **環境変数**: APIキーやFirebase設定など、環境に依存する値は `.env` ファイルで管理し、Git管理対象外とします。`react-native-dotenv` などのライブラリを利用します。
*   **依存関係の管理**: `package.json` を適切に管理し、不要なライブラリは削除します。`npm audit` などで脆弱性を定期的に確認します。

以上の規約はプロジェクトの進行に合わせて見直し、改善していくものとします。 